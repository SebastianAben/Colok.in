import type { NextFunction, Request, Response } from "express";
import { unauthenticatedError } from "../lib/api-error.js";
import { verifyAuthToken } from "../lib/jwt.js";

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    next(unauthenticatedError());
    return;
  }

  try {
    const payload = await verifyAuthToken(token, "access");
    req.auth = {
      userId: payload.sub,
    };
    next();
  } catch {
    next(unauthenticatedError("Invalid or expired access token."));
  }
}

export function requireUserId(req: Request): string {
  if (!req.auth?.userId) {
    throw unauthenticatedError();
  }

  return req.auth.userId;
}
