import type {
  ActiveRentalResponse,
  RentalDetailResponse,
  RentalQuoteResponse,
  ReturnIntentResponse,
} from "@colokin/shared";
import { Prisma, type RentalStatus } from "@prisma/client";
import {
  forbiddenError,
  insufficientBalanceError,
  lockerNotFoundError,
  lockerOfflineError,
  noActiveRentalError,
  noCableAvailableError,
  qrInvalidError,
  returnNotVerifiedError,
  unlockFailedError,
  userHasActiveRentalError,
  validationError,
  walletChargeFailedError,
} from "../../lib/api-error.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { unlockCompartment } from "../iot/adapter.js";
import { sendPushToUser } from "../notifications/service.js";

const activeRentalStatuses: RentalStatus[] = [
  "UNLOCKING",
  "ACTIVE",
  "RETURN_REQUESTED",
  "WAITING_FOR_SENSOR",
  "LATE",
];

const hourlyRentFee = 25_000;
const graceToleranceMinutes = 15;
const minimumDurationMinutes = 30;
const maximumDurationMinutes = 360;
const durationStepMinutes = 30;
export const rentalUnlockTimeoutMs = 60_000;

type Tx = Prisma.TransactionClient;

type LockerForRental = Prisma.LockerGetPayload<{
  include: {
    compartments: {
      orderBy: {
        number: "asc";
      };
    };
    cableUnits: true;
  };
}>;

type RentalForResponse = Prisma.RentalGetPayload<{
  include: {
    locker: true;
    compartment: true;
  };
}>;

function iso(date: Date) {
  return date.toISOString();
}

function validateDuration(durationMinutes: number) {
  if (
    durationMinutes < minimumDurationMinutes ||
    durationMinutes > maximumDurationMinutes ||
    durationMinutes % durationStepMinutes !== 0
  ) {
    throw validationError(
      "Rental duration must be between 30 and 360 minutes in 30-minute steps.",
      {
        durationMinutes,
        maximumDurationMinutes,
        minimumDurationMinutes,
        stepMinutes: durationStepMinutes,
      },
    );
  }
}

function calculateRentFee(durationMinutes: number) {
  return Math.ceil((durationMinutes * hourlyRentFee) / 60);
}

function calculateReturnTiming(dueAt: Date, now = new Date()) {
  const timeLeftSeconds = Math.max(0, Math.floor((dueAt.getTime() - now.getTime()) / 1000));
  const lateBySeconds = Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 1000));
  const billableLateSeconds = Math.max(
    0,
    Math.floor((now.getTime() - (dueAt.getTime() + graceToleranceMinutes * 60 * 1000)) / 1000),
  );
  const fine =
    billableLateSeconds === 0 ? 0 : Math.ceil((billableLateSeconds * hourlyRentFee) / 3600);

  return {
    fine,
    lateBySeconds,
    timeLeftSeconds,
  };
}

function availableCompartments(locker: LockerForRental) {
  const availableCableUnitByCompartmentId = new Map(
    locker.cableUnits
      .filter(
        (cableUnit) =>
          cableUnit.status === "AVAILABLE" &&
          cableUnit.currentLockerId === locker.id &&
          cableUnit.currentCompartmentId,
      )
      .map((cableUnit) => [cableUnit.currentCompartmentId, cableUnit]),
  );

  return locker.compartments
    .filter((compartment) => {
      const cableUnit = availableCableUnitByCompartmentId.get(compartment.id);
      return (
        (env.IOT_MODE === "mock" || [1, 2].includes(compartment.number)) &&
        compartment.status === "AVAILABLE" &&
        compartment.lastSensorState === "CABLE_PRESENT" &&
        compartment.currentCableUnitId &&
        cableUnit?.id === compartment.currentCableUnitId
      );
    })
    .map((compartment) => ({
      compartment,
      cableUnit: availableCableUnitByCompartmentId.get(compartment.id)!,
    }));
}

function toRentalDetail(rental: RentalForResponse, unlockRequestId?: string): RentalDetailResponse {
  return {
    id: rental.id,
    status: rental.status,
    locker: {
      id: rental.locker.id,
      name: rental.locker.name,
    },
    compartmentNumber: rental.compartment.number,
    startedAt: iso(rental.startedAt),
    dueAt: iso(rental.dueAt),
    rentFee: rental.rentFee,
    unlockRequestId,
  };
}

function toActiveRental(rental: RentalForResponse): NonNullable<ActiveRentalResponse> {
  const serverNow = new Date();
  const timeLeftSeconds = Math.max(
    0,
    Math.floor((rental.dueAt.getTime() - serverNow.getTime()) / 1000),
  );

  return {
    id: rental.id,
    status: rental.status,
    locker: {
      id: rental.locker.id,
      name: rental.locker.name,
    },
    compartmentNumber: rental.compartment.number,
    startedAt: iso(rental.startedAt),
    dueAt: iso(rental.dueAt),
    serverNow: iso(serverNow),
    timeLeftSeconds,
    estimatedFee: rental.rentFee,
    fine: rental.fine,
  };
}

async function findLockerForRental(tx: Tx, lockerId: string) {
  const locker = await tx.locker.findUnique({
    where: { id: lockerId },
    include: {
      compartments: {
        orderBy: {
          number: "asc",
        },
      },
      cableUnits: true,
    },
  });

  if (!locker) {
    throw lockerNotFoundError();
  }

  if (locker.status !== "ONLINE") {
    throw lockerOfflineError();
  }

  return locker;
}

async function assertNoActiveRental(tx: Tx, userId: string) {
  await cleanupExpiredUnlockingRentals(userId, tx);

  const activeRental = await tx.rental.findFirst({
    where: {
      userId,
      status: {
        in: activeRentalStatuses,
      },
    },
    select: {
      id: true,
    },
  });

  if (activeRental) {
    throw userHasActiveRentalError();
  }
}

export async function expireUnlockingRental(tx: Tx, rentalId: string) {
  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
  });

  if (
    !rental ||
    rental.status !== "UNLOCKING" ||
    Date.now() - rental.createdAt.getTime() < rentalUnlockTimeoutMs
  ) {
    return null;
  }

  const compartment = await tx.compartment.findUnique({
    where: { id: rental.compartmentId },
    select: { lastSensorState: true, status: true },
  });

  if (compartment?.lastSensorState === "CABLE_ABSENT" && compartment.status === "EMPTY") {
    await activateUnlockedRental(tx, rental.id);
    return rental.id;
  }

  await failUnlockingRental(tx, rental.id);

  return rental.id;
}

async function failUnlockingRental(tx: Tx, rentalId: string) {
  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
  });

  if (!rental) {
    return null;
  }

  await tx.rental.update({
    where: { id: rental.id },
    data: { status: "FAILED" },
  });

  await tx.compartment.update({
    where: { id: rental.compartmentId },
    data: {
      currentCableUnitId: rental.cableUnitId,
      lastSensorState: "CABLE_PRESENT",
      status: "AVAILABLE",
    },
  });
  await tx.cableUnit.update({
    where: { id: rental.cableUnitId },
    data: {
      currentCompartmentId: rental.compartmentId,
      currentLockerId: rental.lockerId,
      status: "AVAILABLE",
    },
  });

  return rental.id;
}

export async function activateUnlockedRental(tx: Tx, rentalId: string) {
  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
  });

  if (!rental || rental.status !== "UNLOCKING") {
    return null;
  }

  const chargedWallet = await tx.wallet.updateMany({
    where: {
      userId: rental.userId,
      balance: {
        gte: rental.rentFee,
      },
    },
    data: {
      balance: {
        decrement: rental.rentFee,
      },
    },
  });

  if (chargedWallet.count !== 1) {
    await failUnlockingRental(tx, rental.id);
    return null;
  }

  const wallet = await tx.wallet.findUniqueOrThrow({
    where: { userId: rental.userId },
  });
  const walletTransaction = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "RENT_PAYMENT",
      amount: rental.rentFee,
      direction: "DEBIT",
      status: "SUCCESS",
      referenceType: "RENTAL",
      referenceId: rental.id,
    },
  });

  const activatedRental = await tx.rental.update({
    where: { id: rental.id },
    data: { status: "ACTIVE" },
    include: {
      locker: true,
      compartment: true,
    },
  });

  await tx.compartment.update({
    where: { id: rental.compartmentId },
    data: {
      currentCableUnitId: null,
      lastSensorState: "CABLE_ABSENT",
      status: "EMPTY",
    },
  });
  await tx.cableUnit.update({
    where: { id: rental.cableUnitId },
    data: {
      currentCompartmentId: null,
      currentLockerId: null,
      status: "RENTED",
    },
  });

  await tx.notification.updateMany({
    where: {
      relatedRentalId: rental.id,
      type: "RENT_SUCCESS",
    },
    data: {
      relatedTransactionId: walletTransaction.id,
    },
  });

  return {
    rental: activatedRental,
    walletTransactionId: walletTransaction.id,
  };
}

export async function cleanupExpiredUnlockingRentals(userId: string, tx: Tx = prisma) {
  const expiredRentals = await tx.rental.findMany({
    where: {
      userId,
      status: "UNLOCKING",
      createdAt: {
        lte: new Date(Date.now() - rentalUnlockTimeoutMs),
      },
    },
    select: {
      id: true,
    },
  });

  for (const rental of expiredRentals) {
    await expireUnlockingRental(tx, rental.id);
  }
}

export async function createRentalQuote(
  userId: string,
  input: {
    durationMinutes: number;
    lockerId: string;
  },
): Promise<RentalQuoteResponse> {
  validateDuration(input.durationMinutes);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (!user || user.status !== "ACTIVE") {
    throw forbiddenError("Only active users can create rentals.");
  }

  await assertNoActiveRental(prisma, userId);
  const locker = await findLockerForRental(prisma, input.lockerId);
  const availableCableCount = availableCompartments(locker).length;

  if (availableCableCount === 0) {
    throw noCableAvailableError();
  }

  const rentFee = calculateRentFee(input.durationMinutes);

  return {
    lockerId: locker.id,
    locationName: locker.name,
    durationMinutes: input.durationMinutes,
    rentFee,
    depositAmount: 0,
    totalCharge: rentFee,
    availableCableCount,
  };
}

export async function createRental(
  userId: string,
  input: {
    compartmentId?: string;
    durationMinutes: number;
    lockerId: string;
    paymentSource: "WALLET";
  },
): Promise<RentalDetailResponse> {
  validateDuration(input.durationMinutes);

  if (input.paymentSource !== "WALLET") {
    throw validationError("Only wallet payment is supported for MVP rentals.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });

    if (!user || user.status !== "ACTIVE") {
      throw forbiddenError("Only active users can create rentals.");
    }

    await assertNoActiveRental(tx, userId);
    const locker = await findLockerForRental(tx, input.lockerId);
    const available = availableCompartments(locker);
    const selected = input.compartmentId
      ? available.find(({ compartment }) => compartment.id === input.compartmentId)
      : available[0];

    if (!selected) {
      if (
        input.compartmentId &&
        locker.compartments.some((compartment) => compartment.id === input.compartmentId)
      ) {
        throw qrInvalidError("Requested compartment is not available.");
      }

      if (input.compartmentId) {
        throw qrInvalidError("Requested compartment does not belong to this locker.");
      }

      throw noCableAvailableError();
    }

    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });
    const rentFee = calculateRentFee(input.durationMinutes);

    if (!wallet || wallet.balance < rentFee) {
      throw insufficientBalanceError();
    }

    const startedAt = new Date();
    const dueAt = new Date(startedAt.getTime() + input.durationMinutes * 60 * 1000);
    const rental = await tx.rental.create({
      data: {
        userId,
        lockerId: locker.id,
        compartmentId: selected.compartment.id,
        cableUnitId: selected.cableUnit.id,
        status: "UNLOCKING",
        durationMinutes: input.durationMinutes,
        startedAt,
        dueAt,
        rentFee,
        totalFee: rentFee,
      },
    });

    await tx.compartment.update({
      where: { id: selected.compartment.id },
      data: {
        lastSensorState:
          env.IOT_MODE === "mock" ? "CABLE_ABSENT" : selected.compartment.lastSensorState,
        status: "RENTED",
      },
    });

    await tx.cableUnit.update({
      where: { id: selected.cableUnit.id },
      data: {
        status: "RENTED",
      },
    });

    const notification = await tx.notification.create({
      data: {
        userId,
        type: "RENT_SUCCESS",
        title: "Rent Success",
        message: "Extension cable successfully unlocked. Your rental session has started.",
        relatedRentalId: rental.id,
      },
    });

    return {
      cableUnitId: selected.cableUnit.id,
      compartmentId: selected.compartment.id,
      compartmentNumber: selected.compartment.number,
      rentalId: rental.id,
      notificationId: notification.id,
    };
  });

  try {
    const unlockResult = await unlockCompartment({
      compartmentId: created.compartmentId,
      compartmentNumber: created.compartmentNumber,
      lockerId: input.lockerId,
      rentalId: created.rentalId,
    });

    if (env.IOT_MODE !== "mock") {
      const rental = await prisma.rental.findUniqueOrThrow({
        where: { id: created.rentalId },
        include: {
          locker: true,
          compartment: true,
        },
      });

      return toRentalDetail(rental, unlockResult.unlockRequestId);
    }

    const activation = await prisma.$transaction(async (tx) => {
      return activateUnlockedRental(tx, created.rentalId);
    });

    if (!activation) {
      throw walletChargeFailedError();
    }

    await sendPushToUser(userId, {
      title: "Rent Success",
      body: "Extension cable successfully unlocked. Your rental session has started.",
      data: {
        notificationId: created.notificationId,
        relatedRentalId: created.rentalId,
        relatedTransactionId: activation.walletTransactionId,
        routeHint: "transactions",
        type: "RENT_SUCCESS",
      },
    });

    return toRentalDetail(activation.rental, unlockResult.unlockRequestId);
  } catch {
    await compensateFailedUnlock(created.rentalId);
    throw unlockFailedError();
  }
}

async function compensateFailedUnlock(rentalId: string) {
  await prisma.$transaction(async (tx) => {
    await failUnlockingRental(tx, rentalId);
  });
}

export async function getActiveRental(userId: string): Promise<ActiveRentalResponse> {
  await prisma.$transaction(async (tx) => {
    await cleanupExpiredUnlockingRentals(userId, tx);
  });

  const rental = await prisma.rental.findFirst({
    where: {
      userId,
      status: {
        in: activeRentalStatuses,
      },
    },
    include: {
      locker: true,
      compartment: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!rental) {
    return null;
  }

  if (rental.status === "ACTIVE" && rental.dueAt.getTime() <= Date.now()) {
    const lateRental = await prisma.rental.update({
      where: { id: rental.id },
      data: { status: "LATE" },
      include: {
        locker: true,
        compartment: true,
      },
    });

    return toActiveRental(lateRental);
  }

  return toActiveRental(rental);
}

export async function getRental(userId: string, rentalId: string): Promise<RentalDetailResponse> {
  await prisma.$transaction(async (tx) => {
    await cleanupExpiredUnlockingRentals(userId, tx);
  });

  const rental = await prisma.rental.findUnique({
    where: { id: rentalId },
    include: {
      locker: true,
      compartment: true,
    },
  });

  if (!rental) {
    throw noActiveRentalError();
  }

  if (rental.userId !== userId) {
    throw forbiddenError();
  }

  return toRentalDetail(rental);
}

export async function createReturnIntent(
  userId: string,
  rentalId: string,
  input: {
    lockerId?: string;
  },
): Promise<ReturnIntentResponse> {
  return prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findUnique({
      where: { id: rentalId },
      include: {
        locker: true,
      },
    });

    if (!rental) {
      throw noActiveRentalError();
    }

    if (rental.userId !== userId) {
      throw forbiddenError();
    }

    const now = new Date();
    const currentStatus =
      rental.status === "ACTIVE" && rental.dueAt.getTime() <= now.getTime()
        ? "LATE"
        : rental.status;

    if (!["ACTIVE", "LATE", "RETURN_REQUESTED"].includes(currentStatus)) {
      throw returnNotVerifiedError("This rental cannot be returned.");
    }

    const returnLockerId = input.lockerId ?? rental.lockerId;
    const returnLocker = await tx.locker.findUnique({
      where: { id: returnLockerId },
      include: {
        compartments: {
          orderBy: {
            number: "asc",
          },
        },
      },
    });

    if (!returnLocker) {
      throw lockerNotFoundError();
    }

    if (returnLocker.status !== "ONLINE") {
      throw lockerOfflineError();
    }

    const existingSession = await tx.returnSession.findFirst({
      where: {
        rentalId: rental.id,
        status: {
          in: ["READY_TO_RETURN", "LOCKER_OPENING", "WAITING_FOR_SENSOR"],
        },
      },
      include: {
        returnCompartment: true,
        returnLocker: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const returnCompartment =
      existingSession?.returnCompartment ??
      returnLocker.compartments.find(
        (compartment) =>
          ["EMPTY", "AVAILABLE"].includes(compartment.status) &&
          compartment.lastSensorState !== "CABLE_PRESENT" &&
          !compartment.currentCableUnitId,
      );

    if (!returnCompartment) {
      throw noCableAvailableError();
    }

    const timing = calculateReturnTiming(rental.dueAt, now);
    const finePaid =
      timing.fine === 0 ||
      Boolean(
        await tx.walletTransaction.findFirst({
          where: {
            referenceId: rental.id,
            referenceType: "RENTAL_FINE",
            status: "SUCCESS",
            type: "FINE_PAYMENT",
          },
          select: {
            id: true,
          },
        }),
      );

    const returnSession =
      existingSession ??
      (await tx.returnSession.create({
        data: {
          rentalId: rental.id,
          returnLockerId: returnLocker.id,
          returnCompartmentId: returnCompartment.id,
          status: "READY_TO_RETURN",
        },
        include: {
          returnCompartment: true,
          returnLocker: true,
        },
      }));

    if (rental.status !== "RETURN_REQUESTED") {
      await tx.rental.update({
        where: { id: rental.id },
        data: {
          status: "RETURN_REQUESTED",
        },
      });
    }

    return {
      rentalId: rental.id,
      returnSessionId: returnSession.id,
      returnLocation: returnSession.returnLocker.name,
      compartmentNumber: returnSession.returnCompartment.number,
      timeLeftSeconds: timing.timeLeftSeconds,
      lateBySeconds: timing.lateBySeconds,
      fine: timing.fine,
      requiresFinePayment: timing.fine > 0 && !finePaid,
      finePaid,
      status: returnSession.status,
    };
  });
}

export { calculateReturnTiming, graceToleranceMinutes, hourlyRentFee };
