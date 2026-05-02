import type {
  ApiErrorResponse,
  ApiSuccess,
  AuthResponse,
  ConfirmTopUpRequest,
  ConfirmTopUpResponse,
  CreateTopUpRequest,
  CreateTopUpResponse,
  LockerListItem,
  MeResponse,
  QrValidateRequest,
  QrValidateResponse,
  TopUpDetailResponse,
} from "@colokin/shared";

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/v1";

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

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
  });

  const payload = (await response.json()) as ApiSuccess<T> | ApiErrorResponse;

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
