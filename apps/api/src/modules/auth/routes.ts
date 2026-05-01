import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../../lib/async-route.js";
import { sendSuccess } from "../../lib/api-response.js";
import { loginUser, refreshAuthToken, registerUser } from "./service.js";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(32),
  email: z.string().trim().email().max(255).toLowerCase(),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  emailOrPhone: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncRoute(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const data = await registerUser(input);
    return sendSuccess(res, data, 201);
  }),
);

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const data = await loginUser(input);
    return sendSuccess(res, data);
  }),
);

authRouter.post(
  "/refresh",
  asyncRoute(async (req, res) => {
    const input = refreshSchema.parse(req.body);
    const data = await refreshAuthToken(input.refreshToken);
    return sendSuccess(res, data);
  }),
);

authRouter.post(
  "/logout",
  asyncRoute(async (_req, res) => {
    return sendSuccess(res, { success: true });
  }),
);
