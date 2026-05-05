import type {
  PushTokenResponse,
  RegisterPushTokenRequest,
  RevokePushTokenRequest,
} from "@colokin/shared";
import { prisma } from "../../lib/prisma.js";

export async function registerPushToken(
  userId: string,
  input: RegisterPushTokenRequest,
): Promise<PushTokenResponse> {
  await prisma.deviceToken.upsert({
    where: {
      token: input.token,
    },
    update: {
      userId,
      platform: input.platform,
      deviceId: input.deviceId,
      revokedAt: null,
    },
    create: {
      userId,
      token: input.token,
      platform: input.platform,
      deviceId: input.deviceId,
    },
  });

  return { success: true };
}

export async function revokePushToken(
  userId: string,
  input: RevokePushTokenRequest,
): Promise<PushTokenResponse> {
  await prisma.deviceToken.updateMany({
    where: {
      userId,
      token: input.token,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return { success: true };
}
