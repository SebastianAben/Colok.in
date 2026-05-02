import type {
  MarkNotificationReadResponse,
  NotificationListItem,
  NotificationsResponse,
} from "@colokin/shared";
import { forbiddenError } from "../../lib/api-error.js";
import { prisma } from "../../lib/prisma.js";
import { sendPushNotification } from "./push.js";

function iso(date: Date) {
  return date.toISOString();
}

function dateOnly(date: Date) {
  return iso(date).slice(0, 10);
}

function toNotificationListItem(notification: {
  id: string;
  type: NotificationListItem["type"];
  title: string;
  message: string;
  relatedTransactionId: string | null;
  relatedRentalId: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationListItem {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    date: dateOnly(notification.createdAt),
    createdAt: iso(notification.createdAt),
    readAt: notification.readAt ? iso(notification.readAt) : null,
    relatedTransactionId: notification.relatedTransactionId,
    relatedRentalId: notification.relatedRentalId,
  };
}

export async function listNotifications(userId: string): Promise<NotificationsResponse> {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: {
      createdAt: "desc",
    },
  });

  return notifications.map(toNotificationListItem);
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<MarkNotificationReadResponse> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: {
      userId: true,
    },
  });

  if (!notification || notification.userId !== userId) {
    throw forbiddenError();
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      readAt: new Date(),
    },
  });

  return { success: true };
}

export async function sendPushToUser(
  userId: string,
  input: {
    title: string;
    body: string;
    data?: Record<string, string>;
  },
) {
  const tokens = await prisma.deviceToken.findMany({
    where: {
      userId,
      revokedAt: null,
    },
    select: {
      token: true,
    },
  });

  await Promise.allSettled(
    tokens.map((deviceToken) =>
      sendPushNotification({
        token: deviceToken.token,
        title: input.title,
        body: input.body,
        data: input.data,
      }),
    ),
  );
}
