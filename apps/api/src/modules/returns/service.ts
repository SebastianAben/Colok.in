import type {
  ConfirmReturnResponse,
  PayReturnFineResponse,
  ReturnDetailResponse,
} from "@colokin/shared";
import type { Prisma } from "@prisma/client";
import {
  forbiddenError,
  insufficientBalanceError,
  noActiveRentalError,
  returnNotVerifiedError,
  walletChargeFailedError,
} from "../../lib/api-error.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { openReturnCompartment } from "../iot/adapter.js";
import { sendPushToUser } from "../notifications/service.js";
import { calculateReturnTiming } from "../rentals/service.js";

const sensorTimeoutMinutes = 3;

type Tx = Prisma.TransactionClient;

type ReturnSessionForResponse = Prisma.ReturnSessionGetPayload<{
  include: {
    rental: true;
    returnCompartment: true;
    returnLocker: true;
  };
}>;

function iso(date: Date) {
  return date.toISOString();
}

function toReturnDetail(returnSession: ReturnSessionForResponse): ReturnDetailResponse {
  return {
    id: returnSession.id,
    rentalId: returnSession.rentalId,
    status: returnSession.status,
    verifiedAt: returnSession.verifiedAt ? iso(returnSession.verifiedAt) : null,
    finalFee: returnSession.rental.totalFee,
    fine: returnSession.rental.fine,
    returnLocation: returnSession.returnLocker.name,
    compartmentNumber: returnSession.returnCompartment.number,
    returnedAt: returnSession.rental.returnedAt ? iso(returnSession.rental.returnedAt) : null,
  };
}

async function getOwnedReturnSession(tx: Tx, userId: string, returnSessionId: string) {
  const returnSession = await tx.returnSession.findUnique({
    where: { id: returnSessionId },
    include: {
      rental: true,
      returnCompartment: true,
      returnLocker: true,
    },
  });

  if (!returnSession) {
    throw noActiveRentalError();
  }

  if (returnSession.rental.userId !== userId) {
    throw forbiddenError();
  }

  return returnSession;
}

async function findFinePayment(tx: Tx, rentalId: string) {
  return tx.walletTransaction.findFirst({
    where: {
      referenceId: rentalId,
      referenceType: "RENTAL_FINE",
      status: "SUCCESS",
      type: "FINE_PAYMENT",
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function payReturnFine(
  userId: string,
  returnSessionId: string,
): Promise<PayReturnFineResponse> {
  return prisma.$transaction(async (tx) => {
    const returnSession = await getOwnedReturnSession(tx, userId, returnSessionId);
    const timing = calculateReturnTiming(returnSession.rental.dueAt);
    const existingPayment = await findFinePayment(tx, returnSession.rentalId);
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw insufficientBalanceError();
    }

    if (timing.fine === 0) {
      return {
        returnSessionId,
        fine: 0,
        paid: true,
        walletBalance: wallet.balance,
        walletTransactionId: existingPayment?.id ?? null,
      };
    }

    if (existingPayment) {
      return {
        returnSessionId,
        fine: returnSession.rental.fine || timing.fine,
        paid: true,
        walletBalance: wallet.balance,
        walletTransactionId: existingPayment.id,
      };
    }

    if (wallet.balance < timing.fine) {
      throw insufficientBalanceError();
    }

    const chargedWallet = await tx.wallet.updateMany({
      where: {
        id: wallet.id,
        balance: {
          gte: timing.fine,
        },
      },
      data: {
        balance: {
          decrement: timing.fine,
        },
      },
    });

    if (chargedWallet.count !== 1) {
      throw walletChargeFailedError();
    }

    const walletTransaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "FINE_PAYMENT",
        amount: timing.fine,
        direction: "DEBIT",
        status: "SUCCESS",
        referenceType: "RENTAL_FINE",
        referenceId: returnSession.rentalId,
      },
    });

    await tx.rental.update({
      where: { id: returnSession.rentalId },
      data: {
        fine: timing.fine,
        totalFee: returnSession.rental.rentFee + timing.fine,
      },
    });

    return {
      returnSessionId,
      fine: timing.fine,
      paid: true,
      walletBalance: wallet.balance - timing.fine,
      walletTransactionId: walletTransaction.id,
    };
  });
}

export async function confirmReturn(
  userId: string,
  returnSessionId: string,
): Promise<ConfirmReturnResponse> {
  const returnSession = await prisma.$transaction(async (tx) => {
    const session = await getOwnedReturnSession(tx, userId, returnSessionId);
    const timing = calculateReturnTiming(session.rental.dueAt);
    const finePayment = await findFinePayment(tx, session.rentalId);

    if (timing.fine > 0 && !finePayment) {
      throw returnNotVerifiedError("Fine payment is required before confirming return.");
    }

    const now = new Date();
    const sensorTimeoutAt = new Date(now.getTime() + sensorTimeoutMinutes * 60 * 1000);

    return tx.returnSession.update({
      where: { id: returnSessionId },
      data: {
        openedAt: now,
        sensorTimeoutAt,
        status: "WAITING_FOR_SENSOR",
        rental: {
          update: {
            status: "WAITING_FOR_SENSOR",
          },
        },
        returnCompartment: {
          update: {
            status: "RETURN_OPEN",
          },
        },
      },
      include: {
        rental: true,
        returnCompartment: true,
        returnLocker: true,
      },
    });
  });

  try {
    await openReturnCompartment({
      compartmentId: returnSession.returnCompartmentId,
      compartmentNumber: returnSession.returnCompartment.number,
      lockerId: returnSession.returnLockerId,
      returnSessionId,
    });
  } catch {
    await prisma.$transaction(async (tx) => {
      await tx.returnSession.update({
        where: { id: returnSessionId },
        data: {
          status: "FAILED",
        },
      });
      await tx.rental.update({
        where: { id: returnSession.rentalId },
        data: {
          status: "RETURN_REQUESTED",
        },
      });
      await tx.compartment.update({
        where: { id: returnSession.returnCompartmentId },
        data: {
          status: "EMPTY",
        },
      });
    });

    throw returnNotVerifiedError("Return locker could not be opened. Please try again.");
  }

  return {
    returnSessionId: returnSession.id,
    status: returnSession.status,
    locker: {
      id: returnSession.returnLocker.id,
      name: returnSession.returnLocker.name,
    },
    compartmentNumber: returnSession.returnCompartment.number,
    sensorTimeoutAt: iso(returnSession.sensorTimeoutAt!),
  };
}

export async function getReturnSession(
  userId: string,
  returnSessionId: string,
): Promise<ReturnDetailResponse> {
  const result = await prisma.$transaction(async (tx) => {
    const session = await getOwnedReturnSession(tx, userId, returnSessionId);

    if (session.status !== "WAITING_FOR_SENSOR") {
      return {
        notification: null,
        session,
      };
    }

    if (session.sensorTimeoutAt && session.sensorTimeoutAt.getTime() <= Date.now()) {
      const timedOut = await tx.returnSession.update({
        where: { id: session.id },
        data: {
          rental: {
            update: {
              status: "FAILED",
            },
          },
          returnCompartment: {
            update: {
              currentCableUnitId: null,
              lastSensorState: "CABLE_ABSENT",
              status: "EMPTY",
            },
          },
          status: "FAILED",
        },
        include: {
          rental: true,
          returnCompartment: true,
          returnLocker: true,
        },
      });

      await tx.cableUnit.update({
        where: { id: session.rental.cableUnitId },
        data: {
          currentCompartmentId: null,
          currentLockerId: null,
          status: "LOST",
        },
      });

      return {
        notification: null,
        session: timedOut,
      };
    }

    if (env.IOT_MODE !== "mock") {
      return {
        notification: null,
        session,
      };
    }

    return verifyReturn(tx, session);
  });

  if (result.notification) {
    await sendPushToUser(userId, {
      title: result.notification.title,
      body: result.notification.message,
      data: {
        notificationId: result.notification.id,
        relatedRentalId: result.session.rentalId,
        routeHint: "transactions",
        type: "RETURN_SUCCESS",
      },
    });
  }

  return toReturnDetail(result.session);
}

async function verifyReturn(tx: Tx, session: ReturnSessionForResponse) {
  const now = new Date();
  const fine = session.rental.fine;
  const totalFee = session.rental.rentFee + fine;

  const updatedSession = await tx.returnSession.update({
    where: { id: session.id },
    data: {
      status: "VERIFIED",
      verifiedAt: now,
      rental: {
        update: {
          fine,
          returnedAt: now,
          status: "RETURNED",
          totalFee,
        },
      },
      returnCompartment: {
        update: {
          currentCableUnitId: session.rental.cableUnitId,
          lastSensorState: "CABLE_PRESENT",
          status: "AVAILABLE",
        },
      },
    },
    include: {
      rental: true,
      returnCompartment: true,
      returnLocker: true,
    },
  });

  if (session.rental.compartmentId !== session.returnCompartmentId) {
    await tx.compartment.update({
      where: { id: session.rental.compartmentId },
      data: {
        currentCableUnitId: null,
        lastSensorState: "CABLE_ABSENT",
        status: "EMPTY",
      },
    });
  }

  await tx.cableUnit.update({
    where: { id: session.rental.cableUnitId },
    data: {
      currentCompartmentId: session.returnCompartmentId,
      currentLockerId: session.returnLockerId,
      status: "AVAILABLE",
    },
  });

  const notification = await tx.notification.create({
    data: {
      userId: session.rental.userId,
      type: "RETURN_SUCCESS",
      title: "Return Success",
      message: `You have successfully returned the extension cable at ${session.returnLocker.name}.`,
      relatedRentalId: session.rentalId,
    },
  });

  return {
    notification,
    session: updatedSession,
  };
}
