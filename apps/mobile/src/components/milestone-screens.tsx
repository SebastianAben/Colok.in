import { Ionicons } from "@expo/vector-icons";
import type {
  ActiveRentalResponse,
  ConfirmReturnResponse,
  NotificationListItem,
  RentalDetailResponse,
  ReturnDetailResponse,
  ReturnIntentResponse,
  TransactionListItem,
} from "@colokin/shared";
import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Card,
  DetailRow,
  MetricBlock,
  ModalScreen,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  StatusBadge,
  SuccessScreen,
} from "./milestone-ui";
import { demoLocker } from "../data/demo";
import { useAuth } from "../auth/auth-context";
import {
  ApiClientError,
  createFeedbackRequest,
  confirmReturnRequest,
  createRentalQuoteRequest,
  createRentalRequest,
  createReturnIntentRequest,
  getActiveRentalRequest,
  getRentalRequest,
  getReturnSessionRequest,
  listTransactionsRequest,
  listNotificationsRequest,
  markNotificationReadRequest,
  payReturnFineRequest,
} from "../lib/api";
import {
  calculateServerTimeOffsetMs,
  formatCurrencyIdr,
  formatDurationMinutes,
} from "../lib/display";
import { scheduleRentalReminders } from "../lib/notifications";
import { colors, radii, spacing } from "../theme/colors";

const showDeveloperTools = __DEV__;

function formatRupiah(amount: number) {
  return formatCurrencyIdr(amount);
}

function normalizeTransactionDirection(direction?: string | null) {
  const normalized = direction?.toUpperCase();

  if (normalized === "CREDIT" || normalized === "IN") {
    return "CREDIT";
  }

  if (normalized === "DEBIT" || normalized === "OUT") {
    return "DEBIT";
  }

  return null;
}

function formatSignedRupiah(amount: number, direction?: string | null) {
  const prefix = direction === "CREDIT" ? "+" : direction === "DEBIT" ? "-" : "";
  return `${prefix}${formatRupiah(Math.abs(amount))}`;
}

function formatDuration(minutes: number) {
  return formatDurationMinutes(minutes);
}

function formatTimeLeft(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatCompactDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}

function messageFrom(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Request failed. Please try again.";
}

function routeToRentSuccess(rental: RentalDetailResponse) {
  router.replace({
    pathname: "/rent/success",
    params: {
      compartmentNumber: String(rental.compartmentNumber),
      dueAt: rental.dueAt,
      lockerName: rental.locker.name,
      rentFee: String(rental.rentFee),
      rentalId: rental.id,
      unlockRequestId: rental.unlockRequestId ?? "",
    },
  });
}

type TransactionHistoryItem = Omit<Partial<TransactionListItem>, "type"> & {
  amount?: number;
  completedAt?: string | null;
  direction?: "CREDIT" | "DEBIT" | string | null;
  durationMinutes?: number;
  fine?: number;
  id: string;
  locationName?: string | null;
  returnedAt?: string | null;
  startRentAt?: string | null;
  status?: string | null;
  title?: string | null;
  totalRentFee?: number;
  type?: "RENTAL" | "TOP_UP" | "RENT_PAYMENT" | "FINE_PAYMENT" | "REFUND" | string;
};

const settingsMenuItems = [
  {
    description: "Notification preferences and app behavior.",
    href: "/settings/application",
    icon: "options-outline",
    title: "Application Settings",
  },
  {
    description: "Get help with renting, returning, and wallet top ups.",
    href: "/settings/help",
    icon: "help-circle-outline",
    title: "Help & Support",
  },
  {
    description: "Read usage, safety, and wallet policies.",
    href: "/settings/terms",
    icon: "document-text-outline",
    title: "Terms & Policies",
  },
  {
    description: "Submit feedback directly to the Colok.in team.",
    href: "/settings/feedback",
    icon: "chatbubble-ellipses-outline",
    title: "Feedback",
  },
  {
    description: "Learn about the Colok.in smart locker service.",
    href: "/settings/about",
    icon: "information-circle-outline",
    title: "About Us",
  },
] as const;

const feedbackCategories = [
  { label: "Bug", value: "BUG_REPORT" },
  { label: "Feature", value: "FEATURE_REQUEST" },
  { label: "Support", value: "SUPPORT" },
  { label: "Other", value: "OTHER" },
] as const;

const rentalUnlockPollIntervalMs = 2500;
const rentalUnlockTimeoutMs = 60000;

function labelFromTransactionType(type?: string | null) {
  switch (type) {
    case "RENTAL":
      return "Completed Rental";
    case "TOP_UP":
      return "Wallet Top Up";
    case "RENT_PAYMENT":
      return "Rent Payment";
    case "FINE_PAYMENT":
      return "Fine Payment";
    case "REFUND":
      return "Refund";
    default:
      return type ? type.replaceAll("_", " ") : "Transaction";
  }
}

function iconFromTransactionType(type?: string | null): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "RENTAL":
      return "flash-outline";
    case "TOP_UP":
      return "add-circle-outline";
    case "REFUND":
      return "return-up-back-outline";
    case "FINE_PAYMENT":
      return "alert-circle-outline";
    case "RENT_PAYMENT":
      return "wallet-outline";
    default:
      return "receipt-outline";
  }
}

function transactionAmount(transaction: TransactionHistoryItem) {
  if (typeof transaction.amount === "number") {
    return transaction.amount;
  }

  const rentFee = transaction.totalRentFee ?? 0;
  const fine = transaction.fine ?? 0;
  return rentFee + fine;
}

function transactionDirection(transaction: TransactionHistoryItem) {
  const direction = normalizeTransactionDirection(transaction.direction);

  if (direction) {
    return direction;
  }

  if (transaction.type === "TOP_UP" || transaction.type === "REFUND") {
    return "CREDIT";
  }

  if (
    transaction.type === "RENTAL" ||
    transaction.type === "RENT_PAYMENT" ||
    transaction.type === "FINE_PAYMENT"
  ) {
    return "DEBIT";
  }

  if (typeof transaction.amount === "number") {
    return transaction.amount >= 0 ? "CREDIT" : "DEBIT";
  }

  return null;
}

export function HomeScreen() {
  const { accessToken, me, refreshMe } = useAuth();
  const [activeRental, setActiveRental] = useState<ActiveRentalResponse>(null);
  const [activeRentalError, setActiveRentalError] = useState<string | null>(null);
  const [activeRentalLoading, setActiveRentalLoading] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [developerTimerToolsVisible, setDeveloperTimerToolsVisible] = useState(false);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [timerNowMs, setTimerNowMs] = useState(Date.now());
  const [timerSkipOffsetMs, setTimerSkipOffsetMs] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const balance = me ? formatRupiah(me.wallet.balance) : "Rp 0";
  const balanceLabel = balanceVisible ? balance : "Rp ••••••";
  const activeTimeLeftSeconds = activeRental
    ? Math.max(
        0,
        Math.floor(
          (new Date(activeRental.dueAt).getTime() -
            (timerNowMs + serverOffsetMs + timerSkipOffsetMs)) /
            1000,
        ),
      )
    : 0;
  const activeRentalIsLate = Boolean(
    activeRental && (activeRental.status === "LATE" || activeTimeLeftSeconds <= 0),
  );

  const loadActiveRental = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (!accessToken) {
        setActiveRental(null);
        return;
      }

      if (showLoading) {
        setActiveRentalLoading(true);
      }
      setActiveRentalError(null);

      try {
        const rental = await getActiveRentalRequest(accessToken);
        setActiveRental(rental);
        setTimerNowMs(Date.now());
        setTimerSkipOffsetMs(0);
        setServerOffsetMs(rental ? calculateServerTimeOffsetMs(rental.serverNow) : 0);
        void scheduleRentalReminders(rental);
      } catch (error) {
        setActiveRentalError(messageFrom(error));
      } finally {
        if (showLoading) {
          setActiveRentalLoading(false);
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadActiveRental();
  }, [loadActiveRental, me?.activeRentalId]);

  useEffect(() => {
    if (!activeRental) {
      return undefined;
    }

    const interval = setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRental]);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const interval = setInterval(() => {
      void loadActiveRental({ showLoading: false });
    }, 30000);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void loadActiveRental({ showLoading: false });
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [accessToken, loadActiveRental]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await Promise.all([refreshMe(), loadActiveRental({ showLoading: false })]);
    } finally {
      setRefreshing(false);
    }
  }, [loadActiveRental, refreshMe]);

  const skipTimerToLastFiveSeconds = useCallback(() => {
    if (!activeRental) {
      return;
    }

    const correctedNowMs = Date.now() + serverOffsetMs;
    const targetNowMs = new Date(activeRental.dueAt).getTime() - 5000;
    setTimerNowMs(Date.now());
    setTimerSkipOffsetMs(Math.max(0, targetNowMs - correctedNowMs));
  }, [activeRental, serverOffsetMs]);

  const clearTimerSkip = useCallback(() => {
    setTimerNowMs(Date.now());
    setTimerSkipOffsetMs(0);
  }, []);

  const homeRefreshControl = (
    <RefreshControl
      colors={[colors.accent]}
      onRefresh={() => void handleRefresh()}
      refreshing={refreshing}
      tintColor={colors.accent}
    />
  );

  return (
    <ScreenShell activeTab="Home" refreshControl={homeRefreshControl}>
      <View style={screenStyles.balanceCard}>
        <View style={screenStyles.balanceTop}>
          <View>
            <Text style={screenStyles.balanceLabel}>Your Balance:</Text>
            <Text style={screenStyles.balanceAmount}>{balanceLabel}</Text>
          </View>
          <Pressable
            accessibilityLabel={balanceVisible ? "Hide balance" : "Show balance"}
            accessibilityRole="button"
            onPress={() => setBalanceVisible((current) => !current)}
            style={screenStyles.eyeButton}
          >
            <Ionicons
              name={balanceVisible ? "eye-outline" : "eye-off-outline"}
              size={22}
              color={colors.textOnPrimary}
            />
          </Pressable>
        </View>
        <View style={screenStyles.balanceActions}>
          <Pressable style={screenStyles.topUpButton} onPress={() => router.push("/top-up")}>
            <Text style={screenStyles.topUpButtonText}>Top Up</Text>
          </Pressable>
        </View>
      </View>

      {activeRentalLoading && !activeRental ? (
        <View style={screenStyles.inlineStatus}>
          <ActivityIndicator color={colors.accent} />
          <Text style={screenStyles.cardBody}>Loading rent status...</Text>
        </View>
      ) : null}

      {activeRental ? (
        <Card style={screenStyles.activeCard}>
          <View style={screenStyles.sheetHeader}>
            <Text style={screenStyles.cardTitle}>Rent Status</Text>
            <StatusBadge
              label={activeRentalIsLate ? "LATE RENTAL" : "ACTIVE RENTAL"}
              tone={activeRentalIsLate ? "success" : "primary"}
            />
          </View>
          {activeRentalLoading ? (
            <View style={screenStyles.inlineStatus}>
              <ActivityIndicator color={colors.accent} />
              <Text style={screenStyles.cardBody}>Refreshing rent status...</Text>
            </View>
          ) : null}
          <View style={screenStyles.activeRentalBody}>
            <Text style={screenStyles.cardBody}>
              {activeRental.locker.name} - Locker {activeRental.compartmentNumber}
            </Text>
            <View style={screenStyles.metricRow}>
              <MetricBlock
                label={activeRentalIsLate ? "Late by" : "Time left"}
                value={formatTimeLeft(
                  activeRentalIsLate
                    ? Math.max(
                        0,
                        Math.floor(
                          (timerNowMs +
                            serverOffsetMs +
                            timerSkipOffsetMs -
                            new Date(activeRental.dueAt).getTime()) /
                            1000,
                        ),
                      )
                    : activeTimeLeftSeconds,
                )}
              />
              <MetricBlock label="Fee" value={formatRupiah(activeRental.estimatedFee)} />
            </View>
            {activeRentalIsLate ? (
              <Text style={screenStyles.warningText}>
                Rental time is over. Please return the extension cable as soon as possible.
              </Text>
            ) : null}
            <PrimaryButton label="Return" onPress={() => router.push("/return/review")} />
            {showDeveloperTools ? (
              <>
                <SecondaryButton
                  label={
                    developerTimerToolsVisible ? "Hide Timer Dev Tools" : "Timer Developer Tools"
                  }
                  onPress={() => setDeveloperTimerToolsVisible((current) => !current)}
                />
                {developerTimerToolsVisible ? (
                  <View style={screenStyles.developerBox}>
                    <Text style={screenStyles.manualCodeTitle}>Timer Debug</Text>
                    <DetailRow label="Server offset" value={`${Math.round(serverOffsetMs)} ms`} />
                    <DetailRow
                      label="Skip offset"
                      value={`${Math.round(timerSkipOffsetMs / 1000)}s`}
                    />
                    <DetailRow label="Backend dueAt" value={formatDateTime(activeRental.dueAt)} />
                    <View style={screenStyles.developerActionRow}>
                      <SecondaryButton
                        label="Skip to Last 5 Seconds"
                        onPress={skipTimerToLastFiveSeconds}
                      />
                      <SecondaryButton label="Reset Timer" onPress={clearTimerSkip} />
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </Card>
      ) : activeRentalError ? (
        <Text style={screenStyles.errorText}>{activeRentalError}</Text>
      ) : null}

      <ImageBackground
        accessibilityIgnoresInvertColors
        imageStyle={screenStyles.promoImage}
        resizeMode="cover"
        source={{ uri: "https://picsum.photos/seed/colokin-campus-power/900/420" }}
        style={screenStyles.promo}
      >
        <View style={screenStyles.promoOverlay} />
        <View style={screenStyles.promoBadge}>
          <Text style={screenStyles.promoBadgeText}>PROMO</Text>
        </View>
        <Text style={screenStyles.promoTitle}>Stay powered up at your favorite campus spot.</Text>
      </ImageBackground>

      <Card>
        <View style={screenStyles.locationCardHeader}>
          <View style={screenStyles.iconCircle}>
            <Ionicons name="location-outline" size={22} color={colors.primary} />
          </View>
          <View style={screenStyles.flexText}>
            <Text style={screenStyles.cardTitle}>Rent Location</Text>
            <Text style={screenStyles.cardBody}>Find the nearest Colok.in locker</Text>
          </View>
        </View>
        <PrimaryButton label="See Location" onPress={() => router.push("/locations")} />
      </Card>

      <View style={screenStyles.helpGrid}>
        <HelpCard href="/help/top-up" icon="wallet-outline" title="How to Top Up Colok.in Credit" />
        <HelpCard href="/help/rent" icon="flash-outline" title="How to Rent Extension Cable" />
      </View>
    </ScreenShell>
  );
}

export function LocationsScreen() {
  return (
    <ScreenShell activeTab="Home">
      <View style={screenStyles.mapPanel}>
        <View style={screenStyles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <Text style={screenStyles.searchPlaceholder}>Find nearby lockers...</Text>
        </View>
        <View style={[screenStyles.mapRoad, screenStyles.mapRoadOne]} />
        <View style={[screenStyles.mapRoad, screenStyles.mapRoadTwo]} />
        <MapLockerMarker top={170} left={72} />
        <MapLockerMarker top={250} left={220} muted />
      </View>
      <Card>
        <View style={screenStyles.sheetHeader}>
          <View>
            <Text style={screenStyles.cardTitle}>{demoLocker.name}</Text>
            <Text style={screenStyles.cardBody}>{demoLocker.distance}</Text>
          </View>
          <StatusBadge label={demoLocker.status} />
        </View>
        <View style={screenStyles.metricRow}>
          <MetricBlock label="Available cables" value={demoLocker.available} />
          <MetricBlock label="Rate" value={demoLocker.rate} />
        </View>
        <PrimaryButton label="Scan QR" onPress={() => router.push("/scan")} />
      </Card>
    </ScreenShell>
  );
}

export function ScanScreen() {
  return (
    <View style={screenStyles.scanner}>
      <Text style={screenStyles.scannerBrand}>Colok.in</Text>
      <Text style={screenStyles.scannerInstruction}>
        Scan the nearest Colok.in locker QR Code here!
      </Text>
      <View style={screenStyles.scanFrame}>
        <View style={[screenStyles.corner, screenStyles.cornerTopLeft]} />
        <View style={[screenStyles.corner, screenStyles.cornerTopRight]} />
        <View style={[screenStyles.corner, screenStyles.cornerBottomLeft]} />
        <View style={[screenStyles.corner, screenStyles.cornerBottomRight]} />
        <View style={screenStyles.scanLine} />
      </View>
      <Pressable style={screenStyles.flashButton}>
        <Ionicons name="flashlight-outline" size={24} color={colors.textOnPrimary} />
      </Pressable>
      <Text style={screenStyles.flashLabel}>Flashlight</Text>
      <View style={screenStyles.manualCodeBox}>
        <Ionicons name="keypad-outline" size={20} color={colors.accent} />
        <View style={screenStyles.flexText}>
          <Text style={screenStyles.manualCodeTitle}>Manual code input</Text>
          <Text style={screenStyles.manualCodeText}>
            Use this fallback if camera access is unavailable.
          </Text>
        </View>
      </View>
      <View style={screenStyles.scannerActions}>
        <SecondaryButton label="Rent Duration" onPress={() => router.push("/rent/duration")} />
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </View>
    </View>
  );
}

export function TransactionsScreen() {
  const { accessToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);

  const loadTransactions = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (!accessToken) {
        setTransactions([]);
        return;
      }

      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      try {
        setTransactions(await listTransactionsRequest(accessToken));
      } catch (loadError) {
        setError(messageFrom(loadError));
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await loadTransactions({ showLoading: false });
    } finally {
      setRefreshing(false);
    }
  }, [loadTransactions]);

  return (
    <ScreenShell
      activeTab="Transactions"
      title="Transaction History"
      subtitle="Review your past rentals and charges."
      refreshControl={
        <RefreshControl
          colors={[colors.accent]}
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
    >
      {loading ? (
        <View style={screenStyles.inlineStatus}>
          <ActivityIndicator color={colors.accent} />
          <Text style={screenStyles.cardBody}>Loading transactions...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <Card>
          <Text style={screenStyles.cardBody}>{error}</Text>
          <SecondaryButton label="Retry" onPress={() => void loadTransactions()} />
        </Card>
      ) : null}

      {!loading && !error && transactions.length === 0 ? (
        <Card>
          <Text style={screenStyles.cardTitle}>No transactions yet</Text>
          <Text style={screenStyles.cardBody}>
            Rental, return, fine, and top up activity will appear here.
          </Text>
        </Card>
      ) : null}

      {transactions.map((transaction) => {
        const item = transaction as unknown as TransactionHistoryItem;
        const typeLabel = labelFromTransactionType(item.type);
        const statusLabel = String(item.status ?? "SUCCESS");
        const amount = transactionAmount(item);
        const direction = transactionDirection(item);
        const amountTone =
          direction === "CREDIT"
            ? screenStyles.amountCredit
            : direction === "DEBIT"
              ? screenStyles.amountDebit
              : undefined;
        const title = item.title ?? typeLabel;
        const location = item.locationName;
        const date = item.completedAt ?? item.returnedAt ?? item.startRentAt;
        const startedAt = item.startRentAt ?? item.completedAt;
        const rentalRange =
          item.type === "RENTAL" && item.returnedAt
            ? `${formatDateTime(startedAt)} - ${formatDateTime(item.returnedAt)}`
            : formatDateTime(date);

        return (
          <Card key={transaction.id}>
            <View style={screenStyles.sheetHeader}>
              <View style={screenStyles.iconCircle}>
                <Ionicons
                  name={iconFromTransactionType(item.type)}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={screenStyles.flexText}>
                <Text style={screenStyles.cardTitle}>{title}</Text>
                <Text style={screenStyles.cardBody}>{location ?? typeLabel}</Text>
                <Text style={screenStyles.metaText}>{rentalRange}</Text>
              </View>
              <StatusBadge
                label={statusLabel.replaceAll("_", " ")}
                tone={
                  statusLabel === "RETURNED" || statusLabel === "SUCCESS" ? "primary" : "warning"
                }
              />
            </View>
            {item.type === "RENTAL" ? (
              <View style={screenStyles.transactionDetailBox}>
                {typeof item.durationMinutes === "number" ? (
                  <DetailRow label="Duration" value={formatDuration(item.durationMinutes)} />
                ) : null}
                <DetailRow label="Rent fee" value={formatRupiah(item.totalRentFee ?? amount)} />
                {item.fine && item.fine > 0 ? (
                  <DetailRow label="Fine" value={formatRupiah(item.fine)} />
                ) : null}
              </View>
            ) : null}
            <View style={screenStyles.transactionFooter}>
              <Text style={screenStyles.cardBody}>
                {direction === "CREDIT"
                  ? "Wallet credit"
                  : direction === "DEBIT"
                    ? "Wallet debit"
                    : typeLabel}
              </Text>
              <Text style={[screenStyles.amountText, amountTone]}>
                {formatSignedRupiah(amount, direction)}
              </Text>
            </View>
          </Card>
        );
      })}
    </ScreenShell>
  );
}

export function NotificationsScreen() {
  const { accessToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (!accessToken) {
        setNotifications([]);
        return;
      }

      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      try {
        setNotifications(await listNotificationsRequest(accessToken));
      } catch (loadError) {
        setError(messageFrom(loadError));
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void loadNotifications({ showLoading: false });
      }
    }, 45000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void loadNotifications({ showLoading: false });
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [accessToken, loadNotifications]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNotifications({ showLoading: false });
    } finally {
      setRefreshing(false);
    }
  }, [loadNotifications]);

  const handleNotificationPress = useCallback(
    async (notification: NotificationListItem) => {
      const shouldOpenTransactions = Boolean(
        notification.relatedTransactionId || notification.relatedRentalId,
      );

      if (!accessToken) {
        if (shouldOpenTransactions) {
          router.push("/transactions");
        }
        return;
      }

      if (!notification.readAt) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        );

        try {
          await markNotificationReadRequest(accessToken, notification.id);
        } catch {
          await loadNotifications({ showLoading: false });
        }
      }

      if (shouldOpenTransactions) {
        router.push("/transactions");
      }
    },
    [accessToken, loadNotifications],
  );

  return (
    <ScreenShell
      activeTab="Notifications"
      title="Notifications"
      refreshControl={
        <RefreshControl
          colors={[colors.accent]}
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
    >
      {loading ? (
        <View style={screenStyles.inlineStatus}>
          <ActivityIndicator color={colors.accent} />
          <Text style={screenStyles.cardBody}>Loading notifications...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <Card>
          <Text style={screenStyles.cardBody}>{error}</Text>
          <SecondaryButton label="Retry" onPress={() => void loadNotifications()} />
        </Card>
      ) : null}

      {!loading && !error && notifications.length === 0 ? (
        <Card>
          <Text style={screenStyles.cardTitle}>No notifications yet</Text>
          <Text style={screenStyles.cardBody}>
            Rental reminders, top up updates, and return status will appear here.
          </Text>
        </Card>
      ) : null}

      {notifications.map((notification) => (
        <Pressable
          accessibilityRole="button"
          key={notification.id}
          onPress={() => void handleNotificationPress(notification)}
        >
          <Card style={notification.readAt ? undefined : screenStyles.unreadCard}>
            <View style={screenStyles.notificationRow}>
              <View style={screenStyles.iconCircle}>
                <Ionicons name="notifications-outline" size={20} color={colors.primary} />
              </View>
              <View style={screenStyles.flexText}>
                <View style={screenStyles.notificationTitleRow}>
                  <Text style={screenStyles.cardTitle}>{notification.title}</Text>
                  {notification.readAt ? null : <View style={screenStyles.unreadDot} />}
                </View>
                <Text style={screenStyles.cardBody}>{notification.message}</Text>
                <Text style={screenStyles.metaText}>
                  {formatNotificationTime(notification.createdAt)}
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </ScreenShell>
  );
}

export function SettingsScreen() {
  const { logout, me } = useAuth();
  const initial = me?.name.charAt(0).toUpperCase() ?? "C";
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  return (
    <ScreenShell activeTab="Settings" title="Settings">
      <Card>
        <View style={screenStyles.profileRow}>
          <View style={screenStyles.profileAvatar}>
            <Text style={screenStyles.profileAvatarText}>{initial}</Text>
          </View>
          <View style={screenStyles.flexText}>
            <Text style={screenStyles.cardTitle}>{me?.name ?? "Colok.in User"}</Text>
            <Text style={screenStyles.cardBody}>{me?.phone ?? "-"}</Text>
            <Text style={screenStyles.cardBody}>{me?.email ?? "-"}</Text>
          </View>
        </View>
      </Card>
      <Card style={screenStyles.menuCard}>
        {settingsMenuItems.map((item, index) => (
          <Pressable
            accessibilityRole="button"
            key={item.title}
            onPress={() => router.push(item.href)}
            style={[
              screenStyles.menuItem,
              index === settingsMenuItems.length - 1 && screenStyles.menuItemLast,
            ]}
          >
            <View style={screenStyles.menuIcon}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
            </View>
            <View style={screenStyles.flexText}>
              <Text style={screenStyles.menuText}>{item.title}</Text>
              <Text style={screenStyles.menuDescription}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirmingLogout(true)}
        style={screenStyles.logoutButton}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.textOnPrimary} />
        <Text style={screenStyles.logoutButtonText}>Log Out</Text>
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmingLogout(false)}
        transparent
        visible={confirmingLogout}
      >
        <View style={screenStyles.logoutModalBackdrop}>
          <Card style={screenStyles.confirmCard}>
            <Text style={screenStyles.cardTitle}>Log out of Colok.in?</Text>
            <Text style={screenStyles.cardBody}>
              You will need to log in again before renting or topping up your wallet.
            </Text>
            <View style={screenStyles.confirmActions}>
              <SecondaryButton label="Cancel" onPress={() => setConfirmingLogout(false)} />
              <Pressable
                accessibilityRole="button"
                onPress={() => void logout()}
                style={screenStyles.logoutConfirmButton}
              >
                <Text style={screenStyles.logoutButtonText}>Log Out</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
    </ScreenShell>
  );
}

export function ApplicationSettingsScreen() {
  const [pushReminders, setPushReminders] = useState(true);
  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  return (
    <ScreenShell
      activeTab="Settings"
      title="Application Settings"
      subtitle="Adjust local preferences for your Colok.in rental experience."
    >
      <SettingsToggleRow
        description="Keep local reminders active before rentals are due."
        enabled={pushReminders}
        icon="notifications-outline"
        label="Rental reminders"
        onChange={setPushReminders}
      />
      <SettingsToggleRow
        description="Require biometric confirmation before payment-sensitive actions."
        enabled={biometricUnlock}
        icon="finger-print-outline"
        label="Biometric confirmation"
        onChange={setBiometricUnlock}
      />
      <SettingsToggleRow
        description="Use tighter spacing for denser transaction lists."
        enabled={compactMode}
        icon="contract-outline"
        label="Compact mode"
        onChange={setCompactMode}
      />
    </ScreenShell>
  );
}

export function HelpSupportScreen() {
  return (
    <ScreenShell
      activeTab="Settings"
      title="Help & Support"
      subtitle="Quick answers for renting, returning, and managing wallet balance."
    >
      <InfoSection
        icon="flash-outline"
        title="Rental support"
        body="Scan a locker QR, choose duration, confirm wallet payment, and take the extension cable from the opened compartment."
      />
      <InfoSection
        icon="return-down-back-outline"
        title="Return support"
        body="Tap Return from an active rental, follow the assigned compartment instruction, close the locker securely, and wait for return verification."
      />
      <InfoSection
        icon="wallet-outline"
        title="Wallet support"
        body="Use Top Up to generate a payment QR, complete the payment flow, and refresh your wallet balance before renting."
      />
    </ScreenShell>
  );
}

export function TermsPoliciesScreen() {
  return (
    <ScreenShell
      activeTab="Settings"
      title="Terms & Policies"
      subtitle="Usage rules for Colok.in rentals and wallet payments."
    >
      <InfoSection
        icon="shield-checkmark-outline"
        title="Rental responsibility"
        body="Users are responsible for returning the same extension cable before the rental time ends."
      />
      <InfoSection
        icon="time-outline"
        title="Late returns"
        body="A 15-minute grace tolerance applies before late fines are calculated by the backend."
      />
      <InfoSection
        icon="card-outline"
        title="Wallet balance"
        body="Wallet balance is used to pay rental fees and late fines. Make sure your balance is sufficient before confirming a rental."
      />
    </ScreenShell>
  );
}

export function FeedbackScreen() {
  const { accessToken } = useAuth();
  const [category, setCategory] = useState<(typeof feedbackCategories)[number]["value"]>("SUPPORT");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function submitFeedback() {
    if (!accessToken) {
      setError("Please log in before submitting feedback.");
      return;
    }

    setError(null);
    setSuccess(null);

    if (subject.trim().length < 3 || message.trim().length < 10) {
      setError("Please enter a subject and at least 10 characters of feedback.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await createFeedbackRequest(accessToken, {
        category,
        subject,
        message,
      });
      setSubject("");
      setMessage("");
      setSuccess(`Feedback submitted. Ticket ${response.id.slice(-6).toUpperCase()} is open.`);
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell
      activeTab="Settings"
      title="Feedback"
      subtitle="Send feedback directly to the Colok.in team."
    >
      <Card style={screenStyles.feedbackCard}>
        <Text style={screenStyles.fieldLabel}>Category</Text>
        <View style={screenStyles.segmentRow}>
          {feedbackCategories.map((item) => {
            const selected = item.value === category;
            return (
              <Pressable
                accessibilityRole="button"
                key={item.value}
                onPress={() => setCategory(item.value)}
                style={[screenStyles.segmentButton, selected && screenStyles.segmentButtonActive]}
              >
                <Text
                  style={[screenStyles.segmentText, selected && screenStyles.segmentTextActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={screenStyles.fieldLabel}>Subject</Text>
        <TextInput
          onChangeText={setSubject}
          placeholder="What should we look at?"
          placeholderTextColor={colors.textDisabled}
          style={screenStyles.textInput}
          value={subject}
        />
        <Text style={screenStyles.fieldLabel}>Message</Text>
        <TextInput
          multiline
          onChangeText={setMessage}
          placeholder="Tell us what happened or what you need."
          placeholderTextColor={colors.textDisabled}
          style={[screenStyles.textInput, screenStyles.textArea]}
          textAlignVertical="top"
          value={message}
        />
        {error ? <Text style={screenStyles.errorText}>{error}</Text> : null}
        {success ? <Text style={screenStyles.successText}>{success}</Text> : null}
        <PrimaryButton
          label={submitting ? "Submitting..." : "Submit Feedback"}
          onPress={() => void submitFeedback()}
        />
      </Card>
    </ScreenShell>
  );
}

export function AboutUsScreen() {
  return (
    <ScreenShell
      activeTab="Settings"
      title="About Us"
      subtitle="Colok.in smart lockers for extension cable rentals."
    >
      <InfoSection
        icon="battery-charging-outline"
        title="What Colok.in does"
        body="Colok.in helps students and flexible workers rent SNI-ready extension cables from smart lockers in public spaces."
      />
      <InfoSection
        icon="hardware-chip-outline"
        title="Connected locker system"
        body="The app connects mobile rental flows, backend rental records, wallet transactions, notifications, QR validation, and locker return verification."
      />
      <InfoSection
        icon="location-outline"
        title="Locker locations"
        body="Colok.in can operate across campus and public locations where users need quick access to ready-to-use extension cables."
      />
    </ScreenShell>
  );
}

export function TopUpGuideScreen() {
  return (
    <ScreenShell activeTab="Home" title="How to Top Up" subtitle="Add Colok.in wallet balance.">
      <InfoSection
        icon="create-outline"
        title="Enter amount"
        body="Open Top Up from Home, enter the amount in Rupiah, then generate the payment QR code."
      />
      <InfoSection
        icon="qr-code-outline"
        title="Confirm QR"
        body="Use the confirm action or scanner flow to validate the payment QR created for your top up."
      />
      <InfoSection
        icon="checkmark-circle-outline"
        title="Balance updates"
        body="After confirmation, your wallet balance, Transactions, and Notifications refresh with the top up record."
      />
    </ScreenShell>
  );
}

export function RentGuideScreen() {
  return (
    <ScreenShell activeTab="Home" title="How to Rent" subtitle="Rent an extension cable.">
      <InfoSection
        icon="location-outline"
        title="Find a locker"
        body="Open Rent Location and choose an online Colok.in locker with available cable stock."
      />
      <InfoSection
        icon="scan-outline"
        title="Scan QR"
        body="Scan the locker QR, pick a rental duration, and review the wallet charge before confirming."
      />
      <InfoSection
        icon="return-down-back-outline"
        title="Return on time"
        body="Use the active Rent Status card to start return, place the cable in the assigned compartment, and wait for verification."
      />
    </ScreenShell>
  );
}

export function RentDurationScreen() {
  const params = useLocalSearchParams<{
    availableCableCount?: string;
    compartmentId?: string;
    compartmentNumber?: string;
    lockerId?: string;
    lockerName?: string;
  }>();
  const { accessToken } = useAuth();
  const availableCableCount = params.availableCableCount ?? "3";
  const lockerId = params.lockerId ?? "lck_labtek_v_itb";
  const lockerName = params.lockerName ?? demoLocker.name;
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function adjustDuration(delta: number) {
    setDurationMinutes((current) => Math.min(360, Math.max(30, current + delta)));
  }

  async function handleQuote() {
    if (!accessToken) {
      setError("Please log in again to continue.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const quote = await createRentalQuoteRequest(accessToken, {
        durationMinutes,
        lockerId,
      });

      router.push({
        pathname: "/rent/review",
        params: {
          availableCableCount: String(quote.availableCableCount),
          compartmentId: params.compartmentId ?? "",
          compartmentNumber: params.compartmentNumber ?? "",
          depositAmount: String(quote.depositAmount),
          durationMinutes: String(quote.durationMinutes),
          lockerId: quote.lockerId,
          lockerName: quote.locationName,
          rentFee: String(quote.rentFee),
          totalCharge: String(quote.totalCharge),
        },
      });
    } catch (quoteError) {
      setError(messageFrom(quoteError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalScreen
      primaryLabel={loading ? "Loading..." : "Confirm"}
      onPrimary={() => void handleQuote()}
    >
      <Text style={screenStyles.modalTitle}>
        There are {availableCableCount} extension cable available!
      </Text>
      <Text style={screenStyles.cardBody}>{lockerName}</Text>
      {params.compartmentNumber ? (
        <Text style={screenStyles.cardBody}>Suggested locker {params.compartmentNumber}</Text>
      ) : null}
      <Text style={screenStyles.cardBody}>Please set your rental duration</Text>
      <View style={screenStyles.stepperRow}>
        <StepperUnit
          label="Hours"
          onDecrease={() => adjustDuration(-60)}
          onIncrease={() => adjustDuration(60)}
          value={String(Math.floor(durationMinutes / 60))}
        />
        <StepperUnit
          label="Minutes"
          onDecrease={() => adjustDuration(-30)}
          onIncrease={() => adjustDuration(30)}
          value={String(durationMinutes % 60)}
        />
      </View>
      <View style={screenStyles.summaryBox}>
        <Text style={screenStyles.summaryText}>Duration: {formatDuration(durationMinutes)}</Text>
      </View>
      {error ? <Text style={screenStyles.errorText}>{error}</Text> : null}
    </ModalScreen>
  );
}

export function RentReviewScreen() {
  const params = useLocalSearchParams<{
    compartmentId?: string;
    compartmentNumber?: string;
    durationMinutes?: string;
    lockerId?: string;
    lockerName?: string;
    rentFee?: string;
    totalCharge?: string;
  }>();
  const { accessToken, me, refreshMe } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const durationMinutes = Number(params.durationMinutes ?? 120);
  const rentFee = Number(params.rentFee ?? 50000);
  const totalCharge = Number(params.totalCharge ?? rentFee);
  const lockerId = params.lockerId ?? "";
  const lockerName = params.lockerName ?? demoLocker.name;
  const walletBalance = me?.wallet.balance ?? 0;

  async function handleCreateRental() {
    if (!accessToken || !lockerId) {
      setError("Rental detail is incomplete. Please scan the locker QR again.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rental = await createRentalRequest(accessToken, {
        lockerId,
        compartmentId: params.compartmentId || undefined,
        durationMinutes,
        paymentSource: "WALLET",
      });
      await refreshMe();

      if (rental.status === "UNLOCKING") {
        router.replace({
          pathname: "/rent/pending",
          params: {
            compartmentNumber: String(rental.compartmentNumber),
            dueAt: rental.dueAt,
            lockerName: rental.locker.name,
            rentFee: String(rental.rentFee),
            rentalId: rental.id,
          },
        });
        return;
      }

      if (rental.status === "ACTIVE") {
        routeToRentSuccess(rental);
        return;
      }

      setError(`Rental is ${rental.status.toLowerCase().replaceAll("_", " ")}. Please try again.`);
    } catch (createError) {
      if (createError instanceof ApiClientError) {
        if (createError.code === "INSUFFICIENT_BALANCE") {
          setError("Your wallet balance is not enough. Please top up before renting.");
          return;
        }

        if (createError.code === "USER_HAS_ACTIVE_RENTAL") {
          router.replace("/home");
          return;
        }
      }

      setError(messageFrom(createError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalScreen
      primaryLabel={loading ? "Unlocking..." : "Confirm"}
      onPrimary={() => void handleCreateRental()}
    >
      <Text style={screenStyles.modalTitle}>Ready to Rent?</Text>
      <Text style={screenStyles.cardBody}>Please review your rent detail:</Text>
      <View>
        <DetailRow label="Location" value={lockerName} />
        <DetailRow label="Duration" value={formatDuration(durationMinutes)} />
        <DetailRow label="Estimated Fee" value={formatRupiah(rentFee)} />
        <DetailRow label="Total Charge" value={formatRupiah(totalCharge)} />
        <DetailRow label="Wallet Balance" value={formatRupiah(walletBalance)} />
      </View>
      {error ? (
        <View style={screenStyles.reviewErrorBox}>
          <Text style={screenStyles.errorText}>{error}</Text>
          {error.includes("top up") ? (
            <SecondaryButton label="Top Up" onPress={() => router.push("/top-up")} />
          ) : null}
        </View>
      ) : null}
    </ModalScreen>
  );
}

export function RentPendingScreen() {
  const params = useLocalSearchParams<{
    compartmentNumber?: string;
    dueAt?: string;
    lockerName?: string;
    rentFee?: string;
    rentalId?: string;
  }>();
  const { accessToken, refreshMe } = useAuth();
  const rentalId = params.rentalId ?? "";
  const [checking, setChecking] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [statusLabel, setStatusLabel] = useState("Unlocking locker");
  const [timedOut, setTimedOut] = useState(false);
  const progress = Math.min(1, elapsedMs / rentalUnlockTimeoutMs);
  const remainingSeconds = Math.max(0, Math.ceil((rentalUnlockTimeoutMs - elapsedMs) / 1000));
  const dueAt = params.dueAt ? new Date(params.dueAt).toLocaleString("id-ID") : "-";

  useEffect(() => {
    if (!accessToken || !rentalId) {
      setChecking(false);
      setError("Rental detail is incomplete. Please scan the locker QR again.");
      return;
    }

    const token = accessToken;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function pollRental() {
      const nextElapsedMs = Date.now() - startedAt;
      let shouldPollAgain = true;

      if (cancelled) {
        return;
      }

      setElapsedMs(nextElapsedMs);

      if (nextElapsedMs >= rentalUnlockTimeoutMs) {
        shouldPollAgain = false;
        setChecking(false);
        setStatusLabel("Checking final unlock status");

        try {
          const rental = await getRentalRequest(token, rentalId);

          if (cancelled) {
            return;
          }

          if (rental.status === "ACTIVE") {
            await refreshMe();

            if (!cancelled) {
              routeToRentSuccess(rental);
            }
            return;
          }

          if (rental.status === "FAILED" || rental.status === "CANCELLED") {
            setTimedOut(false);
            setStatusLabel("Unlock failed");
            setError(
              "The locker did not confirm cable pickup in time. Your rental was not started.",
            );
            return;
          }
        } catch (pollError) {
          if (!cancelled) {
            setError(messageFrom(pollError));
          }
        }

        setTimedOut(true);
        setStatusLabel("Unlock timed out");
        return;
      }

      setChecking(true);

      try {
        const rental = await getRentalRequest(token, rentalId);

        if (cancelled) {
          return;
        }

        setError(null);

        if (rental.status === "ACTIVE") {
          shouldPollAgain = false;
          await refreshMe();

          if (!cancelled) {
            routeToRentSuccess(rental);
          }
          return;
        }

        if (rental.status === "FAILED" || rental.status === "CANCELLED") {
          shouldPollAgain = false;
          setChecking(false);
          setStatusLabel("Unlock failed");
          setError(
            "The locker could not be unlocked. Please try another locker or contact support.",
          );
          return;
        }

        setStatusLabel(
          rental.status === "UNLOCKING"
            ? "Unlocking locker"
            : rental.status.toLowerCase().replaceAll("_", " "),
        );
      } catch (pollError) {
        if (!cancelled) {
          setError(messageFrom(pollError));
        }
      } finally {
        if (!cancelled && shouldPollAgain) {
          setChecking(false);
          timeoutId = setTimeout(pollRental, rentalUnlockPollIntervalMs);
        }
      }
    }

    setElapsedMs(0);
    setError(null);
    setTimedOut(false);
    setStatusLabel("Unlocking locker");
    void pollRental();

    return () => {
      cancelled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [accessToken, refreshMe, rentalId, retryNonce]);

  function handleRetry() {
    setRetryNonce((current) => current + 1);
  }

  return (
    <ScreenShell
      activeTab="Home"
      title="Preparing Rental"
      subtitle="Keep this screen open while the locker unlocks."
    >
      <Card style={screenStyles.pendingCard}>
        <View style={screenStyles.pendingIconWrap}>
          {checking && !timedOut ? (
            <ActivityIndicator color={colors.accent} size="large" />
          ) : (
            <Ionicons
              color={timedOut || error ? colors.warning : colors.accent}
              name={timedOut || error ? "alert-circle-outline" : "lock-open-outline"}
              size={34}
            />
          )}
        </View>
        <View style={screenStyles.pendingCopy}>
          <Text style={screenStyles.pendingTitle}>{statusLabel}</Text>
          <Text style={screenStyles.cardBody}>
            {timedOut
              ? "The locker did not confirm cable pickup in time. Retry the status check before scanning another locker."
              : "We are confirming the compartment sensor and will continue automatically once the rental is active."}
          </Text>
        </View>
        <View style={screenStyles.pendingProgressTrack}>
          <View style={[screenStyles.pendingProgressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={screenStyles.metaText}>
          {timedOut ? "Status check paused" : `Timeout in ${remainingSeconds}s`}
        </Text>
      </Card>

      <Card style={screenStyles.pendingDetailCard}>
        <DetailRow label="Location" value={params.lockerName ?? demoLocker.name} />
        <DetailRow
          label="Locker"
          value={(params.compartmentNumber ?? demoLocker.compartment).toString()}
        />
        <DetailRow label="Rent Fee" value={formatRupiah(Number(params.rentFee ?? 50000))} />
        <DetailRow label="Due At" value={dueAt} />
      </Card>

      {error ? (
        <View style={screenStyles.reviewErrorBox}>
          <Text style={screenStyles.errorText}>{error}</Text>
          <View style={screenStyles.pendingActions}>
            <SecondaryButton label="Retry Status" onPress={handleRetry} />
            <SecondaryButton label="Back Home" onPress={() => router.replace("/")} />
          </View>
        </View>
      ) : null}
    </ScreenShell>
  );
}

export function RentSuccessScreen() {
  const params = useLocalSearchParams<{
    compartmentNumber?: string;
    dueAt?: string;
    lockerName?: string;
    rentFee?: string;
  }>();
  const compartmentNumber = params.compartmentNumber ?? demoLocker.compartment;
  const lockerName = params.lockerName ?? demoLocker.name;
  const rentFee = Number(params.rentFee ?? 50000);
  const dueAt = params.dueAt ? new Date(params.dueAt).toLocaleString("id-ID") : "-";

  return (
    <SuccessScreen
      title="Rent complete!"
      body="Please take your extension cable from the locker below."
    >
      <View style={screenStyles.lockerNumber}>
        <Text style={screenStyles.lockerLabel}>LOCKER</Text>
        <Text style={screenStyles.lockerValue}>
          {compartmentNumber.toString().padStart(2, "0")}
        </Text>
      </View>
      <View style={screenStyles.receiptBox}>
        <DetailRow label="Location" value={lockerName} />
        <DetailRow label="Rent Fee" value={formatRupiah(rentFee)} />
        <DetailRow label="Due At" value={dueAt} />
      </View>
    </SuccessScreen>
  );
}

export function ReturnReviewScreen() {
  const { accessToken, refreshMe } = useAuth();
  const [activeRental, setActiveRental] = useState<NonNullable<ActiveRentalResponse> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finePaid, setFinePaid] = useState(false);
  const [intent, setIntent] = useState<ReturnIntentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const loadReturnIntent = useCallback(async () => {
    if (!accessToken) {
      setError("Please log in again to continue.");
      return;
    }

    setLoading(true);
    setError(null);
    setShowTopUp(false);

    try {
      const rental = await getActiveRentalRequest(accessToken);

      if (!rental) {
        setActiveRental(null);
        setIntent(null);
        setError("You do not have an active rental to return.");
        return;
      }

      const nextIntent = await createReturnIntentRequest(accessToken, rental.id, {
        lockerId: rental.locker.id,
      });
      const intentWithFineState = nextIntent as ReturnIntentResponse &
        Partial<{ finePaid: boolean; finePaidAt: string | null }>;

      setActiveRental(rental);
      setIntent(nextIntent);
      setFinePaid(Boolean(intentWithFineState.finePaid || intentWithFineState.finePaidAt));
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadReturnIntent();
  }, [loadReturnIntent]);

  async function handlePrimary() {
    if (!accessToken || !intent) {
      setError("Return detail is not ready yet.");
      return;
    }

    const returnSessionId = intent.returnSessionId;
    const fine = intent.fine ?? 0;

    setSubmitting(true);
    setError(null);
    setShowTopUp(false);

    try {
      if (fine > 0 && !finePaid) {
        await payReturnFineRequest(accessToken, returnSessionId);
        await refreshMe();
        setFinePaid(true);
        return;
      }

      const confirmation = await confirmReturnRequest(accessToken, returnSessionId);
      router.replace({
        pathname: "/return/instruction",
        params: {
          compartmentNumber: String(confirmation.compartmentNumber),
          confirmed: "1",
          lockerName: confirmation.locker.name,
          returnSessionId,
          sensorTimeoutAt: confirmation.sensorTimeoutAt,
        },
      });
    } catch (submitError) {
      if (submitError instanceof ApiClientError && submitError.code === "INSUFFICIENT_BALANCE") {
        setError("Your wallet balance is not enough to pay the fine.");
        setShowTopUp(true);
        return;
      }

      setError(messageFrom(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  const returnLocation = intent?.returnLocation ?? activeRental?.locker.name ?? demoLocker.name;
  const fine = intent?.fine ?? activeRental?.fine ?? 0;
  const needsFinePayment = fine > 0 && !finePaid;
  const primaryLabel = submitting
    ? needsFinePayment
      ? "Processing..."
      : "Confirming..."
    : needsFinePayment
      ? "Confirm Payment Fine"
      : "Confirm";

  return (
    <ModalScreen
      primaryLabel={loading ? "Loading..." : primaryLabel}
      onPrimary={() => void handlePrimary()}
    >
      <Text style={screenStyles.modalTitle}>Are you ready to return this extension cable?</Text>
      <Text style={screenStyles.cardBody}>Please review your rent detail:</Text>
      {loading ? (
        <View style={screenStyles.inlineStatus}>
          <ActivityIndicator color={colors.accent} />
          <Text style={screenStyles.cardBody}>Preparing return detail...</Text>
        </View>
      ) : (
        <View>
          <DetailRow label="Location" value={returnLocation} />
          <DetailRow
            label="Time left"
            value={formatCompactDuration(
              intent?.timeLeftSeconds ?? activeRental?.timeLeftSeconds ?? 0,
            )}
          />
          <DetailRow label="Late By" value={formatCompactDuration(intent?.lateBySeconds ?? 0)} />
          <DetailRow label="Fine" value={formatRupiah(fine)} />
          {fine > 0 ? <DetailRow label="Fine Status" value={finePaid ? "Paid" : "Unpaid"} /> : null}
        </View>
      )}
      {error ? (
        <View style={screenStyles.reviewErrorBox}>
          <Text style={screenStyles.errorText}>{error}</Text>
          {showTopUp ? (
            <SecondaryButton label="Top Up" onPress={() => router.push("/top-up")} />
          ) : null}
          {!loading && !intent && !showTopUp ? (
            <SecondaryButton label="Retry" onPress={() => void loadReturnIntent()} />
          ) : null}
        </View>
      ) : null}
    </ModalScreen>
  );
}

export function ReturnInstructionScreen() {
  const params = useLocalSearchParams<{
    compartmentNumber?: string;
    confirmed?: string;
    lockerName?: string;
    returnSessionId?: string;
    sensorTimeoutAt?: string;
  }>();
  const { accessToken, refreshMe } = useAuth();
  const [confirmation, setConfirmation] = useState<ConfirmReturnResponse | null>(null);
  const [detail, setDetail] = useState<ReturnDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const returnSessionId = params.returnSessionId ?? "";
  const lockerName = confirmation?.locker.name ?? params.lockerName ?? demoLocker.name;
  const compartmentNumber =
    confirmation?.compartmentNumber ?? Number(params.compartmentNumber ?? demoLocker.compartment);
  const sensorTimeoutAt = confirmation?.sensorTimeoutAt ?? params.sensorTimeoutAt;

  const startReturnConfirmation = useCallback(async () => {
    if (!accessToken || !returnSessionId) {
      setError("Return session is missing. Please start the return flow again.");
      return;
    }

    setPolling(true);
    setTimedOut(false);
    setError(null);

    try {
      if (params.confirmed !== "1") {
        setConfirmation(await confirmReturnRequest(accessToken, returnSessionId));
      }

      const firstDetail = await getReturnSessionRequest(accessToken, returnSessionId);
      setDetail(firstDetail);
    } catch (startError) {
      setError(messageFrom(startError));
      setPolling(false);
    }
  }, [accessToken, params.confirmed, returnSessionId]);

  useEffect(() => {
    void startReturnConfirmation();
  }, [startReturnConfirmation]);

  useEffect(() => {
    if (!accessToken || !returnSessionId || !polling) {
      return undefined;
    }

    const token = accessToken;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const nextDetail = await getReturnSessionRequest(token, returnSessionId);

        if (cancelled) {
          return;
        }

        setDetail(nextDetail);

        if (nextDetail.status === "VERIFIED") {
          setPolling(false);
          await refreshMe();
          router.replace({
            pathname: "/return/success",
            params: {
              finalFee: String(nextDetail.finalFee),
              fine: String(nextDetail.fine),
              rentalId: nextDetail.rentalId,
              returnSessionId: nextDetail.id,
              station: lockerName,
              status: nextDetail.status,
              verifiedAt: nextDetail.verifiedAt ?? "",
            },
          });
          return;
        }

        if (nextDetail.status === "TIMEOUT") {
          setPolling(false);
          setTimedOut(true);
          return;
        }

        timeout = setTimeout(() => void poll(), 3000);
      } catch (pollError) {
        if (!cancelled) {
          setError(messageFrom(pollError));
          setPolling(false);
        }
      }
    }

    timeout = setTimeout(() => void poll(), 1500);

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [accessToken, lockerName, polling, refreshMe, returnSessionId]);

  return (
    <ScreenShell activeTab="Home" title="Return Cable">
      <Card>
        <View style={screenStyles.instructionIcon}>
          <Ionicons name="archive-outline" size={34} color={colors.primary} />
        </View>
        <Text style={screenStyles.instructionTitle}>
          Please place the extension cable in locker {compartmentNumber}, then close the locker
          securely.
        </Text>
        <Text style={screenStyles.cardBody}>
          Ensure the cable is fully inside the locker before closing the door. The system will
          automatically detect the return.
        </Text>
        <View style={screenStyles.receiptBox}>
          <DetailRow label="Location" value={lockerName} />
          <DetailRow label="Sensor timeout" value={formatDateTime(sensorTimeoutAt)} />
          <DetailRow label="Status" value={detail?.status?.replaceAll("_", " ") ?? "WAITING"} />
        </View>
        <View style={screenStyles.waitingBox}>
          {polling ? <ActivityIndicator color={colors.primary} /> : null}
          <Ionicons name="radio-outline" size={20} color={colors.primary} />
          <Text style={screenStyles.summaryText}>
            {timedOut ? "Sensor verification timed out." : "Waiting for locker sensor..."}
          </Text>
        </View>
        {error ? (
          <View style={screenStyles.reviewErrorBox}>
            <Text style={screenStyles.errorText}>{error}</Text>
            <SecondaryButton label="Retry" onPress={() => void startReturnConfirmation()} />
          </View>
        ) : null}
        {timedOut ? (
          <View style={screenStyles.reviewErrorBox}>
            <PrimaryButton
              label="Retry Verification"
              onPress={() => void startReturnConfirmation()}
            />
            <SecondaryButton label="Contact Support" onPress={() => router.push("/settings")} />
          </View>
        ) : null}
      </Card>
    </ScreenShell>
  );
}

export function ReturnSuccessScreen() {
  const params = useLocalSearchParams<{
    finalFee?: string;
    fine?: string;
    rentalId?: string;
    returnSessionId?: string;
    station?: string;
    verifiedAt?: string;
  }>();
  const finalFee = Number(params.finalFee ?? 0);
  const fine = Number(params.fine ?? 0);

  return (
    <SuccessScreen title="Return Complete" body="Your return has been completed successfully">
      <View style={screenStyles.receiptBox}>
        <DetailRow label="Station" value={params.station ?? demoLocker.name} />
        <DetailRow label="Time" value={formatDateTime(params.verifiedAt)} />
        <DetailRow label="Final Fee" value={formatRupiah(finalFee)} />
        <DetailRow label="Fine" value={formatRupiah(fine)} />
        <DetailRow label="Return ID" value={params.returnSessionId ?? "-"} />
      </View>
    </SuccessScreen>
  );
}

function HelpCard({
  href,
  icon,
  title,
}: {
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={screenStyles.helpCardPressable}
    >
      <Card style={screenStyles.helpCard}>
        <View style={screenStyles.iconCircle}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={screenStyles.helpTitle}>{title}</Text>
      </Card>
    </Pressable>
  );
}

function InfoSection({
  body,
  icon,
  title,
}: {
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <Card style={screenStyles.infoSection}>
      <View style={screenStyles.locationCardHeader}>
        <View style={screenStyles.iconCircle}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={screenStyles.flexText}>
          <Text style={screenStyles.cardTitle}>{title}</Text>
          <Text style={screenStyles.cardBody}>{body}</Text>
        </View>
      </View>
    </Card>
  );
}

function SettingsToggleRow({
  description,
  enabled,
  icon,
  label,
  onChange,
}: {
  description: string;
  enabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <Card style={screenStyles.settingToggleCard}>
      <View style={screenStyles.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={screenStyles.flexText}>
        <Text style={screenStyles.menuText}>{label}</Text>
        <Text style={screenStyles.menuDescription}>{description}</Text>
      </View>
      <Switch
        ios_backgroundColor={colors.surfaceMuted}
        onValueChange={onChange}
        thumbColor={enabled ? colors.accent : colors.textMuted}
        trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
        value={enabled}
      />
    </Card>
  );
}

function MapLockerMarker({ top, left, muted }: { top: number; left: number; muted?: boolean }) {
  return (
    <View
      style={[
        screenStyles.marker,
        {
          left,
          top,
          backgroundColor: muted ? colors.textMuted : colors.primary,
        },
      ]}
    >
      <Ionicons name="flash" size={18} color={colors.textOnPrimary} />
    </View>
  );
}

function StepperUnit({
  label,
  onDecrease,
  onIncrease,
  value,
}: {
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  value: string;
}) {
  return (
    <View style={screenStyles.stepperUnit}>
      <Pressable accessibilityRole="button" onPress={onDecrease} style={screenStyles.stepButton}>
        <Ionicons name="remove" size={18} color={colors.primary} />
      </Pressable>
      <Text style={screenStyles.stepValue}>{value}</Text>
      <Text style={screenStyles.stepLabel}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onIncrease} style={screenStyles.stepButton}>
        <Ionicons name="add" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  amountText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  amountCredit: {
    color: colors.primary,
  },
  amountDebit: {
    color: colors.danger,
  },
  activeCard: {
    borderLeftColor: colors.accent,
    borderLeftWidth: 5,
    gap: 16,
  },
  activeRentalBody: {
    gap: 16,
  },
  balanceAmount: {
    color: colors.textOnPrimary,
    fontSize: 30,
    fontWeight: "900",
  },
  balanceCard: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 18,
    gap: 18,
    padding: spacing.card,
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: "700",
  },
  balanceTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceActions: {
    flexDirection: "row",
    gap: 12,
  },
  cardBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  warningText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  corner: {
    borderColor: colors.accent,
    height: 48,
    position: "absolute",
    width: 48,
  },
  cornerBottomLeft: {
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    bottom: -2,
    left: -2,
  },
  cornerBottomRight: {
    borderBottomWidth: 5,
    borderRightWidth: 5,
    bottom: -2,
    right: -2,
  },
  cornerTopLeft: {
    borderLeftWidth: 5,
    borderTopWidth: 5,
    left: -2,
    top: -2,
  },
  cornerTopRight: {
    borderRightWidth: 5,
    borderTopWidth: 5,
    right: -2,
    top: -2,
  },
  developerActionRow: {
    gap: 10,
  },
  developerBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    gap: 12,
    padding: 14,
  },
  eyeButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 38,
    justifyContent: "center",
    marginTop: 8,
    width: 38,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  flashButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  flashLabel: {
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  flexText: {
    flex: 1,
    gap: 4,
  },
  feedbackCard: {
    gap: 12,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
  },
  helpCard: {
    flex: 1,
    gap: 14,
    minHeight: 132,
  },
  helpCardPressable: {
    flex: 1,
  },
  helpGrid: {
    flexDirection: "row",
    gap: 12,
  },
  helpTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  infoSection: {
    gap: 0,
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.iconCircle,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  instructionIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 82,
    justifyContent: "center",
    width: 82,
  },
  instructionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
    textAlign: "center",
  },
  inlineStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  locationCardHeader: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 18,
  },
  lockerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  lockerNumber: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 22,
    width: "100%",
  },
  lockerValue: {
    color: colors.primary,
    fontSize: 52,
    fontWeight: "900",
  },
  mapPanel: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    height: 410,
    overflow: "hidden",
    padding: 16,
  },
  mapRoad: {
    backgroundColor: "rgba(24, 215, 255, 0.18)",
    height: 54,
    position: "absolute",
    width: 520,
  },
  mapRoadOne: {
    left: -90,
    top: 150,
    transform: [{ rotate: "-23deg" }],
  },
  mapRoadTwo: {
    left: -70,
    top: 260,
    transform: [{ rotate: "18deg" }],
  },
  marker: {
    alignItems: "center",
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 4,
    height: 48,
    justifyContent: "center",
    position: "absolute",
    width: 48,
  },
  menuItem: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  menuCard: {
    paddingVertical: 2,
  },
  menuDescription: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  menuIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
  },
  confirmCard: {
    borderColor: `${colors.danger}66`,
    gap: 14,
    maxWidth: 360,
    width: "100%",
  },
  logoutModalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(3, 16, 27, 0.72)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.screen,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
  },
  logoutButton: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radii.button,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  logoutButtonText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  logoutConfirmButton: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radii.button,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  segmentButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    flex: 1,
    minWidth: 78,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: colors.textOnPrimary,
  },
  settingToggleCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  successText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  textArea: {
    minHeight: 130,
    paddingTop: 14,
  },
  textInput: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  notificationRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
  },
  notificationTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  profileAvatarText: {
    color: colors.textOnPrimary,
    fontSize: 22,
    fontWeight: "900",
  },
  profileRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  pendingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  pendingCard: {
    alignItems: "center",
    gap: 18,
  },
  pendingCopy: {
    alignItems: "center",
    gap: 8,
  },
  pendingDetailCard: {
    gap: 2,
  },
  pendingIconWrap: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 82,
    justifyContent: "center",
    width: 82,
  },
  pendingProgressFill: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: "100%",
  },
  pendingProgressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 12,
    overflow: "hidden",
    width: "100%",
  },
  pendingTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
    textAlign: "center",
  },
  promo: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    minHeight: 148,
    overflow: "hidden",
    padding: spacing.card,
  },
  promoImage: {
    opacity: 0.9,
  },
  promoOverlay: {
    backgroundColor: "rgba(5, 17, 38, 0.52)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  promoBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  promoBadgeText: {
    color: colors.accentText,
    fontSize: 11,
    fontWeight: "900",
  },
  promoTitle: {
    color: colors.textOnPrimary,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 28,
    maxWidth: 280,
  },
  receiptBox: {
    width: "100%",
  },
  reviewErrorBox: {
    gap: 12,
  },
  scanner: {
    alignItems: "center",
    backgroundColor: colors.backgroundDeep,
    flex: 1,
    gap: 18,
    justifyContent: "center",
    padding: spacing.screen,
  },
  scannerActions: {
    bottom: 24,
    flexDirection: "row",
    gap: 12,
    position: "absolute",
  },
  scannerBrand: {
    color: colors.textOnPrimary,
    fontSize: 22,
    fontWeight: "900",
    position: "absolute",
    top: 64,
  },
  scannerInstruction: {
    color: colors.textOnPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    marginBottom: 14,
    maxWidth: 300,
    textAlign: "center",
  },
  scanFrame: {
    alignItems: "center",
    height: 288,
    justifyContent: "center",
    width: 288,
  },
  scanLine: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 4,
    opacity: 0.9,
    width: 224,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 2,
  },
  searchPlaceholder: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  stepButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  stepLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 12,
  },
  stepperUnit: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    flex: 1,
    gap: 8,
    padding: 16,
  },
  stepValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
  },
  summaryBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 14,
  },
  summaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  topUpButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  topUpButtonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: "900",
  },
  transactionFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  transactionDetailBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  unreadCard: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceBlue,
  },
  unreadDot: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  waitingBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  manualCodeBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    maxWidth: 320,
    padding: 14,
    width: "100%",
  },
  manualCodeText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  manualCodeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
