import type { QrIntent, QrValidateResponse } from "@colokin/shared";
import type { Prisma, RentalStatus } from "@prisma/client";
import {
  lockerNotFoundError,
  lockerOfflineError,
  noCableAvailableError,
  qrInvalidError,
  userHasActiveRentalError,
} from "../../lib/api-error.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";

const activeRentalStatuses: RentalStatus[] = [
  "UNLOCKING",
  "ACTIVE",
  "RETURN_REQUESTED",
  "WAITING_FOR_SENSOR",
  "LATE",
];

type LockerForQr = Prisma.LockerGetPayload<{
  include: {
    compartments: {
      orderBy: {
        number: "asc";
      };
    };
    cableUnits: true;
  };
}>;

function parseLockerQrPayload(qrPayload: string) {
  try {
    const url = new URL(qrPayload);
    const lockerId = url.pathname.replace(/^\//, "");
    const compartmentId = url.searchParams.get("compartment") ?? undefined;

    if (url.protocol !== "colokin:" || url.hostname !== "locker" || !lockerId) {
      return null;
    }

    return {
      compartmentId,
      lockerId,
    };
  } catch {
    return null;
  }
}

function availableCompartments(locker: LockerForQr) {
  const availableCableUnitByCompartmentId = new Map(
    locker.cableUnits
      .filter(
        (cableUnit) =>
          cableUnit.status === "AVAILABLE" &&
          cableUnit.currentLockerId === locker.id &&
          cableUnit.currentCompartmentId,
      )
      .map((cableUnit) => [cableUnit.currentCompartmentId, cableUnit.id]),
  );

  return locker.compartments.filter(
    (compartment) =>
      (env.IOT_MODE === "mock" || [1, 2].includes(compartment.number)) &&
      compartment.status === "AVAILABLE" &&
      compartment.lastSensorState === "CABLE_PRESENT" &&
      compartment.currentCableUnitId &&
      availableCableUnitByCompartmentId.get(compartment.id) === compartment.currentCableUnitId,
  );
}

export async function validateQr(
  userId: string,
  input: {
    qrPayload: string;
    intent: QrIntent;
  },
): Promise<QrValidateResponse> {
  const parsedPayload = parseLockerQrPayload(input.qrPayload);
  if (!parsedPayload) {
    throw qrInvalidError();
  }

  const locker = await prisma.locker.findUnique({
    where: { id: parsedPayload.lockerId },
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

  const compartments = availableCompartments(locker);
  const selectedCompartment = parsedPayload.compartmentId
    ? compartments.find((compartment) => compartment.id === parsedPayload.compartmentId)
    : compartments[0];

  if (!selectedCompartment) {
    if (
      parsedPayload.compartmentId &&
      locker.compartments.some((compartment) => compartment.id === parsedPayload.compartmentId)
    ) {
      throw qrInvalidError("QR compartment is not available.");
    }

    if (parsedPayload.compartmentId) {
      throw qrInvalidError("QR compartment does not belong to this locker.");
    }

    throw noCableAvailableError();
  }

  const activeRental = await prisma.rental.findFirst({
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

  return {
    valid: true,
    intent: input.intent,
    locker: {
      id: locker.id,
      name: locker.name,
      availableCableCount: compartments.length,
    },
    compartment: {
      id: selectedCompartment.id,
      number: selectedCompartment.number,
      status: selectedCompartment.status,
    },
  };
}
