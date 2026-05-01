import { Router } from "express";
import { authRouter } from "./auth/routes.js";
import { lockersRouter } from "./lockers/routes.js";
import { usersRouter } from "./users/routes.js";

export function createV1Router() {
  const router = Router();

  router.use("/auth", authRouter);
  router.use("/me", usersRouter);
  router.use("/lockers", lockersRouter);

  return router;
}
