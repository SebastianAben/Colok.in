import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import {
  demoLocker,
  demoNotifications,
  demoRental,
  demoTransactions,
  demoUser,
  settingsItems,
} from "../data/demo";
import { colors, radii, spacing } from "../theme/colors";

export function HomeScreen() {
  return (
    <ScreenShell activeTab="Home">
      <View style={screenStyles.balanceCard}>
        <View style={screenStyles.balanceTop}>
          <View>
            <Text style={screenStyles.balanceLabel}>Your Balance:</Text>
            <Text style={screenStyles.balanceAmount}>{demoUser.balance}</Text>
          </View>
          <Ionicons name="eye-outline" size={22} color={colors.text} />
        </View>
        <Pressable style={screenStyles.topUpButton} onPress={() => router.push("/top-up")}>
          <Text style={screenStyles.topUpButtonText}>Top Up</Text>
        </Pressable>
      </View>

      <Card style={screenStyles.activeCard}>
        <View style={screenStyles.sheetHeader}>
          <Text style={screenStyles.cardTitle}>Rent Status</Text>
          <StatusBadge label={demoRental.label} />
        </View>
        <Text style={screenStyles.cardBody}>{demoRental.title}</Text>
        <View style={screenStyles.metricRow}>
          <MetricBlock label="Time left" value={demoRental.timeLeft} />
          <MetricBlock label="Rate" value={demoRental.rate} />
        </View>
        <PrimaryButton label="Return" onPress={() => router.push("/return/review")} />
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
  return (
    <ScreenShell
      activeTab="Transactions"
      title="Transaction History"
      subtitle="Review your past rentals and charges."
    >
      {demoTransactions.map((transaction) => (
        <Card key={transaction.id}>
          <View style={screenStyles.sheetHeader}>
            <View style={screenStyles.flexText}>
              <Text style={screenStyles.cardTitle}>{transaction.location}</Text>
              <Text style={screenStyles.cardBody}>{transaction.range}</Text>
            </View>
            <StatusBadge
              label={transaction.status}
              tone={transaction.status === "Success" ? "primary" : "success"}
            />
          </View>
          <View style={screenStyles.transactionFooter}>
            <Text style={screenStyles.cardBody}>{transaction.duration}</Text>
            <Text style={screenStyles.amountText}>{transaction.amount}</Text>
          </View>
        </Card>
      ))}
    </ScreenShell>
  );
}

export function NotificationsScreen() {
  return (
    <ScreenShell activeTab="Notifications" title="Notifications">
      {demoNotifications.map((notification) => (
        <Card
          key={notification.id}
          style={notification.unread ? screenStyles.unreadCard : undefined}
        >
          <View style={screenStyles.notificationRow}>
            <View style={screenStyles.iconCircle}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </View>
            <View style={screenStyles.flexText}>
              <View style={screenStyles.notificationTitleRow}>
                <Text style={screenStyles.cardTitle}>{notification.title}</Text>
                {notification.unread ? <View style={screenStyles.unreadDot} /> : null}
              </View>
              <Text style={screenStyles.cardBody}>{notification.message}</Text>
              <Text style={screenStyles.metaText}>{notification.time}</Text>
            </View>
          </View>
        </Card>
      ))}
    </ScreenShell>
  );
}

export function SettingsScreen() {
  return (
    <ScreenShell activeTab="Settings" title="Settings">
      <Card>
        <View style={screenStyles.profileRow}>
          <View style={screenStyles.profileAvatar}>
            <Text style={screenStyles.profileAvatarText}>J</Text>
          </View>
          <View style={screenStyles.flexText}>
            <Text style={screenStyles.cardTitle}>{demoUser.name}</Text>
            <Text style={screenStyles.cardBody}>{demoUser.phone}</Text>
            <Text style={screenStyles.cardBody}>{demoUser.email}</Text>
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
      <SecondaryButton label="Log Out" />
    </ScreenShell>
  );
}

export function RentDurationScreen() {
  return (
    <ModalScreen primaryLabel="Confirm" onPrimary={() => router.push("/rent/review")}>
      <Text style={screenStyles.modalTitle}>There are 3 extension cable available!</Text>
      <Text style={screenStyles.cardBody}>Please set your rental duration</Text>
      <View style={screenStyles.stepperRow}>
        <StepperUnit label="Hours" value="2" />
        <StepperUnit label="Minutes" value="0" />
      </View>
      <View style={screenStyles.summaryBox}>
        <Text style={screenStyles.summaryText}>Duration: 2 hour(s) 0 minute(s)</Text>
      </View>
    </ModalScreen>
  );
}

export function RentReviewScreen() {
  return (
    <ModalScreen primaryLabel="Confirm" onPrimary={() => router.push("/rent/success")}>
      <Text style={screenStyles.modalTitle}>Ready to Rent?</Text>
      <Text style={screenStyles.cardBody}>Please review your rent detail:</Text>
      <View>
        <DetailRow label="Location" value={demoLocker.name} />
        <DetailRow label="Duration" value={demoRental.duration} />
        <DetailRow label="Estimated Fee" value={demoRental.estimatedFee} />
      </View>
    </ModalScreen>
  );
}

export function RentSuccessScreen() {
  return (
    <SuccessScreen
      title="Rent complete!"
      body="Please take your extension cable from the locker below."
    >
      <View style={screenStyles.lockerNumber}>
        <Text style={screenStyles.lockerLabel}>LOCKER</Text>
        <Text style={screenStyles.lockerValue}>{demoLocker.compartment}</Text>
      </View>
    </SuccessScreen>
  );
}

export function ReturnReviewScreen() {
  return (
    <ModalScreen primaryLabel="Confirm" onPrimary={() => router.push("/return/instruction")}>
      <Text style={screenStyles.modalTitle}>Are you ready to return this extension cable?</Text>
      <Text style={screenStyles.cardBody}>Please review your rent detail:</Text>
      <View>
        <DetailRow label="Location" value={demoLocker.name} />
        <DetailRow label="Time left" value="0h 0m" />
        <DetailRow label="Late By" value="0h 0m" />
        <DetailRow label="Fine" value="Rp 0" />
      </View>
    </ModalScreen>
  );
}

export function ReturnInstructionScreen() {
  return (
    <ScreenShell activeTab="Home" title="Return Cable">
      <Card>
        <View style={screenStyles.instructionIcon}>
          <Ionicons name="archive-outline" size={34} color={colors.primary} />
        </View>
        <Text style={screenStyles.instructionTitle}>
          Please place the extension cable in locker 3, then close the locker securely.
        </Text>
        <Text style={screenStyles.cardBody}>
          Ensure the cable is fully inside the locker before closing the door. The system will
          automatically detect the return.
        </Text>
        <View style={screenStyles.waitingBox}>
          <Ionicons name="radio-outline" size={20} color={colors.primary} />
          <Text style={screenStyles.summaryText}>Waiting for locker sensor...</Text>
        </View>
        <PrimaryButton label="Show Return Success" onPress={() => router.push("/return/success")} />
      </Card>
    </ScreenShell>
  );
}

export function ReturnSuccessScreen() {
  return (
    <SuccessScreen title="Return Complete" body="Your return has been completed successfully">
      <View style={screenStyles.receiptBox}>
        <DetailRow label="Station" value={demoLocker.name} />
        <DetailRow label="Time" value="Just now" />
      </View>
    </SuccessScreen>
  );
}

export function TopUpPlaceholderScreen() {
  return (
    <ScreenShell
      activeTab="Home"
      title="Top Up"
      subtitle="Dummy QR top up starts in Milestone 3. This placeholder keeps the design route ready."
    >
      <Card>
        <View style={screenStyles.instructionIcon}>
          <Ionicons name="wallet-outline" size={34} color={colors.accent} />
        </View>
        <Text style={screenStyles.instructionTitle}>Top up Colok.in credit</Text>
        <Text style={screenStyles.cardBody}>
          Entering an amount, generating a dummy QR, and confirming wallet balance will be wired in
          the next milestone.
        </Text>
        <PrimaryButton label="Back to Home" onPress={() => router.replace("/home")} />
      </Card>
    </ScreenShell>
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

function StepperUnit({ label, value }: { label: string; value: string }) {
  return (
    <View style={screenStyles.stepperUnit}>
      <Pressable style={screenStyles.stepButton}>
        <Ionicons name="remove" size={18} color={colors.primary} />
      </Pressable>
      <Text style={screenStyles.stepValue}>{value}</Text>
      <Text style={screenStyles.stepLabel}>{label}</Text>
      <Pressable style={screenStyles.stepButton}>
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
