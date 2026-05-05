import type { NotificationType, RentalStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { sendPushToUser } from "../notifications/service.js";

const activeReminderStatuses: RentalStatus[] = ["ACTIVE", "LATE"];

type ReminderDefinition = {
  type: NotificationType;
  title: string;
  message: string;
  secondsBeforeDue: number;
};

const reminderDefinitions: ReminderDefinition[] = [
  {
    type: "RENT_REMINDER",
    title: "15 Minutes Left",
    message: "Your Colok.in rental is due in 15 minutes.",
    secondsBeforeDue: 15 * 60,
  },
  {
    type: "RENT_REMINDER",
    title: "5 Minutes Left",
    message: "Your Colok.in rental is due in 5 minutes.",
    secondsBeforeDue: 5 * 60,
  },
  {
    type: "RENT_REMINDER",
    title: "Rental Due Now",
    message: "Your Colok.in rental is due now. Please return the cable.",
    secondsBeforeDue: 0,
  },
];

async function createNotificationOnce(input: {
  userId: string;
  rentalId: string;
  type: NotificationType;
  title: string;
  message: string;
}) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      relatedRentalId: input.rentalId,
      type: input.type,
      title: input.title,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return null;
  }

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedRentalId: input.rentalId,
    },
  });

  await sendPushToUser(input.userId, {
    title: input.title,
    body: input.message,
    data: {
      notificationId: notification.id,
      rentalId: input.rentalId,
      type: input.type,
    },
  });

  return notification;
}

export async function runRentalReminderSweep(now = new Date()) {
  const rentals = await prisma.rental.findMany({
    where: {
      status: {
        in: activeReminderStatuses,
      },
    },
    select: {
      id: true,
      userId: true,
      dueAt: true,
      status: true,
    },
  });

  for (const rental of rentals) {
    const secondsUntilDue = Math.floor((rental.dueAt.getTime() - now.getTime()) / 1000);

    for (const reminder of reminderDefinitions) {
      if (secondsUntilDue <= reminder.secondsBeforeDue) {
        await createNotificationOnce({
          userId: rental.userId,
          rentalId: rental.id,
          type: reminder.type,
          title: reminder.title,
          message: reminder.message,
        });
      }
    }

    if (secondsUntilDue < 0) {
      if (rental.status === "ACTIVE") {
        await prisma.rental.update({
          where: { id: rental.id },
          data: { status: "LATE" },
        });
      }

      await createNotificationOnce({
        userId: rental.userId,
        rentalId: rental.id,
        type: "LATE_WARNING",
        title: "Rental Is Late",
        message: "Your Colok.in rental is now late. Please return the cable.",
      });
    }
  }
}
