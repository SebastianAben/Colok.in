import type { ActiveRentalResponse } from "@colokin/shared";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushTokenRequest, revokePushTokenRequest } from "./api";

let registeredPushToken: string | null = null;
let scheduledRentalId: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function notificationPlatform() {
  if (Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web") {
    return Platform.OS;
  }

  return "unknown";
}

async function ensureNotificationPermission() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

export async function registerDevicePushToken(accessToken: string) {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("rental-reminders", {
        name: "Rental reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    const expoToken = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    registeredPushToken = expoToken.data;
    await registerPushTokenRequest(accessToken, {
      token: expoToken.data,
      platform: notificationPlatform(),
      deviceId: Constants.sessionId ?? undefined,
    });

    return expoToken.data;
  } catch {
    return null;
  }
}

export async function revokeRegisteredPushToken(accessToken: string | null) {
  if (!accessToken || !registeredPushToken) {
    return;
  }

  try {
    await revokePushTokenRequest(accessToken, { token: registeredPushToken });
  } catch {
    // Best effort only; local session cleanup should not be blocked by push token revocation.
  } finally {
    registeredPushToken = null;
  }
}

function reminderSchedule(rental: NonNullable<ActiveRentalResponse>) {
  const dueAtMs = new Date(rental.dueAt).getTime();
  return [
    {
      id: "15m",
      title: "15 Minutes Left",
      body: "Your Colok.in rental is due in 15 minutes.",
      at: dueAtMs - 15 * 60 * 1000,
    },
    {
      id: "5m",
      title: "5 Minutes Left",
      body: "Your Colok.in rental is due in 5 minutes.",
      at: dueAtMs - 5 * 60 * 1000,
    },
    {
      id: "due",
      title: "Rental Due Now",
      body: "Your Colok.in rental is due now. Please return the cable.",
      at: dueAtMs,
    },
    {
      id: "late",
      title: "Rental Is Late",
      body: "Your Colok.in rental is now late. Please return the cable.",
      at: dueAtMs + 60 * 1000,
    },
  ];
}

export async function scheduleRentalReminders(activeRental: ActiveRentalResponse) {
  try {
    if (!activeRental) {
      scheduledRentalId = null;
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    if (scheduledRentalId === activeRental.id) {
      return;
    }

    const granted = await ensureNotificationPermission();
    scheduledRentalId = activeRental.id;
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (!granted) {
      return;
    }

    const now = Date.now();
    await Promise.all(
      reminderSchedule(activeRental)
        .filter((reminder) => reminder.at > now)
        .map((reminder) =>
          Notifications.scheduleNotificationAsync({
            content: {
              title: reminder.title,
              body: reminder.body,
              data: {
                rentalId: activeRental.id,
                reminderId: reminder.id,
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(reminder.at),
              channelId: "rental-reminders",
            },
          }),
        ),
    );
  } catch {
    // Scheduling is additive to the in-app timer; errors should not break the rental status UI.
  }
}
