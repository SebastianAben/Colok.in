CREATE TYPE "IotEventDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "IotEventLog" (
    "id" TEXT NOT NULL,
    "direction" "IotEventDirection" NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "command" TEXT,
    "lockerNumber" INTEGER,
    "sensorState" "SensorState",
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IotEventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IotEventLog_direction_createdAt_idx" ON "IotEventLog"("direction", "createdAt");
CREATE INDEX "IotEventLog_topic_createdAt_idx" ON "IotEventLog"("topic", "createdAt");
CREATE INDEX "IotEventLog_lockerNumber_createdAt_idx" ON "IotEventLog"("lockerNumber", "createdAt");
