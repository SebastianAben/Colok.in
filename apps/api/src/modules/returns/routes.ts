import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { confirmReturn, getReturnSession, payReturnFine } from "./service.js";

const returnSessionParamsSchema = z.object({
  returnSessionId: z.string().trim().min(1),
});

export const returnsRouter = Router();

returnsRouter.use(authMiddleware);

returnsRouter.post(
  "/:returnSessionId/pay-fine",
  asyncRoute(async (req, res) => {
    const params = returnSessionParamsSchema.parse(req.params);
    const data = await payReturnFine(requireUserId(req), params.returnSessionId);
    return sendSuccess(res, data);
  }),
);

returnsRouter.post(
  "/:returnSessionId/confirm",
  asyncRoute(async (req, res) => {
    const params = returnSessionParamsSchema.parse(req.params);
    const data = await confirmReturn(requireUserId(req), params.returnSessionId);
    return sendSuccess(res, data);
  }),
);

returnsRouter.get(
  "/:returnSessionId",
  asyncRoute(async (req, res) => {
    const params = returnSessionParamsSchema.parse(req.params);
    const data = await getReturnSession(requireUserId(req), params.returnSessionId);
    return sendSuccess(res, data);
  }),
);
