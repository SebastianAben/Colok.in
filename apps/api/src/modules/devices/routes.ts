import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { sendPushToUser } from "../notifications/service.js";
import { registerPushToken, revokePushToken } from "./service.js";

const registerPushTokenSchema = z.object({
  token: z.string().trim().min(1).max(2048),
  platform: z.enum(["ios", "android", "web", "unknown"]),
  deviceId: z.string().trim().min(1).max(255).optional(),
});

const revokePushTokenSchema = z.object({
  token: z.string().trim().min(1).max(2048),
});

const testPushSchema = z.object({
  body: z.string().trim().min(1).max(500).default("This is a Colok.in test notification."),
  title: z.string().trim().min(1).max(120).default("Colok.in Test Push"),
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

devicesRouter.post(
  "/test-push",
  asyncRoute(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Not found.",
        },
      });
    }

    const input = testPushSchema.parse(req.body);
    await sendPushToUser(requireUserId(req), {
      title: input.title,
      body: input.body,
      data: {
        routeHint: "notifications",
        type: "SYSTEM",
      },
    });

    return sendSuccess(res, { success: true });
  }),
);
