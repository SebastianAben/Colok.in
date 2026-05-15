import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { getNotificationMode, sendPushNotification } from "./push.js";
import { sendPushToUser } from "./service.js";

afterEach(async () => {
  await prisma.deviceToken.deleteMany({
    where: {
      token: {
        contains: "notification-test",
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        contains: "notification-test",
      },
    },
  });
});

describe("notification service", () => {
  it("uses local no-op mode when push delivery is disabled", async () => {
    expect(getNotificationMode()).toBe("disabled");

    await expect(
      sendPushNotification({
        token: "ExponentPushToken[notification-test-disabled]",
        title: "Demo",
        body: "No-op",
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "disabled",
    });
  });

  it("reports invalid Expo push tokens without sending", async () => {
    await expect(
      sendPushNotification({
        token: "not-an-expo-token",
        title: "Demo",
        body: "Invalid token",
      }),
    ).resolves.toEqual({
      status: "invalid_token",
    });
  });

  it("revokes invalid Expo push tokens for a user", async () => {
    const unique = Date.now().toString();
    const user = await prisma.user.create({
      data: {
        email: `notification-test-${unique}@example.com`,
        name: "Notification Test",
        passwordHash: "test",
        phone: `+62812${unique.slice(-9)}`,
      },
    });
    const token = await prisma.deviceToken.create({
      data: {
        userId: user.id,
        platform: "android",
        token: "notification-test-invalid-token",
      },
    });

    await sendPushToUser(user.id, {
      title: "Demo",
      body: "Invalid token",
    });

    const updated = await prisma.deviceToken.findUniqueOrThrow({
      where: { id: token.id },
    });
    expect(updated.revokedAt).toBeInstanceOf(Date);
  });
});
