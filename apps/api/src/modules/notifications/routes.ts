import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { listNotifications, markNotificationRead } from "./service.js";

const notificationParamsSchema = z.object({
  notificationId: z.string().trim().min(1),
});

export const notificationsRouter = Router();

notificationsRouter.use(authMiddleware);

notificationsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const data = await listNotifications(requireUserId(req));
    return sendSuccess(res, data);
  }),
);

notificationsRouter.patch(
  "/:notificationId/read",
  asyncRoute(async (req, res) => {
    const params = notificationParamsSchema.parse(req.params);
    const data = await markNotificationRead(requireUserId(req), params.notificationId);
    return sendSuccess(res, data);
  }),
);
