import type { TransactionsResponse } from "@colokin/shared";
import { prisma } from "../../lib/prisma.js";

function iso(date: Date) {
  return date.toISOString();
}

function walletTransactionTitle(type: string) {
  switch (type) {
    case "TOP_UP":
      return "Top Up";
    case "RENT_PAYMENT":
      return "Rent Payment";
    case "FINE_PAYMENT":
      return "Fine Payment";
    case "REFUND":
      return "Refund";
    default:
      return "Wallet Transaction";
  }
}

export async function listTransactions(userId: string): Promise<TransactionsResponse> {
  const [rentals, walletTransactions] = await Promise.all([
    prisma.rental.findMany({
      where: {
        userId,
        status: "RETURNED",
      },
      include: {
        locker: true,
      },
      orderBy: {
        returnedAt: "desc",
      },
    }),
    prisma.walletTransaction.findMany({
      where: {
        status: "SUCCESS",
        wallet: {
          userId,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  return [
    ...rentals.map((rental) => ({
      id: rental.id,
      type: "RENTAL" as const,
      status: rental.status,
      locationName: rental.locker.name,
      totalRentFee: rental.totalFee,
      startRentAt: iso(rental.startedAt),
      returnedAt: rental.returnedAt ? iso(rental.returnedAt) : null,
      completedAt: rental.returnedAt ? iso(rental.returnedAt) : null,
      durationMinutes: rental.durationMinutes,
      fine: rental.fine,
    })),
    ...walletTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      title: walletTransactionTitle(transaction.type),
      amount: transaction.amount,
      direction: transaction.direction,
      status: transaction.status,
      completedAt: iso(transaction.createdAt),
      referenceId: transaction.referenceId,
      referenceType: transaction.referenceType,
    })),
  ].sort((left, right) => {
    const leftCompletedAt =
      "completedAt" in left && left.completedAt ? Date.parse(left.completedAt) : 0;
    const rightCompletedAt =
      "completedAt" in right && right.completedAt ? Date.parse(right.completedAt) : 0;
    return rightCompletedAt - leftCompletedAt;
  });
}
