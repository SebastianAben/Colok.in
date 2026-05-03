import type { CreateFeedbackRequest, CreateFeedbackResponse } from "@colokin/shared";
import { FEEDBACK_CATEGORIES } from "@colokin/shared";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

export const createFeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(1000),
});

function iso(date: Date) {
  return date.toISOString();
}

export async function createFeedback(
  userId: string,
  input: CreateFeedbackRequest,
): Promise<CreateFeedbackResponse> {
  const parsed = createFeedbackSchema.parse(input);
  const feedback = await prisma.feedback.create({
    data: {
      userId,
      category: parsed.category,
      subject: parsed.subject,
      message: parsed.message,
    },
  });

  return {
    id: feedback.id,
    category: feedback.category as CreateFeedbackResponse["category"],
    subject: feedback.subject,
    message: feedback.message,
    status: feedback.status,
    createdAt: iso(feedback.createdAt),
  };
}
