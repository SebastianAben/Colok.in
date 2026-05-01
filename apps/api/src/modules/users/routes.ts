import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { getMe, updateMe } from "./service.js";

const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().min(8).max(32).optional(),
    email: z.string().trim().email().max(255).toLowerCase().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field must be provided.",
  });

export const usersRouter = Router();

usersRouter.use(authMiddleware);

usersRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const data = await getMe(requireUserId(req));
    return sendSuccess(res, data);
  }),
);

usersRouter.patch(
  "/",
  asyncRoute(async (req, res) => {
    const input = updateMeSchema.parse(req.body);
    const data = await updateMe(requireUserId(req), input);
    return sendSuccess(res, data);
  }),
);
