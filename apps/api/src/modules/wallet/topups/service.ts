import type {
  ConfirmTopUpResponse,
  CreateTopUpResponse,
  TopUpDetailResponse,
} from "@colokin/shared";
import { Prisma, type TopUp, type Wallet } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import {
  topUpAlreadyConfirmedError,
  topUpExpiredError,
  topUpNotFoundError,
  topUpQrInvalidError,
  validationError,
} from "../../../lib/api-error.js";
import { prisma } from "../../../lib/prisma.js";

const topUpExpiryMinutes = 15;

function iso(date: Date) {
  return date.toISOString();
}

function formatRupiah(amount: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildDummyQrPayload(topUpId: string, token: string) {
  return `colokin://topup/${topUpId}?token=${token}`;
}

function randomDemoToken() {
  return `demo_${randomBytes(18).toString("base64url")}`;
}

function parseTopUpPayload(payload: string) {
  try {
    const url = new URL(payload);
    const topUpId = url.pathname.replace(/^\//, "");
    const token = url.searchParams.get("token");

    if (url.protocol !== "colokin:" || url.hostname !== "topup" || !topUpId || !token) {
      return null;
    }

    return {
      token,
      topUpId,
    };
  } catch {
    return null;
  }
}

function toTopUpDetail(topUp: TopUp): TopUpDetailResponse {
  return {
    id: topUp.id,
    status: topUp.status,
    amount: topUp.amount,
    dummyQrPayload: topUp.dummyQrPayload,
    createdAt: iso(topUp.createdAt),
    confirmedAt: topUp.confirmedAt ? iso(topUp.confirmedAt) : null,
  };
}

export async function createTopUp(userId: string, amount: number): Promise<CreateTopUpResponse> {
  const expiresAt = new Date(Date.now() + topUpExpiryMinutes * 60 * 1000);
  const token = randomDemoToken();

  const topUp = await prisma.topUp.create({
    data: {
      userId,
      amount,
      status: "PENDING",
      dummyQrPayload: "pending",
      dummyQrTokenHash: hashToken(token),
      expiresAt,
    },
  });

  const dummyQrPayload = buildDummyQrPayload(topUp.id, token);
  const updatedTopUp = await prisma.topUp.update({
    where: { id: topUp.id },
    data: { dummyQrPayload },
  });

  return {
    topUpId: updatedTopUp.id,
    status: "PENDING",
    amount: updatedTopUp.amount,
    dummyQrPayload: updatedTopUp.dummyQrPayload,
    expiresAt: iso(expiresAt),
  };
}

export async function getTopUp(userId: string, topUpId: string): Promise<TopUpDetailResponse> {
  const topUp = await prisma.topUp.findFirst({
    where: {
      id: topUpId,
      userId,
    },
  });

  if (!topUp) {
    throw topUpNotFoundError();
  }

  return toTopUpDetail(topUp);
}

export async function confirmTopUp(
  userId: string,
  topUpId: string,
  dummyQrPayload: string,
): Promise<ConfirmTopUpResponse> {
  const parsedPayload = parseTopUpPayload(dummyQrPayload);
  if (!parsedPayload || parsedPayload.topUpId !== topUpId) {
    throw topUpQrInvalidError();
  }

  const existingTopUp = await prisma.topUp.findFirst({
    where: {
      id: topUpId,
      userId,
    },
  });

  if (!existingTopUp) {
    throw topUpNotFoundError();
  }

  if (existingTopUp.status === "SUCCESS") {
    throw topUpAlreadyConfirmedError();
  }

  if (
    existingTopUp.status === "PENDING" &&
    existingTopUp.expiresAt &&
    existingTopUp.expiresAt.getTime() <= Date.now()
  ) {
    await prisma.topUp.update({
      where: { id: existingTopUp.id },
      data: { status: "EXPIRED" },
    });
    throw topUpExpiredError();
  }

  return prisma.$transaction(async (tx) => {
    const topUp = await tx.topUp.findFirst({
      where: {
        id: topUpId,
        userId,
      },
    });

    if (!topUp) {
      throw topUpNotFoundError();
    }

    if (topUp.status === "SUCCESS") {
      throw topUpAlreadyConfirmedError();
    }

    if (topUp.status !== "PENDING") {
      throw validationError("Top up cannot be confirmed from its current status.", {
        status: topUp.status,
      });
    }

    if (topUp.expiresAt && topUp.expiresAt.getTime() <= Date.now()) {
      await tx.topUp.update({
        where: { id: topUp.id },
        data: { status: "EXPIRED" },
      });
      throw topUpExpiredError();
    }

    if (
      topUp.dummyQrPayload !== dummyQrPayload ||
      topUp.dummyQrTokenHash !== hashToken(parsedPayload.token)
    ) {
      throw topUpQrInvalidError();
    }

    const wallet = await creditWallet(tx, userId, topUp.amount);
    const walletTransaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "TOP_UP",
        amount: topUp.amount,
        direction: "CREDIT",
        status: "SUCCESS",
        referenceType: "TOP_UP",
        referenceId: topUp.id,
      },
    });

    const confirmedAt = new Date();
    const confirmedTopUp = await tx.topUp.update({
      where: { id: topUp.id },
      data: {
        status: "SUCCESS",
        confirmedAt,
        walletTransactionId: walletTransaction.id,
      },
    });

    const notification = await tx.notification.create({
      data: {
        userId,
        type: "TOP_UP_SUCCESS",
        title: "Top Up Success",
        message: `${formatRupiah(topUp.amount)} has been added to your Colok.in wallet.`,
        relatedTransactionId: walletTransaction.id,
      },
    });

    return {
      id: confirmedTopUp.id,
      status: "SUCCESS",
      amount: confirmedTopUp.amount,
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency as "IDR",
      },
      walletTransactionId: walletTransaction.id,
      notificationId: notification.id,
      createdAt: iso(confirmedTopUp.createdAt),
      confirmedAt: iso(confirmedAt),
    };
  });
}

async function creditWallet(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
): Promise<Wallet> {
  return tx.wallet.upsert({
    where: { userId },
    update: {
      balance: {
        increment: amount,
      },
    },
    create: {
      userId,
      balance: amount,
      currency: "IDR",
    },
  });
}
