import { describe, expect, it } from "vitest";
import { getNotificationMode, sendPushNotification } from "./service.js";

describe("notification service", () => {
  it("uses local no-op mode when FCM is disabled", async () => {
    expect(getNotificationMode()).toBe("disabled");

    await expect(
      sendPushNotification({
        token: "demo-token",
        title: "Demo",
        body: "No-op",
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "disabled",
    });
  });
});
