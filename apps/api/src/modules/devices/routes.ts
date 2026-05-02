import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { registerPushToken, revokePushToken } from "./service.js";

const registerPushTokenSchema = z.object({
  token: z.string().trim().min(1).max(2048),
  platform: z.enum(["ios", "android", "web", "unknown"]),
  deviceId: z.string().trim().min(1).max(255).optional(),
});

const revokePushTokenSchema = z.object({
  token: z.string().trim().min(1).max(2048),
});

export const devicesRouter = Router();

devicesRouter.use(authMiddleware);

devicesRouter.post(
  "/push-token",
  asyncRoute(async (req, res) => {
    const input = registerPushTokenSchema.parse(req.body);
    const data = await registerPushToken(requireUserId(req), input);
    return sendSuccess(res, data);
  }),
);

devicesRouter.delete(
  "/push-token",
  asyncRoute(async (req, res) => {
    const input = revokePushTokenSchema.parse(req.body);
    const data = await revokePushToken(requireUserId(req), input);
    return sendSuccess(res, data);
  }),
);
