import { randomUUID } from "node:crypto";
import mqtt from "mqtt";
import { env } from "../../lib/env.js";

export type UnlockCompartmentInput = {
  lockerId: string;
  compartmentId: string;
  rentalId: string;
};

export type UnlockCompartmentResult = {
  success: true;
  unlockRequestId: string;
};

export type OpenReturnCompartmentInput = {
  lockerId: string;
  compartmentId: string;
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
  await publishUnlockCommand(input, unlockRequestId);

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
  await publishUnlockCommand(
    {
      compartmentId: input.compartmentId,
      lockerId: input.lockerId,
      rentalId: input.returnSessionId,
    },
    openRequestId,
  );

  return {
    success: true,
    openRequestId,
  };
}

async function publishUnlockCommand(input: UnlockCompartmentInput, unlockRequestId: string) {
  await new Promise<void>((resolve, reject) => {
    const client = mqtt.connect(env.MQTT_URL, {
      connectTimeout: 1500,
      reconnectPeriod: 0,
    });

    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error("MQTT unlock publish timed out."));
    }, 2500);

    client.once("connect", () => {
      client.publish(
        `colokin/lockers/${input.lockerId}/unlock`,
        JSON.stringify({
          compartmentId: input.compartmentId,
          rentalId: input.rentalId,
          unlockRequestId,
        }),
        { qos: 1 },
        (error) => {
          clearTimeout(timer);
          client.end(true);

          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });

    client.once("error", (error) => {
      clearTimeout(timer);
      client.end(true);
      reject(error);
    });
  });
}
