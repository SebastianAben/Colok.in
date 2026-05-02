import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import {
  createRental,
  createRentalQuote,
  createReturnIntent,
  getActiveRental,
  getRental,
} from "./service.js";

const durationMinutesSchema = z
  .number()
  .int()
  .min(30)
  .max(360)
  .refine((durationMinutes) => durationMinutes % 30 === 0, {
    message: "Duration must use 30-minute increments.",
  });

const quoteSchema = z.object({
  lockerId: z.string().trim().min(1),
  durationMinutes: durationMinutesSchema,
});

const createRentalSchema = z.object({
  lockerId: z.string().trim().min(1),
  compartmentId: z.string().trim().min(1).optional(),
  durationMinutes: durationMinutesSchema,
  paymentSource: z.literal("WALLET"),
});

const rentalParamsSchema = z.object({
  rentalId: z.string().trim().min(1),
});

const returnIntentSchema = z.object({
  lockerId: z.string().trim().min(1).optional(),
});

export const rentalsRouter = Router();

rentalsRouter.use(authMiddleware);

rentalsRouter.get(
  "/active",
  asyncRoute(async (req, res) => {
    const data = await getActiveRental(requireUserId(req));
    return sendSuccess(res, data);
  }),
);

rentalsRouter.post(
  "/quote",
  asyncRoute(async (req, res) => {
    const input = quoteSchema.parse(req.body);
    const data = await createRentalQuote(requireUserId(req), input);
    return sendSuccess(res, data);
  }),
);

rentalsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = createRentalSchema.parse(req.body);
    const data = await createRental(requireUserId(req), input);
    return sendSuccess(res, data, 201);
  }),
);

rentalsRouter.post(
  "/:rentalId/return-intent",
  asyncRoute(async (req, res) => {
    const params = rentalParamsSchema.parse(req.params);
    const input = returnIntentSchema.parse(req.body);
    const data = await createReturnIntent(requireUserId(req), params.rentalId, input);
    return sendSuccess(res, data);
  }),
);

rentalsRouter.get(
  "/:rentalId",
  asyncRoute(async (req, res) => {
    const params = rentalParamsSchema.parse(req.params);
    const data = await getRental(requireUserId(req), params.rentalId);
    return sendSuccess(res, data);
  }),
);
