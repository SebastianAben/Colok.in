import { Router } from "express";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { createFeedback } from "./service.js";

export const feedbackRouter = Router();

feedbackRouter.use(authMiddleware);

feedbackRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = await createFeedback(requireUserId(req), req.body);
    return sendSuccess(res, data, 201);
  }),
);
