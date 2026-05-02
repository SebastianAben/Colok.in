import { QR_INTENTS } from "@colokin/shared";
import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { validateQr } from "./service.js";

const validateQrSchema = z.object({
  qrPayload: z.string().trim().min(1),
  intent: z.enum(QR_INTENTS).default("AUTO"),
});

export const qrRouter = Router();

qrRouter.use(authMiddleware);

qrRouter.post(
  "/validate",
  asyncRoute(async (req, res) => {
    const input = validateQrSchema.parse(req.body);
    const data = await validateQr(requireUserId(req), input);
    return sendSuccess(res, data);
  }),
);
