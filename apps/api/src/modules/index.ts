import { Router } from "express";
import { authRouter } from "./auth/routes.js";
import { devicesRouter } from "./devices/routes.js";
import { feedbackRouter } from "./feedback/routes.js";
import { lockersRouter } from "./lockers/routes.js";
import { notificationsRouter } from "./notifications/routes.js";
import { qrRouter } from "./qr/routes.js";
import { rentalsRouter } from "./rentals/routes.js";
import { returnsRouter } from "./returns/routes.js";
import { transactionsRouter } from "./transactions/routes.js";
import { usersRouter } from "./users/routes.js";
import { walletRouter } from "./wallet/topups/routes.js";

export function createV1Router() {
  const router = Router();

  router.use("/auth", authRouter);
  router.use("/devices", devicesRouter);
  router.use("/feedback", feedbackRouter);
  router.use("/me", usersRouter);
  router.use("/lockers", lockersRouter);
  router.use("/notifications", notificationsRouter);
  router.use("/qr", qrRouter);
  router.use("/rentals", rentalsRouter);
  router.use("/returns", returnsRouter);
  router.use("/transactions", transactionsRouter);
  router.use("/wallet", walletRouter);

  return router;
}
