export type ApiMeta = {
  requestId: string;
};

export type ApiSuccess<T> = {
  data: T;
  meta: ApiMeta;
};

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  error: ApiError;
  meta: ApiMeta;
};

export type AuthUser = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

export type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

export type MeResponse = AuthUser & {
  avatarUrl: string | null;
  wallet: {
    balance: number;
    currency: typeof CURRENCY_IDR;
  };
  activeRentalId: string | null;
};

export type LockerListItem = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  availableCableCount: number;
  totalCompartments: number;
  status: LockerStatus;
  operationalHours: string;
};

export type LockerCompartment = {
  id: string;
  number: number;
  status: CompartmentStatus;
};

export type LockerDetailResponse = {
  id: string;
  name: string;
  availableCableCount: number;
  status: LockerStatus;
  compartments: LockerCompartment[];
};

export const CURRENCY_IDR = "IDR" as const;

export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "QR_INVALID",
  "LOCKER_NOT_FOUND",
  "LOCKER_OFFLINE",
  "NO_CABLE_AVAILABLE",
  "USER_HAS_ACTIVE_RENTAL",
  "NO_ACTIVE_RENTAL",
  "INSUFFICIENT_BALANCE",
  "WALLET_CHARGE_FAILED",
  "TOPUP_NOT_FOUND",
  "TOPUP_EXPIRED",
  "TOPUP_ALREADY_CONFIRMED",
  "TOPUP_QR_INVALID",
  "UNLOCK_FAILED",
  "RETURN_SENSOR_TIMEOUT",
  "RETURN_NOT_VERIFIED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const QR_INTENTS = ["RENT", "RETURN", "AUTO"] as const;
export type QrIntent = (typeof QR_INTENTS)[number];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LOCKER_STATUSES = ["ONLINE", "OFFLINE", "MAINTENANCE"] as const;
export type LockerStatus = (typeof LOCKER_STATUSES)[number];

export const COMPARTMENT_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "RENTED",
  "EMPTY",
  "RETURN_OPEN",
  "MAINTENANCE",
] as const;
export type CompartmentStatus = (typeof COMPARTMENT_STATUSES)[number];

export const SENSOR_STATES = ["CABLE_PRESENT", "CABLE_ABSENT", "UNKNOWN"] as const;
export type SensorState = (typeof SENSOR_STATES)[number];

export const CABLE_UNIT_STATUSES = [
  "AVAILABLE",
  "RENTED",
  "LOST",
  "DAMAGED",
  "MAINTENANCE",
] as const;
export type CableUnitStatus = (typeof CABLE_UNIT_STATUSES)[number];

export const RENTAL_STATUSES = [
  "DRAFT",
  "UNLOCKING",
  "ACTIVE",
  "RETURN_REQUESTED",
  "WAITING_FOR_SENSOR",
  "RETURNED",
  "LATE",
  "CANCELLED",
  "FAILED",
] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const RETURN_SESSION_STATUSES = [
  "READY_TO_RETURN",
  "LOCKER_OPENING",
  "WAITING_FOR_SENSOR",
  "VERIFIED",
  "TIMEOUT",
  "FAILED",
] as const;
export type ReturnSessionStatus = (typeof RETURN_SESSION_STATUSES)[number];

export const TOP_UP_STATUSES = ["PENDING", "SUCCESS", "EXPIRED", "FAILED", "CANCELLED"] as const;
export type TopUpStatus = (typeof TOP_UP_STATUSES)[number];

export const WALLET_TRANSACTION_TYPES = [
  "TOP_UP",
  "RENT_PAYMENT",
  "FINE_PAYMENT",
  "REFUND",
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WALLET_TRANSACTION_DIRECTIONS = ["CREDIT", "DEBIT"] as const;
export type WalletTransactionDirection = (typeof WALLET_TRANSACTION_DIRECTIONS)[number];

export const WALLET_TRANSACTION_STATUSES = ["PENDING", "SUCCESS", "FAILED", "CANCELLED"] as const;
export type WalletTransactionStatus = (typeof WALLET_TRANSACTION_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "RENT_SUCCESS",
  "RETURN_SUCCESS",
  "TOP_UP_SUCCESS",
  "RENT_REMINDER",
  "LATE_WARNING",
  "SYSTEM",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
