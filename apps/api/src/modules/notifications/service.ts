import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../../lib/env.js";

export type NotificationSendInput = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type NotificationSendResult =
  | {
      status: "sent";
      messageId: string;
    }
  | {
      status: "skipped";
      reason: "disabled" | "missing_credentials";
    };

function hasFirebaseCredentials() {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
}

function getFirebaseApp(): App | null {
  if (!env.FCM_ENABLED) {
    return null;
  }

  if (!hasFirebaseCredentials()) {
    return null;
  }

  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export async function sendPushNotification(
  input: NotificationSendInput,
): Promise<NotificationSendResult> {
  if (!env.FCM_ENABLED) {
    return {
      status: "skipped",
      reason: "disabled",
    };
  }

  const app = getFirebaseApp();
  if (!app) {
    return {
      status: "skipped",
      reason: "missing_credentials",
    };
  }

  const messageId = await getMessaging(app).send({
    token: input.token,
    notification: {
      title: input.title,
      body: input.body,
    },
    data: input.data,
  });

  return {
    status: "sent",
    messageId,
  };
}

export function getNotificationMode() {
  if (!env.FCM_ENABLED) {
    return "disabled" as const;
  }

  if (!hasFirebaseCredentials()) {
    return "missing_credentials" as const;
  }

  return "enabled" as const;
}
