import { Router } from "express";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authMiddleware, requireUserId } from "../../middleware/auth.js";
import { listTransactions } from "./service.js";

export const transactionsRouter = Router();

transactionsRouter.use(authMiddleware);

transactionsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const data = await listTransactions(requireUserId(req));
    return sendSuccess(res, data);
  }),
);
