import type { LockerDetailResponse, LockerListItem } from "@colokin/shared";
import { type Locker, type Prisma } from "@prisma/client";
import { lockerNotFoundError } from "../../lib/api-error.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";

type LockerWithAvailability = Prisma.LockerGetPayload<{
  include: {
    compartments: true;
  };
}>;

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function availableCompartments(locker: LockerWithAvailability) {
  return locker.compartments.filter(
    (compartment) =>
      (env.IOT_MODE === "mock" || [1, 2].includes(compartment.number)) &&
      compartment.status === "AVAILABLE" &&
      compartment.lastSensorState === "CABLE_PRESENT" &&
      compartment.currentCableUnitId,
  );
}

function distanceMeters(from: { lat: number; lng: number }, locker: Pick<Locker, "lat" | "lng">) {
  const earthRadiusMeters = 6_371_000;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (toNumber(locker.lat) * Math.PI) / 180;
  const deltaLat = ((toNumber(locker.lat) - from.lat) * Math.PI) / 180;
  const deltaLng = ((toNumber(locker.lng) - from.lng) * Math.PI) / 180;

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return Math.round(earthRadiusMeters * angularDistance);
}

export async function listLockers(query: {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
}): Promise<LockerListItem[]> {
  const lockers = await prisma.locker.findMany({
    include: {
      compartments: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const hasCoordinates = typeof query.lat === "number" && typeof query.lng === "number";
  const origin = hasCoordinates ? { lat: query.lat!, lng: query.lng! } : null;

  return lockers
    .map((locker) => {
      const distance = origin ? distanceMeters(origin, locker) : null;
      return {
        id: locker.id,
        name: locker.name,
        address: locker.address,
        lat: toNumber(locker.lat),
        lng: toNumber(locker.lng),
        distanceMeters: distance,
        availableCableCount: availableCompartments(locker).length,
        totalCompartments: locker.compartments.length,
        status: locker.status,
        operationalHours: locker.operationalHours,
      };
    })
    .filter((locker) => {
      if (!query.radiusMeters || locker.distanceMeters === null) {
        return true;
      }

      return locker.distanceMeters <= query.radiusMeters;
    });
}

export async function getLockerDetail(lockerId: string): Promise<LockerDetailResponse> {
  const locker = await prisma.locker.findUnique({
    where: { id: lockerId },
    include: {
      compartments: {
        orderBy: { number: "asc" },
      },
    },
  });

  if (!locker) {
    throw lockerNotFoundError();
  }

  const compartments = availableCompartments(locker).map((compartment) => ({
    id: compartment.id,
    number: compartment.number,
    status: compartment.status,
  }));

  return {
    id: locker.id,
    name: locker.name,
    availableCableCount: compartments.length,
    status: locker.status,
    compartments,
  };
}
