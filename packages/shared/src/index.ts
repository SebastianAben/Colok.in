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

export type WalletSummary = {
  balance: number;
  currency: typeof CURRENCY_IDR;
};

export type CreateTopUpRequest = {
  amount: number;
};

export type CreateTopUpResponse = {
  topUpId: string;
  status: "PENDING";
  amount: number;
  dummyQrPayload: string;
  expiresAt: string;
};

export type ConfirmTopUpRequest = {
  dummyQrPayload: string;
};

export type ConfirmTopUpResponse = {
  id: string;
  status: "SUCCESS";
  amount: number;
  wallet: WalletSummary;
  walletTransactionId: string;
  notificationId: string;
  createdAt: string;
  confirmedAt: string;
};

export type TopUpDetailResponse = {
  id: string;
  status: TopUpStatus;
  amount: number;
  dummyQrPayload: string;
  createdAt: string;
  confirmedAt: string | null;
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

export type QrValidateRequest = {
  qrPayload: string;
  intent: QrIntent;
};

export type QrValidateResponse = {
  valid: true;
  intent: QrIntent;
  locker: {
    id: string;
    name: string;
    availableCableCount: number;
  };
  compartment?: LockerCompartment;
};

export type RentalQuoteRequest = {
  lockerId: string;
  durationMinutes: number;
};

export type RentalQuoteResponse = {
  lockerId: string;
  locationName: string;
  durationMinutes: number;
  rentFee: number;
  depositAmount: 0;
  totalCharge: number;
  availableCableCount: number;
};

export type CreateRentalRequest = {
  lockerId: string;
  compartmentId?: string;
  durationMinutes: number;
  paymentSource: "WALLET";
};

export type RentalDetailResponse = {
  id: string;
  status: RentalStatus;
  locker: {
    id: string;
    name: string;
  };
  compartmentNumber: number;
  startedAt: string;
  dueAt: string;
  rentFee: number;
  unlockRequestId?: string;
};

export type ReturnIntentRequest = {
  lockerId?: string;
};

export type ReturnIntentResponse = {
  rentalId: string;
  returnSessionId: string;
  returnLocation: string;
  compartmentNumber: number;
  timeLeftSeconds: number;
  lateBySeconds: number;
  fine: number;
  requiresFinePayment: boolean;
  finePaid: boolean;
  status: ReturnSessionStatus;
};

export type PayReturnFineResponse = {
  returnSessionId: string;
  fine: number;
  paid: true;
  walletBalance: number;
  walletTransactionId: string | null;
};

export type ConfirmReturnResponse = {
  returnSessionId: string;
  status: ReturnSessionStatus;
  locker: {
    id: string;
    name: string;
  };
  compartmentNumber: number;
  sensorTimeoutAt: string;
};

export type ReturnDetailResponse = {
  id: string;
  rentalId: string;
  status: ReturnSessionStatus;
  verifiedAt: string | null;
  finalFee: number;
  fine: number;
  returnLocation: string;
  compartmentNumber: number;
  returnedAt: string | null;
};

export type ActiveRentalResponse = {
  id: string;
  status: RentalStatus;
  locker: {
    id: string;
    name: string;
  };
  compartmentNumber: number;
  startedAt: string;
  dueAt: string;
  serverNow: string;
  timeLeftSeconds: number;
  estimatedFee: number;
  fine: number;
} | null;

export type RegisterPushTokenRequest = {
  token: string;
  platform: "ios" | "android" | "web" | "unknown";
  deviceId?: string;
};

export type RevokePushTokenRequest = {
  token: string;
};

export type PushTokenResponse = {
  success: true;
};

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  date: string;
  createdAt: string;
  readAt: string | null;
  relatedTransactionId: string | null;
  relatedRentalId: string | null;
};

export type NotificationsResponse = NotificationListItem[];

export type MarkNotificationReadResponse = {
  success: true;
};

export type RentalTransactionListItem = {
  id: string;
  type: "RENTAL";
  status: RentalStatus;
  locationName: string;
  totalRentFee: number;
  startRentAt: string;
  returnedAt: string | null;
  completedAt: string | null;
  durationMinutes: number;
  fine: number;
};

export type WalletTransactionListItem = {
  id: string;
  type: WalletTransactionType;
  title: string;
  amount: number;
  direction: WalletTransactionDirection;
  status: WalletTransactionStatus;
  completedAt: string;
  referenceType: string | null;
  referenceId: string | null;
};

export type TransactionListItem = RentalTransactionListItem | WalletTransactionListItem;

export type TransactionsResponse = TransactionListItem[];

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
