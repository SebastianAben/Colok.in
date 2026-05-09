import mqtt from "mqtt";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { getIotMqttBridgeStatus } from "../modules/iot/bridge.js";

export type HealthStatus = "ok" | "error" | "disabled";

export type HealthReport = {
  status: HealthStatus;
  database: HealthStatus;
  mqtt: HealthStatus;
  fcm: HealthStatus;
};

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "error";
  }
}

async function checkMqtt(): Promise<HealthStatus> {
  if (env.IOT_MODE === "mock") {
    return "disabled";
  }

  if (getIotMqttBridgeStatus() === "connected") {
    return "ok";
  }

  return new Promise((resolve) => {
    const client = mqtt.connect(env.MQTT_URL, {
      connectTimeout: 1500,
      keepalive: env.MQTT_KEEPALIVE_SECONDS,
      password: env.MQTT_PASSWORD,
      reconnectPeriod: 0,
      username: env.MQTT_USERNAME,
    });

    const finish = (status: HealthStatus) => {
      client.end(true);
      resolve(status);
    };

    const timer = setTimeout(() => finish("error"), 2000);

    client.once("connect", () => {
      clearTimeout(timer);
      finish("ok");
    });

    client.once("error", () => {
      clearTimeout(timer);
      finish("error");
    });
  });
}

export async function getHealthReport(): Promise<HealthReport> {
  const [database, mqttStatus] = await Promise.all([checkDatabase(), checkMqtt()]);
  const fcm: HealthStatus = env.FCM_ENABLED ? "ok" : "disabled";
  const status: HealthStatus = database === "ok" && mqttStatus !== "error" ? "ok" : "error";

  return {
    status,
    database,
    mqtt: mqttStatus,
    fcm,
  };
}
