export function notificationRouteFromData(data: unknown) {
  if (!data || typeof data !== "object") {
    return "/notifications" as const;
  }

  const payload = data as Record<string, unknown>;
  const hasRelatedRecord = Boolean(payload.relatedRentalId || payload.relatedTransactionId);

  if (payload.routeHint === "transactions" || hasRelatedRecord) {
    return "/transactions" as const;
  }

  return "/notifications" as const;
}
