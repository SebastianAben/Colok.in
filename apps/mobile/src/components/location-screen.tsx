import type { LockerListItem } from "@colokin/shared";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useAuth } from "../auth/auth-context";
import { ApiClientError, listLockersRequest } from "../lib/api";
import { colors, radii, spacing } from "../theme/colors";
import { Card, MetricBlock, PrimaryButton, ScreenShell, StatusBadge } from "./milestone-ui";

const defaultRadiusMeters = 3000;
const defaultRegion = {
  latitude: -6.890538487737392,
  latitudeDelta: 0.012,
  longitude: 107.6098075829657,
  longitudeDelta: 0.012,
};

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) {
    return "Distance unavailable";
  }

  if (distanceMeters < 1000) {
    return `${distanceMeters}m away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)}km away`;
}

function messageFrom(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Unable to load lockers. Please try again.";
}

function isDeveloperTestLocker(locker: LockerListItem) {
  return locker.id.startsWith("lck_qr_") || locker.name.startsWith("QR Locker ");
}

function firstVisibleLocker(lockers: LockerListItem[]) {
  return lockers.find((locker) => !isDeveloperTestLocker(locker)) ?? lockers[0] ?? null;
}

export function LocationSearchScreen() {
  const { accessToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockers, setLockers] = useState<LockerListItem[]>([]);
  const [locationDenied, setLocationDenied] = useState(false);
  const [selectedLockerId, setSelectedLockerId] = useState<string | null>(null);

  const visibleLockers = useMemo(() => {
    const productionLockers = lockers.filter((locker) => !isDeveloperTestLocker(locker));
    return productionLockers.length > 0 ? productionLockers : lockers;
  }, [lockers]);

  const selectedLocker = useMemo(() => {
    return (
      visibleLockers.find((locker) => locker.id === selectedLockerId) ?? visibleLockers[0] ?? null
    );
  }, [selectedLockerId, visibleLockers]);

  const region = useMemo(() => {
    if (!selectedLocker) {
      return defaultRegion;
    }

    return {
      latitude: selectedLocker.lat,
      latitudeDelta: 0.012,
      longitude: selectedLocker.lng,
      longitudeDelta: 0.012,
    };
  }, [selectedLocker]);

  const loadLockers = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      const permissionDenied = permission.status !== Location.PermissionStatus.GRANTED;
      setLocationDenied(permissionDenied);

      if (permissionDenied) {
        const fallbackLockers = await listLockersRequest(accessToken);
        setLockers(fallbackLockers);
        setSelectedLockerId(firstVisibleLocker(fallbackLockers)?.id ?? null);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nearbyLockers = await listLockersRequest(accessToken, {
        lat: currentLocation.coords.latitude,
        lng: currentLocation.coords.longitude,
        radiusMeters: defaultRadiusMeters,
      });

      setLockers(nearbyLockers);
      setSelectedLockerId(firstVisibleLocker(nearbyLockers)?.id ?? null);
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadLockers();
  }, [loadLockers]);

  return (
    <ScreenShell activeTab="Home">
      <View style={styles.mapPanel}>
        <MapView
          initialRegion={region}
          provider={undefined}
          region={region}
          style={styles.map}
          toolbarEnabled={false}
        >
          {visibleLockers.map((locker) => (
            <Marker
              coordinate={{ latitude: locker.lat, longitude: locker.lng }}
              key={locker.id}
              onPress={() => setSelectedLockerId(locker.id)}
              pinColor={locker.status === "ONLINE" ? colors.primary : colors.textMuted}
              title={locker.name}
            />
          ))}
        </MapView>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder}>Find nearby lockers...</Text>
        </View>
        {loading ? (
          <View style={styles.mapOverlay}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.overlayText}>Loading lockers...</Text>
          </View>
        ) : null}
      </View>

      {locationDenied ? (
        <Card style={styles.noticeCard}>
          <Ionicons name="location-outline" size={20} color={colors.warning} />
          <Text style={styles.noticeText}>
            Location permission is off. Showing known Colok.in lockers instead.
          </Text>
        </Card>
      ) : null}

      {error ? (
        <Card style={styles.noticeCard}>
          <Ionicons name="warning-outline" size={20} color={colors.danger} />
          <Text style={styles.noticeText}>{error}</Text>
          <PrimaryButton label="Retry" onPress={() => void loadLockers()} />
        </Card>
      ) : null}

      {!loading && !error && !selectedLocker ? (
        <Card style={styles.noticeCard}>
          <Ionicons name="archive-outline" size={20} color={colors.textMuted} />
          <Text style={styles.noticeText}>No lockers found near this area.</Text>
          <PrimaryButton label="Refresh" onPress={() => void loadLockers()} />
        </Card>
      ) : null}

      {selectedLocker ? (
        <Card>
          <View style={styles.sheetHeader}>
            <View style={styles.flexText}>
              <Text style={styles.cardTitle}>{selectedLocker.name}</Text>
              <Text style={styles.cardBody}>{formatDistance(selectedLocker.distanceMeters)}</Text>
              <Text style={styles.cardBody}>{selectedLocker.address}</Text>
            </View>
            <StatusBadge
              label={selectedLocker.status}
              tone={selectedLocker.status === "ONLINE" ? "success" : "warning"}
            />
          </View>
          <View style={styles.metricRow}>
            <MetricBlock
              label="Available cables"
              value={`${selectedLocker.availableCableCount} / ${selectedLocker.totalCompartments}`}
            />
            <MetricBlock label="Open" value={selectedLocker.operationalHours} />
          </View>
          <PrimaryButton
            label="Scan QR"
            onPress={() =>
              router.push({
                pathname: "/scan",
                params: { lockerId: selectedLocker.id },
              })
            }
          />
        </Card>
      ) : null}

      {visibleLockers.length > 1 ? (
        <View style={styles.lockerList}>
          {visibleLockers.map((locker) => (
            <Pressable
              accessibilityRole="button"
              key={locker.id}
              onPress={() => setSelectedLockerId(locker.id)}
              style={[
                styles.lockerRow,
                selectedLockerId === locker.id ? styles.lockerRowActive : null,
              ]}
            >
              <View style={styles.markerIcon}>
                <Ionicons name="flash" size={16} color={colors.textOnPrimary} />
              </View>
              <View style={styles.flexText}>
                <Text style={styles.rowTitle}>{locker.name}</Text>
                <Text style={styles.rowMeta}>
                  {formatDistance(locker.distanceMeters)} - {locker.availableCableCount} available
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
  flexText: {
    flex: 1,
    gap: 4,
  },
  lockerList: {
    gap: 10,
  },
  lockerRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  lockerRowActive: {
    borderColor: colors.primary,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(4, 12, 24, 0.72)",
    gap: 10,
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
  },
  mapPanel: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 410,
    overflow: "hidden",
  },
  markerIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  noticeCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  noticeText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  overlayText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  rowMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    left: spacing.screen,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "absolute",
    right: spacing.screen,
    top: 16,
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
});
