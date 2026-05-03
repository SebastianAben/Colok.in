import { Ionicons } from "@expo/vector-icons";
import type {
  ActiveRentalResponse,
  ConfirmReturnResponse,
  NotificationListItem,
  ReturnDetailResponse,
  ReturnIntentResponse,
  TransactionListItem,
} from "@colokin/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
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
import { demoLocker, settingsItems } from "../data/demo";
import { useAuth } from "../auth/auth-context";
import {
  ApiClientError,
  confirmReturnRequest,
  createRentalQuoteRequest,
  createRentalRequest,
  createReturnIntentRequest,
  getActiveRentalRequest,
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
              color={colors.text}
            />
          </Pressable>
        </View>
        <View style={screenStyles.balanceActions}>
          <Pressable style={screenStyles.topUpButton} onPress={() => router.push("/top-up")}>
            <Text style={screenStyles.topUpButtonText}>Top Up</Text>
          </Pressable>
        </View>
      </View>

      <Card style={screenStyles.activeCard}>
        <View style={screenStyles.sheetHeader}>
          <Text style={screenStyles.cardTitle}>Rent Status</Text>
          <StatusBadge
            label={
              activeRental
                ? activeRentalIsLate
                  ? "LATE RENTAL"
                  : "ACTIVE RENTAL"
                : "NO ACTIVE RENTAL"
            }
            tone={activeRentalIsLate ? "success" : "primary"}
          />
        </View>
        {activeRentalLoading ? (
          <View style={screenStyles.inlineStatus}>
            <ActivityIndicator color={colors.accent} />
            <Text style={screenStyles.cardBody}>Loading rent status...</Text>
          </View>
        ) : activeRental ? (
          <>
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
          </>
        ) : (
          <>
            <Text style={screenStyles.cardBody}>
              {activeRentalError ?? "You do not have an active rental yet."}
            </Text>
            <PrimaryButton label="Rent Extension Cable" onPress={() => router.push("/locations")} />
          </>
        )}
      </Card>

      <View style={screenStyles.promo}>
        <View style={screenStyles.promoBadge}>
          <Text style={screenStyles.promoBadgeText}>PROMO</Text>
        </View>
        <Text style={screenStyles.promoTitle}>Stay powered up at your favorite campus spot.</Text>
      </View>

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
        <HelpCard icon="wallet-outline" title="How to Top Up Colok.in Credit" />
        <HelpCard icon="flash-outline" title="How to Rent Extension Cable" />
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
        <Ionicons name="flashlight-outline" size={24} color={colors.text} />
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
      <Card>
        {settingsItems.map((item) => (
          <Pressable key={item} style={screenStyles.menuItem}>
            <Text style={screenStyles.menuText}>{item}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>
      <SecondaryButton label="Log Out" onPress={() => void logout()} />
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

function HelpCard({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <Card style={screenStyles.helpCard}>
      <View style={screenStyles.iconCircle}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={screenStyles.helpTitle}>{title}</Text>
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
      <Ionicons name="flash" size={18} color={colors.text} />
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
    color: colors.accent,
  },
  activeCard: {
    borderLeftColor: colors.accent,
    borderLeftWidth: 5,
    gap: 16,
  },
  balanceAmount: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
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
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
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
    color: colors.accent,
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
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  flashLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  flexText: {
    flex: 1,
    gap: 4,
  },
  helpCard: {
    flex: 1,
    gap: 14,
    minHeight: 132,
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
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
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
    borderColor: colors.background,
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
    justifyContent: "space-between",
    paddingVertical: 16,
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
  modalTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
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
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  profileRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  promo: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 18,
    minHeight: 148,
    overflow: "hidden",
    padding: spacing.card,
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
    color: colors.text,
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
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    position: "absolute",
    top: 64,
  },
  scannerInstruction: {
    color: colors.text,
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
