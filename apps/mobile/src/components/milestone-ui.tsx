import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/auth-context";
import { colors, radii, spacing } from "../theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

type ButtonProps = {
  label: string;
  onPress?: () => void;
};

const tabItems: Array<{ label: string; href: Href; icon: IconName }> = [
  { label: "Home", href: "/", icon: "home-outline" },
  { label: "Transactions", href: "/transactions", icon: "receipt-outline" },
  { label: "Scan", href: "/scan", icon: "scan-outline" },
  { label: "Notifications", href: "/notifications", icon: "notifications-outline" },
  { label: "Settings", href: "/settings", icon: "settings-outline" },
];

export function ScreenShell({
  activeTab,
  children,
  title,
  subtitle,
}: {
  activeTab: string;
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.app} edges={["top"]}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: spacing.navHeight + insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {title ? (
          <View style={styles.screenHeading}>
            <Text style={styles.screenTitle}>{title}</Text>
            {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      <BottomNavBar activeTab={activeTab} />
    </SafeAreaView>
  );
}

export function AppHeader() {
  const { me } = useAuth();
  const initial = me?.name.charAt(0).toUpperCase() ?? "C";

  return (
    <View style={styles.header}>
      <View style={styles.headerIcon}>
        <Ionicons name="flash" size={18} color={colors.primary} />
      </View>
      <Text style={styles.brand}>Colok.in</Text>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
    </View>
  );
}

export function BottomNavBar({ activeTab }: { activeTab: string }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View style={[styles.navWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.nav}>
        {tabItems.map((item) => {
          const isActive = activeTab === item.label || pathname === item.href;
          const isScan = item.label === "Scan";

          return (
            <Pressable
              accessibilityRole="button"
              key={item.label}
              onPress={() => router.push(item.href)}
              style={[styles.navItem, isScan && styles.navItemScan]}
            >
              {isScan ? (
                <View style={styles.scanButton}>
                  <Ionicons name="scan" size={28} color={colors.surface} />
                </View>
              ) : (
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={isActive ? colors.accent : colors.textDisabled}
                />
              )}
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PrimaryButton({ label, onPress }: ButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress }: ButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function StatusBadge({
  label,
  tone = "success",
}: {
  label: string;
  tone?: "success" | "warning" | "primary";
}) {
  const color =
    tone === "warning" ? colors.warning : tone === "primary" ? colors.primary : colors.success;

  return (
    <View style={[styles.badge, { backgroundColor: `${color}18` }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function ModalScreen({
  children,
  primaryLabel,
  secondaryLabel = "Cancel",
  onPrimary,
}: {
  children: ReactNode;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
}) {
  return (
    <SafeAreaView style={styles.modalBackground}>
      <View style={styles.modalCard}>
        {children}
        <View style={styles.modalActions}>
          <SecondaryButton label={secondaryLabel} onPress={() => router.back()} />
          <PrimaryButton label={primaryLabel} onPress={onPrimary} />
        </View>
      </View>
    </SafeAreaView>
  );
}

export function SuccessScreen({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.successPage}>
      <View style={styles.successCard}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={34} color={colors.surface} />
        </View>
        <Text style={styles.successTitle}>{title}</Text>
        <Text style={styles.successBody}>{body}</Text>
        {children}
        <PrimaryButton label="Back to Home" onPress={() => router.replace("/")} />
      </View>
    </SafeAreaView>
  );
}

export function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBlock}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const baseShadow = {
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.08,
  shadowRadius: 20,
  elevation: 4,
};

export const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    gap: spacing.section,
    paddingHorizontal: spacing.screen,
    paddingTop: 12,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.backgroundDeep,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screen,
    paddingVertical: 12,
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  brand: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  screenHeading: {
    gap: 6,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  screenSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  navWrap: {
    backgroundColor: colors.backgroundDeep,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    height: spacing.navHeight,
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  navItem: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    justifyContent: "center",
  },
  navItemScan: {
    transform: [{ translateY: -22 }],
  },
  scanButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.background,
    borderRadius: radii.pill,
    borderWidth: 5,
    height: spacing.scanButton,
    justifyContent: "center",
    width: spacing.scanButton,
    ...baseShadow,
  },
  navLabel: {
    color: colors.textDisabled,
    fontSize: 10,
    fontWeight: "600",
  },
  navLabelActive: {
    color: colors.accent,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.button,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.button,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeDot: {
    borderRadius: radii.pill,
    height: 7,
    width: 7,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.card,
    ...baseShadow,
  },
  detailRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  modalBackground: {
    alignItems: "center",
    backgroundColor: "rgba(3, 16, 27, 0.86)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.screen,
  },
  modalCard: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 18,
    padding: spacing.card,
    width: "100%",
    ...baseShadow,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  successPage: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.screen,
  },
  successCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 16,
    padding: 24,
    width: "100%",
    ...baseShadow,
  },
  successIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  successTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  successBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  metricBlock: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    flex: 1,
    gap: 4,
    padding: 14,
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
});
