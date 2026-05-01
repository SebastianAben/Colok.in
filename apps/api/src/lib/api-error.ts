import type { ApiErrorCode } from "@colokin/shared";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;
  readonly statusCode: number;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function validationError(message: string, details?: Record<string, unknown>) {
  return new ApiError(400, "VALIDATION_ERROR", message, details);
}

export function unauthenticatedError(message = "Authentication is required.") {
  return new ApiError(401, "UNAUTHENTICATED", message);
}

export function forbiddenError(message = "You are not allowed to access this resource.") {
  return new ApiError(403, "FORBIDDEN", message);
}

export function lockerNotFoundError() {
  return new ApiError(404, "LOCKER_NOT_FOUND", "Locker was not found.");
}
