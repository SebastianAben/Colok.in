import type { TransactionsResponse } from "@colokin/shared";
import { prisma } from "../../lib/prisma.js";

function iso(date: Date) {
  return date.toISOString();
}

export async function listTransactions(userId: string): Promise<TransactionsResponse> {
  const rentals = await prisma.rental.findMany({
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
  });

  return rentals.map((rental) => ({
    id: rental.id,
    type: "RENTAL",
    status: rental.status,
    locationName: rental.locker.name,
    totalRentFee: rental.totalFee,
    startRentAt: iso(rental.startedAt),
    returnedAt: rental.returnedAt ? iso(rental.returnedAt) : null,
    durationMinutes: rental.durationMinutes,
    fine: rental.fine,
  }));
}
