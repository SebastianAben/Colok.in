import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/api-response.js";
import { asyncRoute } from "../../lib/async-route.js";
import { getLockerDetail, listLockers } from "./service.js";

const lockersQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().positive().max(100_000).optional(),
});

export const lockersRouter = Router();

lockersRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = lockersQuerySchema.parse(req.query);
    const data = await listLockers(query);
    return sendSuccess(res, data);
  }),
);

lockersRouter.get(
  "/:lockerId",
  asyncRoute(async (req, res) => {
    const lockerId = z.string().min(1).parse(req.params.lockerId);
    const data = await getLockerDetail(lockerId);
    return sendSuccess(res, data);
  }),
);
