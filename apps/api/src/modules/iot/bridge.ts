import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { SensorState } from "@prisma/client";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { sendPushToUser } from "../notifications/service.js";
import { detectionTopics, lockerStatusTopic } from "./adapter.js";

type BridgeStatus = "disabled" | "connected" | "connecting" | "error";

let client: MqttClient | null = null;
let bridgeStatus: BridgeStatus = env.IOT_MODE === "mock" ? "disabled" : "connecting";

export function getIotMqttBridgeStatus(): BridgeStatus {
  return bridgeStatus;
}

export function startIotMqttBridge() {
  if (env.IOT_MODE === "mock") {
    bridgeStatus = "disabled";
    return {
      stop: () => undefined,
    };
  }

  if (client) {
    return {
      stop: stopIotMqttBridge,
    };
  }

  const options: IClientOptions = {
    clientId: env.MQTT_CLIENT_ID,
    connectTimeout: 5000,
    keepalive: env.MQTT_KEEPALIVE_SECONDS,
    password: env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
    username: env.MQTT_USERNAME,
  };

  client = mqtt.connect(env.MQTT_URL, options);
  bridgeStatus = "connecting";

  client.on("connect", () => {
    bridgeStatus = "connected";
    client?.subscribe([...detectionTopics, lockerStatusTopic], { qos: 1 }, (error) => {
      if (error) {
        bridgeStatus = "error";
        console.error("MQTT subscription failed.", error);
      }
    });
  });

  client.on("reconnect", () => {
    bridgeStatus = "connecting";
  });

  client.on("close", () => {
    bridgeStatus = "connecting";
  });

  client.on("error", (error) => {
    bridgeStatus = "error";
    console.error("MQTT bridge error.", error);
  });

  client.on("message", (topic, payload) => {
    void handleMqttMessage(topic, payload.toString("utf8")).catch((error) => {
      console.error("MQTT message handling failed.", error);
    });
  });

  return {
    stop: stopIotMqttBridge,
  };
}

function stopIotMqttBridge() {
  if (!client) {
    return;
  }

  client.end(true);
  client = null;
  bridgeStatus = env.IOT_MODE === "mock" ? "disabled" : "connecting";
}

export async function handleMqttMessage(topic: string, payload: string) {
  const trimmedPayload = payload.trim();
  const log = await prisma.iotEventLog.create({
    data: {
      direction: "INBOUND",
      payload: trimmedPayload,
      topic,
    },
  });

  try {
    if (topic === lockerStatusTopic) {
      await prisma.iotEventLog.update({
        where: { id: log.id },
        data: { processedAt: new Date() },
      });
      return;
    }

    const match = /^colokin\/locker\/(\d+)\/detection$/.exec(topic);
    if (!match) {
      throw new Error(`Unsupported MQTT topic: ${topic}`);
    }

    const lockerNumber = Number(match[1]);
    const sensorState = mapDetectionPayload(trimmedPayload);
    await processDetection(lockerNumber, sensorState);
    await prisma.iotEventLog.update({
      where: { id: log.id },
      data: {
        lockerNumber,
        processedAt: new Date(),
        sensorState,
      },
    });
  } catch (error) {
    await prisma.iotEventLog.update({
      where: { id: log.id },
      data: {
        error: error instanceof Error ? error.message : "Unknown MQTT processing error.",
        processedAt: new Date(),
      },
    });
    throw error;
  }
}

export function mapDetectionPayload(payload: string): SensorState {
  if (payload === "EMPTY") {
    return "CABLE_ABSENT";
  }

  if (payload === "OCCUPIED") {
    return "CABLE_PRESENT";
  }

  throw new Error(`Unsupported detection payload: ${payload}`);
}

async function processDetection(lockerNumber: number, sensorState: SensorState) {
  const compartment = env.IOT_LOCKER_ID
    ? await prisma.compartment.findUnique({
        where: {
          lockerId_number: {
            lockerId: env.IOT_LOCKER_ID,
            number: lockerNumber,
          },
        },
      })
    : await prisma.compartment.findFirst({
        where: { number: lockerNumber },
        orderBy: { updatedAt: "desc" },
      });

  if (!compartment) {
    throw new Error(`No compartment found for MQTT locker number ${lockerNumber}.`);
  }

  if (sensorState === "CABLE_ABSENT") {
    await processCableAbsent(compartment.id);
    return;
  }

  await processCablePresent(compartment.id);
}

async function processCableAbsent(compartmentId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const compartment = await tx.compartment.update({
      where: { id: compartmentId },
      data: {
        lastSensorState: "CABLE_ABSENT",
      },
    });

    const rental = await tx.rental.findFirst({
      where: {
        compartmentId,
        status: "UNLOCKING",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!rental) {
      return { rental: null };
    }

    await tx.rental.update({
      where: { id: rental.id },
      data: { status: "ACTIVE" },
    });

    await tx.compartment.update({
      where: { id: compartment.id },
      data: {
        currentCableUnitId: null,
        status: "EMPTY",
      },
    });

    await tx.cableUnit.update({
      where: { id: rental.cableUnitId },
      data: {
        currentCompartmentId: null,
        currentLockerId: null,
        status: "RENTED",
      },
    });

    const notification = await tx.notification.findFirst({
      where: {
        relatedRentalId: rental.id,
        type: "RENT_SUCCESS",
      },
      orderBy: { createdAt: "desc" },
    });

    return { notification, rental };
  });

  if (result.rental && result.notification) {
    await sendPushToUser(result.rental.userId, {
      title: result.notification.title,
      body: result.notification.message,
      data: {
        notificationId: result.notification.id,
        relatedRentalId: result.rental.id,
        routeHint: "transactions",
        type: "RENT_SUCCESS",
      },
    });
  }
}

async function processCablePresent(compartmentId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const compartment = await tx.compartment.update({
      where: { id: compartmentId },
      data: {
        lastSensorState: "CABLE_PRESENT",
      },
    });

    const session = await tx.returnSession.findFirst({
      where: {
        returnCompartmentId: compartment.id,
        status: "WAITING_FOR_SENSOR",
      },
      include: {
        rental: true,
        returnCompartment: true,
        returnLocker: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!session) {
      return { notification: null, session: null };
    }

    const now = new Date();
    const fine = session.rental.fine;
    const totalFee = session.rental.rentFee + fine;

    const updatedSession = await tx.returnSession.update({
      where: { id: session.id },
      data: {
        status: "VERIFIED",
        verifiedAt: now,
        rental: {
          update: {
            fine,
            returnedAt: now,
            status: "RETURNED",
            totalFee,
          },
        },
        returnCompartment: {
          update: {
            currentCableUnitId: session.rental.cableUnitId,
            lastSensorState: "CABLE_PRESENT",
            status: "AVAILABLE",
          },
        },
      },
      include: {
        rental: true,
        returnCompartment: true,
        returnLocker: true,
      },
    });

    if (session.rental.compartmentId !== session.returnCompartmentId) {
      await tx.compartment.update({
        where: { id: session.rental.compartmentId },
        data: {
          currentCableUnitId: null,
          lastSensorState: "CABLE_ABSENT",
          status: "EMPTY",
        },
      });
    }

    await tx.cableUnit.update({
      where: { id: session.rental.cableUnitId },
      data: {
        currentCompartmentId: session.returnCompartmentId,
        currentLockerId: session.returnLockerId,
        status: "AVAILABLE",
      },
    });

    const notification = await tx.notification.create({
      data: {
        userId: session.rental.userId,
        type: "RETURN_SUCCESS",
        title: "Return Success",
        message: `You have successfully returned the extension cable at ${session.returnLocker.name}.`,
        relatedRentalId: session.rentalId,
      },
    });

    return {
      notification,
      session: updatedSession,
    };
  });

  if (result.notification && result.session) {
    await sendPushToUser(result.session.rental.userId, {
      title: result.notification.title,
      body: result.notification.message,
      data: {
        notificationId: result.notification.id,
        relatedRentalId: result.session.rentalId,
        routeHint: "transactions",
        type: "RETURN_SUCCESS",
      },
    });
  }
}
