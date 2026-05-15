import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
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
      reason: "disabled";
    }
  | {
      status: "invalid_token";
    }
  | {
      status: "failed";
      errorCode?: string;
      message: string;
    };

type PushTransport = (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;

let pushTransportForTesting: PushTransport | null = null;
let expoClient: Expo | null = null;

function getExpoClient() {
  if (expoClient) {
    return expoClient;
  }

  expoClient = new Expo(
    env.EXPO_ACCESS_TOKEN
      ? {
          accessToken: env.EXPO_ACCESS_TOKEN,
        }
      : undefined,
  );

  return expoClient;
}

async function sendWithExpo(messages: ExpoPushMessage[]) {
  const expo = getExpoClient();
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of expo.chunkPushNotifications(messages)) {
    tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
  }

  return tickets;
}

export function setPushTransportForTesting(transport: PushTransport | null) {
  pushTransportForTesting = transport;
}

function buildPushMessage(input: NotificationSendInput): ExpoPushMessage {
  return {
    to: input.token,
    title: input.title,
    body: input.body,
    data: input.data,
    sound: "default",
    channelId:
      input.data?.type === "RENT_REMINDER" || input.data?.type === "LATE_WARNING"
        ? "rental-reminders"
        : "transactions",
  };
}

export async function sendPushNotification(
  input: NotificationSendInput,
): Promise<NotificationSendResult> {
  if (!Expo.isExpoPushToken(input.token)) {
    return {
      status: "invalid_token",
    };
  }

  if (!env.PUSH_ENABLED) {
    return {
      status: "skipped",
      reason: "disabled",
    };
  }

  const tickets = await (pushTransportForTesting ?? sendWithExpo)([buildPushMessage(input)]);
  const ticket = tickets[0];

  if (!ticket) {
    return {
      status: "failed",
      message: "Expo Push Service did not return a ticket.",
    };
  }

  if (ticket.status === "error") {
    return {
      status: "failed",
      errorCode: ticket.details?.error,
      message: ticket.message,
    };
  }

  return {
    status: "sent",
    messageId: ticket.id,
  };
}

export function getNotificationMode() {
  if (!env.PUSH_ENABLED) {
    return "disabled" as const;
  }

  return env.PUSH_PROVIDER;
}
