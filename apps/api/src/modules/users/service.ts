import type { MeResponse } from "@colokin/shared";
import { Prisma, type RentalStatus } from "@prisma/client";
import { validationError } from "../../lib/api-error.js";
import { prisma } from "../../lib/prisma.js";

const activeRentalStatuses: RentalStatus[] = [
  "UNLOCKING",
  "ACTIVE",
  "RETURN_REQUESTED",
  "WAITING_FOR_SENSOR",
  "LATE",
];

export async function getMe(userId: string): Promise<MeResponse> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      wallet: true,
      rentals: {
        where: {
          status: {
            in: activeRentalStatuses,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    avatarUrl: user.avatarUrl,
    wallet: {
      balance: user.wallet?.balance ?? 0,
      currency: "IDR",
    },
    activeRentalId: user.rentals[0]?.id ?? null,
  };
}

export async function updateMe(
  userId: string,
  input: {
    name?: string;
    phone?: string;
    email?: string;
  },
): Promise<MeResponse> {
  if (input.email || input.phone) {
    const conflictingUser = await prisma.user.findFirst({
      where: {
        id: {
          not: userId,
        },
        OR: [
          ...(input.email ? [{ email: input.email }] : []),
          ...(input.phone ? [{ phone: input.phone }] : []),
        ],
      },
      select: {
        id: true,
      },
    });

    if (conflictingUser) {
      throw validationError("Email or phone is already used by another account.");
    }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: input,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw validationError("Email or phone is already used by another account.", {
        target: error.meta?.target,
      });
    }

    throw error;
  }

  return getMe(userId);
}
