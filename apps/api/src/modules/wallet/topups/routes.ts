import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../../lib/api-response.js";
import { asyncRoute } from "../../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../../middleware/auth.js";
import { confirmTopUp, createTopUp, getTopUp } from "./service.js";

const createTopUpSchema = z.object({
  amount: z.number().int().min(10000).max(1000000),
});

const confirmTopUpSchema = z.object({
  dummyQrPayload: z.string().trim().min(1),
});

const topUpParamsSchema = z.object({
  topUpId: z.string().min(1),
});

export const walletRouter = Router();

walletRouter.use(authMiddleware);

walletRouter.post(
  "/topups",
  asyncRoute(async (req, res) => {
    const input = createTopUpSchema.parse(req.body);
    const data = await createTopUp(requireUserId(req), input.amount);
    return sendSuccess(res, data, 201);
  }),
);

walletRouter.get(
  "/topups/:topUpId",
  asyncRoute(async (req, res) => {
    const params = topUpParamsSchema.parse(req.params);
    const data = await getTopUp(requireUserId(req), params.topUpId);
    return sendSuccess(res, data);
  }),
);

walletRouter.post(
  "/topups/:topUpId/confirm",
  asyncRoute(async (req, res) => {
    const params = topUpParamsSchema.parse(req.params);
    const input = confirmTopUpSchema.parse(req.body);
    const data = await confirmTopUp(requireUserId(req), params.topUpId, input.dummyQrPayload);
    return sendSuccess(res, data);
  }),
);
