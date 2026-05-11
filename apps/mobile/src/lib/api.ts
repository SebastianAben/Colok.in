import type {
  ApiErrorResponse,
  ApiSuccess,
  AuthResponse,
  ConfirmTopUpRequest,
  ConfirmTopUpResponse,
  CreateRentalRequest,
  CreateTopUpRequest,
  CreateTopUpResponse,
  ConfirmReturnResponse,
  CreateFeedbackRequest,
  CreateFeedbackResponse,
  LockerListItem,
  MeResponse,
  QrValidateRequest,
  QrValidateResponse,
  ActiveRentalResponse,
  RentalDetailResponse,
  RentalQuoteRequest,
  RentalQuoteResponse,
  MarkNotificationReadResponse,
  TopUpDetailResponse,
  NotificationListItem,
  PayReturnFineResponse,
  PushTokenResponse,
  RegisterPushTokenRequest,
  ReturnDetailResponse,
  ReturnIntentRequest,
  ReturnIntentResponse,
  RevokePushTokenRequest,
  TransactionListItem,
} from "@colokin/shared";

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:4000/v1";
const requestTimeoutMs = 10000;

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ApiRequestOptions = {
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      error instanceof Error && error.name === "AbortError"
        ? `Request timed out while connecting to ${apiBaseUrl}.`
        : `Unable to connect to Colok.in at ${apiBaseUrl}.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: ApiSuccess<T> | ApiErrorResponse;

  try {
    payload = (await response.json()) as ApiSuccess<T> | ApiErrorResponse;
  } catch {
    throw new ApiClientError(response.status, "INVALID_RESPONSE", "Unexpected server response.");
  }

  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : undefined;
    throw new ApiClientError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "Request failed.",
      error?.details,
    );
  }

  return payload.data;
}

export function loginRequest(input: { emailOrPhone: string; password: string }) {
  return apiRequest<AuthResponse>("/auth/login", {
    body: input,
    method: "POST",
  });
}

export function registerRequest(input: {
  email: string;
  name: string;
  password: string;
  phone: string;
}) {
  return apiRequest<AuthResponse>("/auth/register", {
    body: input,
    method: "POST",
  });
}

export function refreshRequest(refreshToken: string) {
  return apiRequest<AuthResponse>("/auth/refresh", {
    body: { refreshToken },
    method: "POST",
  });
}

export function logoutRequest(token: string | null) {
  return apiRequest<{ success: boolean }>("/auth/logout", {
    method: "POST",
    token,
  });
}

export function getMeRequest(token: string) {
  return apiRequest<MeResponse>("/me", {
    token,
  });
}

export function createFeedbackRequest(token: string, input: CreateFeedbackRequest) {
  return apiRequest<CreateFeedbackResponse>("/feedback", {
    body: input,
    method: "POST",
    token,
  });
}

export function createTopUpRequest(token: string, input: CreateTopUpRequest) {
  return apiRequest<CreateTopUpResponse>("/wallet/topups", {
    body: input,
    method: "POST",
    token,
  });
}

export function confirmTopUpRequest(token: string, topUpId: string, input: ConfirmTopUpRequest) {
  return apiRequest<ConfirmTopUpResponse>(`/wallet/topups/${topUpId}/confirm`, {
    body: input,
    method: "POST",
    token,
  });
}

export function getTopUpRequest(token: string, topUpId: string) {
  return apiRequest<TopUpDetailResponse>(`/wallet/topups/${topUpId}`, {
    token,
  });
}

export function listLockersRequest(
  token: string,
  query: { lat?: number; lng?: number; radiusMeters?: number } = {},
) {
  const params = new URLSearchParams();

  if (typeof query.lat === "number") {
    params.set("lat", String(query.lat));
  }

  if (typeof query.lng === "number") {
    params.set("lng", String(query.lng));
  }

  if (typeof query.radiusMeters === "number") {
    params.set("radiusMeters", String(query.radiusMeters));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<LockerListItem[]>(`/lockers${suffix}`, {
    token,
  });
}

export function validateQrRequest(token: string, input: QrValidateRequest) {
  return apiRequest<QrValidateResponse>("/qr/validate", {
    body: input,
    method: "POST",
    token,
  });
}

export function getActiveRentalRequest(token: string) {
  return apiRequest<ActiveRentalResponse>("/rentals/active", {
    token,
  });
}

export function createRentalQuoteRequest(token: string, input: RentalQuoteRequest) {
  return apiRequest<RentalQuoteResponse>("/rentals/quote", {
    body: input,
    method: "POST",
    token,
  });
}

export function createRentalRequest(token: string, input: CreateRentalRequest) {
  return apiRequest<RentalDetailResponse>("/rentals", {
    body: input,
    method: "POST",
    token,
  });
}

export function getRentalRequest(token: string, rentalId: string) {
  return apiRequest<RentalDetailResponse>(`/rentals/${rentalId}`, {
    token,
  });
}

export function createReturnIntentRequest(
  token: string,
  rentalId: string,
  input: ReturnIntentRequest,
) {
  return apiRequest<ReturnIntentResponse>(`/rentals/${rentalId}/return-intent`, {
    body: input,
    method: "POST",
    token,
  });
}

export function payReturnFineRequest(token: string, returnSessionId: string) {
  return apiRequest<PayReturnFineResponse>(`/returns/${returnSessionId}/pay-fine`, {
    method: "POST",
    token,
  });
}

export function confirmReturnRequest(token: string, returnSessionId: string) {
  return apiRequest<ConfirmReturnResponse>(`/returns/${returnSessionId}/confirm`, {
    method: "POST",
    token,
  });
}

export function getReturnSessionRequest(token: string, returnSessionId: string) {
  return apiRequest<ReturnDetailResponse>(`/returns/${returnSessionId}`, {
    token,
  });
}

export function listTransactionsRequest(token: string) {
  return apiRequest<TransactionListItem[]>("/transactions", {
    token,
  });
}

export function registerPushTokenRequest(token: string, input: RegisterPushTokenRequest) {
  return apiRequest<PushTokenResponse>("/devices/push-token", {
    body: input,
    method: "POST",
    token,
  });
}

export function revokePushTokenRequest(token: string, input: RevokePushTokenRequest) {
  return apiRequest<PushTokenResponse>("/devices/push-token", {
    body: input,
    method: "DELETE",
    token,
  });
}

export function listNotificationsRequest(token: string) {
  return apiRequest<NotificationListItem[]>("/notifications", {
    token,
  });
}

export function markNotificationReadRequest(token: string, notificationId: string) {
  return apiRequest<MarkNotificationReadResponse>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
    token,
  });
}
