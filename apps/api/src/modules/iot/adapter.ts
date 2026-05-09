import { randomUUID } from "node:crypto";
import mqtt, { type IClientOptions } from "mqtt";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";

export const lockerControlTopic = "colokin/locker/control";
export const detectionTopics = [
  "colokin/locker/1/detection",
  "colokin/locker/2/detection",
] as const;
export const lockerStatusTopic = "colokin/locker/status";

export type UnlockCompartmentInput = {
  lockerId: string;
  compartmentId: string;
  compartmentNumber: number;
  rentalId: string;
};

export type UnlockCompartmentResult = {
  success: true;
  unlockRequestId: string;
};

export type OpenReturnCompartmentInput = {
  lockerId: string;
  compartmentId: string;
  compartmentNumber: number;
  returnSessionId: string;
};

export type OpenReturnCompartmentResult = {
  success: true;
  openRequestId: string;
};

export async function unlockCompartment(
  input: UnlockCompartmentInput,
): Promise<UnlockCompartmentResult> {
  if (env.IOT_MODE === "mock") {
    return {
      success: true,
      unlockRequestId: `mock_unlock_${input.rentalId}`,
    };
  }

  const unlockRequestId = `mqtt_unlock_${randomUUID()}`;
  await publishLockerCommand({
    command: `GIVE_${input.compartmentNumber}`,
    compartmentId: input.compartmentId,
    expectedSensorState: "CABLE_PRESENT",
    requestId: unlockRequestId,
  });

  return {
    success: true,
    unlockRequestId,
  };
}

export async function openReturnCompartment(
  input: OpenReturnCompartmentInput,
): Promise<OpenReturnCompartmentResult> {
  if (env.IOT_MODE === "mock") {
    return {
      success: true,
      openRequestId: `mock_return_open_${input.returnSessionId}`,
    };
  }

  const openRequestId = `mqtt_return_open_${randomUUID()}`;
  await publishLockerCommand({
    command: `RECEIVE_${input.compartmentNumber}`,
    compartmentId: input.compartmentId,
    expectedSensorState: "CABLE_ABSENT",
    requestId: openRequestId,
  });

  return {
    success: true,
    openRequestId,
  };
}

async function publishLockerCommand(input: {
  command: string;
  compartmentId: string;
  expectedSensorState: "CABLE_ABSENT" | "CABLE_PRESENT";
  requestId: string;
}) {
  if (!/^(GIVE|RECEIVE)_[12]$/.test(input.command)) {
    throw new Error(`Unsupported ESP32 locker command: ${input.command}.`);
  }

  const compartment = await prisma.compartment.findUnique({
    where: { id: input.compartmentId },
    select: { lastSensorState: true },
  });

  if (compartment?.lastSensorState !== input.expectedSensorState) {
    throw new Error(
      `Compartment sensor state ${compartment?.lastSensorState ?? "UNKNOWN"} does not allow ${input.command}.`,
    );
  }

  const log = await prisma.iotEventLog.create({
    data: {
      command: input.command,
      direction: "OUTBOUND",
      payload: input.command,
      topic: lockerControlTopic,
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const options: IClientOptions = {
        clientId: env.MQTT_CLIENT_ID ? `${env.MQTT_CLIENT_ID}-pub-${input.requestId}` : undefined,
        connectTimeout: 1500,
        keepalive: env.MQTT_KEEPALIVE_SECONDS,
        password: env.MQTT_PASSWORD,
        reconnectPeriod: 0,
        username: env.MQTT_USERNAME,
      };
      const client = mqtt.connect(env.MQTT_URL, options);

      const timer = setTimeout(() => {
        client.end(true);
        reject(new Error("MQTT command publish timed out."));
      }, 2500);

      client.once("connect", () => {
        client.publish(lockerControlTopic, input.command, { qos: 1 }, (error) => {
          clearTimeout(timer);
          client.end(true);

          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      client.once("error", (error) => {
        clearTimeout(timer);
        client.end(true);
        reject(error);
      });
    });

    await prisma.iotEventLog.update({
      where: { id: log.id },
      data: { processedAt: new Date() },
    });
  } catch (error) {
    await prisma.iotEventLog.update({
      where: { id: log.id },
      data: {
        error: error instanceof Error ? error.message : "Unknown MQTT publish error.",
        processedAt: new Date(),
      },
    });
    throw error;
  }
}
