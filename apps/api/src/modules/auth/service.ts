import type { AuthResponse, AuthUser } from "@colokin/shared";
import { Prisma, type User } from "@prisma/client";
import { validationError } from "../../lib/api-error.js";
import { signAuthToken, verifyAuthToken } from "../../lib/jwt.js";
import { hashPassword, isLegacyPasswordHash, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";

function toAuthUser(user: Pick<User, "id" | "name" | "phone" | "email">): AuthUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
  };
}

async function issueAuthResponse(
  user: Pick<User, "id" | "name" | "phone" | "email">,
): Promise<AuthResponse> {
  const [accessToken, refreshToken] = await Promise.all([
    signAuthToken(user.id, "access"),
    signAuthToken(user.id, "refresh"),
  ]);

  return {
    user: toAuthUser(user),
    accessToken,
    refreshToken,
  };
}

export async function registerUser(input: {
  name: string;
  phone: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  try {
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: input.name,
          phone: input.phone,
          email: input.email,
          passwordHash,
          wallet: {
            create: {
              balance: 0,
              currency: "IDR",
            },
          },
        },
      });

      return createdUser;
    });

    return issueAuthResponse(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw validationError("Email or phone is already registered.", {
        target: error.meta?.target,
      });
    }

    throw error;
  }
}

export async function loginUser(input: {
  emailOrPhone: string;
  password: string;
}): Promise<AuthResponse> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.emailOrPhone }, { phone: input.emailOrPhone }],
      status: "ACTIVE",
    },
  });

  if (!user) {
    throw validationError("Invalid email, phone, or password.");
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw validationError("Invalid email, phone, or password.");
  }

  if (isLegacyPasswordHash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }

  return issueAuthResponse(user);
}

export async function refreshAuthToken(refreshToken: string): Promise<AuthResponse> {
  try {
    const payload = await verifyAuthToken(refreshToken, "refresh");
    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
        status: "ACTIVE",
      },
    });

    if (!user) {
      throw validationError("Refresh token user is no longer active.");
    }

    return issueAuthResponse(user);
  } catch {
    throw validationError("Invalid refresh token.");
  }
}
