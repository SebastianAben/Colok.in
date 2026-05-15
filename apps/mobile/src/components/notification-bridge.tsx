import type { NotificationListItem } from "@colokin/shared";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/auth-context";
import { listNotificationsRequest, markNotificationReadRequest } from "../lib/api";
import { notificationRouteFromData } from "../lib/notification-routing";
import { colors, radii, spacing } from "../theme/colors";

const pollIntervalMs = 45_000;

function routeForNotification(notification: NotificationListItem) {
  return notificationRouteFromData({
    relatedRentalId: notification.relatedRentalId,
    relatedTransactionId: notification.relatedTransactionId,
    routeHint:
      notification.relatedRentalId || notification.relatedTransactionId
        ? "transactions"
        : "notifications",
  });
}

export function NotificationBridge() {
  const { accessToken, withAuthenticatedRequest } = useAuth();
  const knownNotificationIds = useRef(new Set<string>());
  const bootstrapped = useRef(false);
  const [banner, setBanner] = useState<NotificationListItem | null>(null);

  const markRead = useCallback(
    async (notificationId: string | null) => {
      if (!accessToken || !notificationId) {
        return;
      }

      try {
        await withAuthenticatedRequest((token) =>
          markNotificationReadRequest(token, notificationId),
        );
      } catch {
        // Best effort only. The Notifications screen will refresh canonical read state.
      }
    },
    [accessToken, withAuthenticatedRequest],
  );

  const loadNewNotifications = useCallback(async () => {
    if (!accessToken || AppState.currentState !== "active") {
      return;
    }

    try {
      const notifications = await withAuthenticatedRequest((token) =>
        listNotificationsRequest(token),
      );
      const currentIds = new Set(notifications.map((notification) => notification.id));

      if (!bootstrapped.current) {
        knownNotificationIds.current = currentIds;
        bootstrapped.current = true;
        return;
      }

      const newestUnread = notifications.find(
        (notification) =>
          !notification.readAt && !knownNotificationIds.current.has(notification.id),
      );

      knownNotificationIds.current = currentIds;

      if (newestUnread) {
        setBanner(newestUnread);
      }
    } catch {
      // In-app banners are additive; API errors should not block the active screen.
    }
  }, [accessToken, withAuthenticatedRequest]);

  useEffect(() => {
    if (!accessToken) {
      bootstrapped.current = false;
      knownNotificationIds.current = new Set();
      setBanner(null);
      return undefined;
    }

    void loadNewNotifications();

    const interval = setInterval(() => {
      void loadNewNotifications();
    }, pollIntervalMs);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void loadNewNotifications();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [accessToken, loadNewNotifications]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const notificationId = typeof data.notificationId === "string" ? data.notificationId : null;
      void markRead(notificationId);
      router.push(notificationRouteFromData(data));
    });

    return () => subscription.remove();
  }, [markRead]);

  useEffect(() => {
    if (!banner) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setBanner(null);
    }, 6000);

    return () => clearTimeout(timer);
  }, [banner]);

  if (!banner) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setBanner(null);
        void markRead(banner.id);
        router.push(routeForNotification(banner));
      }}
      style={styles.banner}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="notifications-outline" color={colors.primary} size={18} />
      </View>
      <View style={styles.flexText}>
        <Text numberOfLines={1} style={styles.title}>
          {banner.title}
        </Text>
        <Text numberOfLines={2} style={styles.body}>
          {banner.message}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.card,
    borderWidth: 1,
    elevation: 8,
    flexDirection: "row",
    gap: 12,
    left: spacing.screen,
    padding: 14,
    position: "absolute",
    right: spacing.screen,
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    top: 54,
    zIndex: 1000,
  },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  flexText: {
    flex: 1,
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
