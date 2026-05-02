import { router, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/colors";
import { useAuth } from "./auth-context";

const publicRoutes = new Set(["/login", "/register"]);

export function AuthGate({ children }: { children: ReactNode }) {
  const { accessToken, bootstrapping } = useAuth();
  const pathname = usePathname();
  const isPublicRoute = publicRoutes.has(pathname);

  useEffect(() => {
    if (bootstrapping) {
      return;
    }

    if (!accessToken && !isPublicRoute) {
      router.replace("/login");
      return;
    }

    if (accessToken && isPublicRoute) {
      router.replace("/home");
    }
  }, [accessToken, bootstrapping, isPublicRoute]);

  if (bootstrapping) {
    return (
      <View style={styles.loadingPage}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading Colok.in...</Text>
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  loadingPage: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.small,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
