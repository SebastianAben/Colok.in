import type { ApiErrorResponse, ApiSuccess } from "@colokin/shared";
import type { Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "./api-error.js";

function requestIdFrom(res: Response): string {
  return String(res.locals.requestId ?? "unknown");
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  const response: ApiSuccess<T> = {
    data,
    meta: {
      requestId: requestIdFrom(res),
    },
  };

  return res.status(statusCode).json(response);
}

export function sendError(res: Response, error: unknown) {
  const apiError = normalizeError(error);
  const response: ApiErrorResponse = {
    error: {
      code: apiError.code,
      message: apiError.message,
      details: apiError.details,
    },
    meta: {
      requestId: requestIdFrom(res),
    },
  };

  return res.status(apiError.statusCode).json(response);
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
      issues: error.issues,
    });
  }

  return new ApiError(500, "INTERNAL_ERROR", "Internal server error.");
}
