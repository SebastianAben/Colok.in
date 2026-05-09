import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  MQTT_URL: z.string().url().default("mqtt://localhost:1883"),
  IOT_MODE: z.enum(["mock", "mqtt"]).default("mock"),
  PUSH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUSH_PROVIDER: z.enum(["expo"]).default("expo"),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  FCM_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
