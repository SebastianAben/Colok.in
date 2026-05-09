import type { ApiSuccess } from "@colokin/shared";
import express from "express";
import { sendError } from "./lib/api-response.js";
import { env } from "./lib/env.js";
import { getHealthReport, type HealthReport } from "./lib/health.js";
import { prisma } from "./lib/prisma.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { startIotMqttBridge } from "./modules/iot/bridge.js";
import { createV1Router } from "./modules/index.js";
import { runRentalReminderSweep } from "./modules/rentals/reminders.js";

const app = express();

app.use(express.json());
app.use(requestIdMiddleware);

app.get("/health", async (_req, res) => {
  const report = await getHealthReport();
  res.status(report.status === "ok" ? 200 : 503).json(report);
});

app.get("/v1/health", async (req, res) => {
  const report = await getHealthReport();
  const response: ApiSuccess<HealthReport> = {
    data: report,
    meta: {
      requestId: res.locals.requestId,
    },
  };

  res.status(report.status === "ok" ? 200 : 503).json(response);
});

app.use("/v1", createV1Router());

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendError(res, error);
  },
);

if (env.NODE_ENV !== "test") {
  const server = app.listen(env.API_PORT, "0.0.0.0", () => {
    console.log(`Colok.in API listening on port ${env.API_PORT}`);
  });
  const reminderSweep = setInterval(() => {
    void runRentalReminderSweep().catch((error) => {
      console.error("Rental reminder sweep failed.", error);
    });
  }, 60_000);
  reminderSweep.unref();
  const iotBridge = startIotMqttBridge();

  const shutdown = async () => {
    clearInterval(reminderSweep);
    iotBridge.stop();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { app };
