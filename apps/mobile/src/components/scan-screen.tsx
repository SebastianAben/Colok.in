import type { BarcodeScanningResult } from "expo-camera";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/auth-context";
import { ApiClientError, confirmTopUpRequest, validateQrRequest } from "../lib/api";
import { colors, radii, spacing } from "../theme/colors";
import { PrimaryButton, SecondaryButton } from "./milestone-ui";

const showDeveloperTools = __DEV__;

function parseTopUpPayload(payload: string) {
  try {
    const url = new URL(payload);
    const topUpId = url.pathname.replace(/^\//, "");
    const token = url.searchParams.get("token");

    if (url.protocol !== "colokin:" || url.hostname !== "topup" || !topUpId || !token) {
      return null;
    }

    return { topUpId };
  } catch {
    return null;
  }
}

function messageFrom(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Unable to process this QR. Please try again.";
}

export function QrScanScreen() {
  const params = useLocalSearchParams<{ lockerId?: string }>();
  const { accessToken, refreshMe, withAuthenticatedRequest } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [developerToolsVisible, setDeveloperToolsVisible] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [manualPayload, setManualPayload] = useState("");
  const [processing, setProcessing] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [scanPaused, setScanPaused] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const handlingPayloadRef = useRef(false);
  const navigationInFlightRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanLineAnimation = useRef<ReturnType<typeof Animated.loop> | null>(null);
  const scanLineProgress = useRef(new Animated.Value(0)).current;

  const placeholderPayload = useMemo(() => {
    return params.lockerId
      ? `colokin://locker/${params.lockerId}`
      : "colokin://locker/lck_labtek_v_itb?compartment=cmp_labtek_v_001";
  }, [params.lockerId]);

  useEffect(() => {
    if (!permission) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const stopScanLineAnimation = useCallback(() => {
    scanLineAnimation.current?.stop();
    scanLineAnimation.current = null;
  }, []);

  const startScanLineAnimation = useCallback(() => {
    stopScanLineAnimation();
    scanLineProgress.setValue(0);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineProgress, {
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineProgress, {
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    scanLineAnimation.current = animation;
    animation.start();
  }, [scanLineProgress, stopScanLineAnimation]);

  useFocusEffect(
    useCallback(() => {
      handlingPayloadRef.current = false;
      navigationInFlightRef.current = false;
      setProcessing(false);
      setScannerActive(true);
      setScanPaused(false);

      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }

      startScanLineAnimation();

      return () => {
        setScannerActive(false);
        setScanPaused(true);
        stopScanLineAnimation();

        if (pauseTimerRef.current) {
          clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = null;
        }
      };
    }, [startScanLineAnimation, stopScanLineAnimation]),
  );

  useEffect(() => {
    if (processing || !scannerActive) {
      stopScanLineAnimation();
      return;
    }

    startScanLineAnimation();
  }, [processing, scannerActive, startScanLineAnimation, stopScanLineAnimation]);

  useEffect(() => {
    return () => {
      stopScanLineAnimation();

      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
      }
    };
  }, [stopScanLineAnimation]);

  const handlePayload = useCallback(
    async (payload: string) => {
      const trimmedPayload = payload.trim();

      if (
        !accessToken ||
        !trimmedPayload ||
        processing ||
        !scannerActive ||
        scanPaused ||
        handlingPayloadRef.current ||
        navigationInFlightRef.current
      ) {
        return;
      }

      handlingPayloadRef.current = true;
      setProcessing(true);
      setScannerActive(false);
      setScanPaused(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const topUpPayload = parseTopUpPayload(trimmedPayload);

        if (topUpPayload) {
          const response = await withAuthenticatedRequest((token) =>
            confirmTopUpRequest(token, topUpPayload.topUpId, {
              dummyQrPayload: trimmedPayload,
            }),
          );
          await refreshMe();
          navigationInFlightRef.current = true;
          router.replace({
            pathname: "/top-up",
            params: {
              scanAmount: String(response.amount),
              scanBalance: String(response.wallet.balance),
              scanStatus: "success",
              scanTransactionId: response.walletTransactionId,
            },
          });
          return;
        }

        const response = await withAuthenticatedRequest((token) =>
          validateQrRequest(token, {
            intent: "RENT",
            qrPayload: trimmedPayload,
          }),
        );

        navigationInFlightRef.current = true;
        router.push({
          pathname: "/rent/duration",
          params: {
            availableCableCount: String(response.locker.availableCableCount),
            compartmentId: response.compartment?.id ?? "",
            compartmentNumber: response.compartment?.number
              ? String(response.compartment.number)
              : "",
            lockerId: response.locker.id,
            lockerName: response.locker.name,
          },
        });
      } catch (scanError) {
        setError(messageFrom(scanError));
      } finally {
        setProcessing(false);
        handlingPayloadRef.current = false;

        if (pauseTimerRef.current) {
          clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = null;
        }

        if (navigationInFlightRef.current) {
          return;
        }

        pauseTimerRef.current = setTimeout(() => {
          setScannerActive(true);
          setScanPaused(false);
          pauseTimerRef.current = null;
        }, 1400);
      }
    },
    [accessToken, processing, refreshMe, scanPaused, scannerActive, withAuthenticatedRequest],
  );

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    void handlePayload(result.data);
  }

  const cameraGranted = permission?.granted ?? false;
  const permissionDenied = permission ? !permission.granted : false;
  const scanLineTranslateY = scanLineProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-108, 108],
  });

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        {cameraGranted && scannerActive ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            enableTorch={flashEnabled}
            onBarcodeScanned={
              processing || scanPaused || !scannerActive || navigationInFlightRef.current
                ? undefined
                : handleBarcodeScanned
            }
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.scrim} />

        <View style={styles.header}>
          <Text style={styles.brand}>Colok.in</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.instruction}>Scan the nearest Colok.in locker QR Code here!</Text>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
            {processing ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    transform: [{ translateY: scanLineTranslateY }],
                  },
                ]}
              />
            )}
          </View>

          {permissionDenied ? (
            <View style={styles.statusBox}>
              <Ionicons name="camera-outline" size={20} color={colors.warning} />
              <Text style={styles.statusText}>
                Camera permission is required for scanning. Enable camera access to continue.
              </Text>
              <SecondaryButton label="Allow Camera" onPress={() => void requestPermission()} />
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={20} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View style={styles.statusBox}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={styles.statusText}>{successMessage}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottomPanel}>
          <Pressable
            accessibilityRole="button"
            disabled={!cameraGranted}
            onPress={() => setFlashEnabled((current) => !current)}
            style={[styles.flashButton, !cameraGranted && styles.disabledControl]}
          >
            <Ionicons
              name={flashEnabled ? "flashlight" : "flashlight-outline"}
              size={22}
              color={cameraGranted ? colors.textOnPrimary : colors.textDisabled}
            />
            <Text style={[styles.flashLabel, !cameraGranted && styles.disabledText]}>
              Flashlight
            </Text>
          </Pressable>

          {showDeveloperTools ? (
            <SecondaryButton
              label={developerToolsVisible ? "Hide Developer Tools" : "Developer Tools"}
              onPress={() => setDeveloperToolsVisible((current) => !current)}
            />
          ) : null}

          {showDeveloperTools && developerToolsVisible ? (
            <View style={styles.manualBox}>
              <Text style={styles.manualTitle}>Developer QR Payload</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                onChangeText={setManualPayload}
                placeholder={placeholderPayload}
                placeholderTextColor={colors.textDisabled}
                style={styles.manualInput}
                value={manualPayload}
              />
              <PrimaryButton
                label={processing ? "Processing..." : "Submit Developer Payload"}
                onPress={() => void handlePayload(manualPayload || placeholderPayload)}
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bottomPanel: {
    bottom: 22,
    gap: 14,
    left: spacing.screen,
    position: "absolute",
    right: spacing.screen,
  },
  brand: {
    color: colors.textOnPrimary,
    fontSize: 22,
    fontWeight: "900",
  },
  centerContent: {
    alignItems: "center",
    flex: 1,
    gap: 18,
    justifyContent: "center",
    padding: spacing.screen,
  },
  close: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
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
  disabledControl: {
    opacity: 0.7,
  },
  disabledText: {
    color: colors.textDisabled,
  },
  errorBox: {
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderColor: colors.danger,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    maxWidth: 330,
    padding: 12,
  },
  errorText: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  flashButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  flashLabel: {
    color: colors.textOnPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: spacing.screen,
    position: "absolute",
    right: spacing.screen,
    top: 18,
    zIndex: 2,
  },
  instruction: {
    color: colors.textOnPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    maxWidth: 310,
    textAlign: "center",
  },
  keyboardView: {
    flex: 1,
  },
  manualBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  manualInput: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.text,
    fontSize: 13,
    minHeight: 72,
    padding: 12,
    textAlignVertical: "top",
  },
  manualTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  page: {
    backgroundColor: colors.primaryDark,
    flex: 1,
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
    position: "absolute",
    width: 224,
  },
  scrim: {
    backgroundColor: "rgba(4, 12, 24, 0.62)",
    ...StyleSheet.absoluteFillObject,
  },
  statusBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    maxWidth: 330,
    padding: 12,
  },
  statusText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
});
