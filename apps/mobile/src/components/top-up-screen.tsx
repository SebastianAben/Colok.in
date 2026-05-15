import type { ConfirmTopUpResponse, CreateTopUpResponse } from "@colokin/shared";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/auth-context";
import { ApiClientError, confirmTopUpRequest, createTopUpRequest } from "../lib/api";
import { colors, radii, spacing } from "../theme/colors";
import { Card, DetailRow, PrimaryButton, SecondaryButton } from "./milestone-ui";

const presetAmounts = [50000, 100000, 150000, 200000];

function formatRupiah(amount: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
}

function parseAmount(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function messageFrom(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Unable to process top up. Please try again.";
}

const showDeveloperTools = __DEV__;

export function TopUpScreen() {
  const params = useLocalSearchParams<{
    scanAmount?: string;
    scanBalance?: string;
    scanStatus?: string;
    scanTransactionId?: string;
  }>();
  const { accessToken, refreshMe, withAuthenticatedRequest } = useAuth();
  const [amountInput, setAmountInput] = useState("100000");
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdTopUp, setCreatedTopUp] = useState<CreateTopUpResponse | null>(null);
  const [developerPayloadVisible, setDeveloperPayloadVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ConfirmTopUpResponse | null>(null);

  const amount = useMemo(() => parseAmount(amountInput), [amountInput]);
  const amountIsValid = amount >= 10000 && amount <= 1000000 && Number.isInteger(amount);

  async function createTopUp() {
    if (!accessToken) {
      setError("Please log in again before topping up.");
      return;
    }

    if (!amountIsValid) {
      setError("Top up amount must be between Rp 10.000 and Rp 1.000.000.");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await withAuthenticatedRequest((token) =>
        createTopUpRequest(token, { amount }),
      );
      setCreatedTopUp(response);
      setDeveloperPayloadVisible(false);
    } catch (createError) {
      setError(messageFrom(createError));
    } finally {
      setCreating(false);
    }
  }

  async function confirmTopUp() {
    if (!accessToken || !createdTopUp) {
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      const response = await withAuthenticatedRequest((token) =>
        confirmTopUpRequest(token, createdTopUp.topUpId, {
          dummyQrPayload: createdTopUp.dummyQrPayload,
        }),
      );
      setSuccess(response);
      await refreshMe();
    } catch (confirmError) {
      if (
        confirmError instanceof ApiClientError &&
        confirmError.code === "TOPUP_ALREADY_CONFIRMED"
      ) {
        await refreshMe();
        setError("This top up has already been confirmed. Your wallet has been refreshed.");
      } else {
        setError(messageFrom(confirmError));
      }
    } finally {
      setConfirming(false);
    }
  }

  function resetFlow() {
    setCreatedTopUp(null);
    setError(null);
    setSuccess(null);
  }

  const scannedSuccess =
    params.scanStatus === "success" && params.scanAmount && params.scanBalance
      ? {
          amount: Number(params.scanAmount),
          wallet: { balance: Number(params.scanBalance) },
          walletTransactionId: params.scanTransactionId ?? "-",
        }
      : null;

  if (success || scannedSuccess) {
    const successAmount = success?.amount ?? scannedSuccess?.amount ?? 0;
    const walletBalance = success?.wallet.balance ?? scannedSuccess?.wallet.balance ?? 0;
    const walletTransactionId =
      success?.walletTransactionId ?? scannedSuccess?.walletTransactionId ?? "-";

    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={34} color={colors.textOnPrimary} />
          </View>
          <Text style={styles.successTitle}>Top Up Success</Text>
          <Text style={styles.successBody}>
            {formatRupiah(successAmount)} has been added to your Colok.in wallet.
          </Text>
          <Card style={styles.receiptCard}>
            <DetailRow label="Wallet Balance" value={formatRupiah(walletBalance)} />
            <DetailRow label="Status" value="SUCCESS" />
            <DetailRow label="Reference" value={walletTransactionId} />
          </Card>
          <PrimaryButton label="Back to Home" onPress={() => router.replace("/home")} />
          <SecondaryButton label="Top Up Again" onPress={resetFlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heading}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <View style={styles.headingText}>
              <Text style={styles.title}>Top Up</Text>
              <Text style={styles.subtitle}>Choose an amount and generate your payment QR.</Text>
            </View>
          </View>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Amount</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.currencyPrefix}>Rp</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) => {
                  setAmountInput(value.replace(/\D/g, ""));
                  setCreatedTopUp(null);
                  setSuccess(null);
                }}
                placeholder="100000"
                placeholderTextColor={colors.textDisabled}
                style={styles.amountInput}
                value={amountInput}
              />
            </View>
            <View style={styles.presetGrid}>
              {presetAmounts.map((preset) => {
                const selected = preset === amount;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={preset}
                    onPress={() => {
                      setAmountInput(String(preset));
                      setCreatedTopUp(null);
                      setSuccess(null);
                    }}
                    style={[styles.presetButton, selected && styles.presetButtonActive]}
                  >
                    <Text style={[styles.presetText, selected && styles.presetTextActive]}>
                      {formatRupiah(preset)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.helperText}>Allowed amount: Rp 10.000 - Rp 1.000.000.</Text>
            <Pressable
              accessibilityRole="button"
              disabled={creating}
              onPress={createTopUp}
              style={[styles.actionButton, creating && styles.disabledButton]}
            >
              {creating ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.actionButtonText}>Top Up</Text>
              )}
            </Pressable>
          </Card>

          {createdTopUp ? (
            <Card style={styles.qrCard}>
              <View style={styles.qrHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Payment QR</Text>
                  <Text style={styles.helperText}>
                    Expires at {formatTime(createdTopUp.expiresAt)}
                  </Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{createdTopUp.status}</Text>
                </View>
              </View>
              <View style={styles.qrBox}>
                <QRCode
                  backgroundColor={colors.text}
                  color={colors.background}
                  size={190}
                  value={createdTopUp.dummyQrPayload}
                />
              </View>
              {showDeveloperTools ? (
                <SecondaryButton
                  label={developerPayloadVisible ? "Hide Developer Payload" : "Developer Tools"}
                  onPress={() => setDeveloperPayloadVisible((current) => !current)}
                />
              ) : null}
              {showDeveloperTools && developerPayloadVisible ? (
                <View style={styles.payloadBox}>
                  <Text style={styles.payloadLabel}>Developer QR Payload</Text>
                  <Text selectable style={styles.payloadText}>
                    {createdTopUp.dummyQrPayload}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={confirming}
                onPress={confirmTopUp}
                style={[styles.actionButton, confirming && styles.disabledButton]}
              >
                {confirming ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.actionButtonText}>Confirm Payment</Text>
                )}
              </Pressable>
            </Card>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    gap: spacing.section,
    padding: spacing.screen,
    paddingBottom: 48,
  },
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  headingText: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  inputWrap: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "800",
  },
  amountInput: {
    color: colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    minHeight: 56,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  presetButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  presetText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  presetTextActive: {
    color: colors.accentText,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.button,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  actionButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.7,
  },
  qrCard: {
    gap: 16,
  },
  qrHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  statusPill: {
    backgroundColor: `${colors.warning}20`,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "900",
  },
  qrBox: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: radii.card,
    padding: 18,
  },
  payloadBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  payloadLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  payloadText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  successWrap: {
    flex: 1,
    gap: 18,
    justifyContent: "center",
    padding: spacing.screen,
  },
  successIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  successTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  successBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  receiptCard: {
    gap: 4,
  },
});
