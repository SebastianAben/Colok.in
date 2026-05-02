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

export function qrInvalidError(message = "QR payload is invalid.") {
  return new ApiError(400, "QR_INVALID", message);
}

export function lockerOfflineError() {
  return new ApiError(400, "LOCKER_OFFLINE", "Locker is offline.");
}

export function noCableAvailableError() {
  return new ApiError(400, "NO_CABLE_AVAILABLE", "No cable is available in this locker.");
}

export function userHasActiveRentalError() {
  return new ApiError(400, "USER_HAS_ACTIVE_RENTAL", "User already has an active rental.");
}

export function noActiveRentalError() {
  return new ApiError(404, "NO_ACTIVE_RENTAL", "No active rental was found.");
}

export function insufficientBalanceError() {
  return new ApiError(400, "INSUFFICIENT_BALANCE", "Your balance is not enough.");
}

export function walletChargeFailedError() {
  return new ApiError(400, "WALLET_CHARGE_FAILED", "Wallet charge failed.");
}

export function unlockFailedError() {
  return new ApiError(400, "UNLOCK_FAILED", "Locker unlock failed.");
}

export function returnSensorTimeoutError() {
  return new ApiError(400, "RETURN_SENSOR_TIMEOUT", "Return sensor verification timed out.");
}

export function returnNotVerifiedError(message = "Return is not verified yet.") {
  return new ApiError(400, "RETURN_NOT_VERIFIED", message);
}

export function topUpNotFoundError() {
  return new ApiError(404, "TOPUP_NOT_FOUND", "Top up was not found.");
}

export function topUpExpiredError() {
  return new ApiError(400, "TOPUP_EXPIRED", "Top up has expired.");
}

export function topUpAlreadyConfirmedError() {
  return new ApiError(400, "TOPUP_ALREADY_CONFIRMED", "Top up is already confirmed.");
}

export function topUpQrInvalidError() {
  return new ApiError(400, "TOPUP_QR_INVALID", "Top up QR payload is invalid.");
}
