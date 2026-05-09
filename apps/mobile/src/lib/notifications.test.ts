import assert from "node:assert/strict";
import test from "node:test";
import { notificationRouteFromData } from "./notification-routing";

test("routes related notification payloads to transactions", () => {
  assert.equal(
    notificationRouteFromData({
      notificationId: "ntf_001",
      relatedRentalId: "rent_001",
      routeHint: "transactions",
    }),
    "/transactions",
  );
  assert.equal(notificationRouteFromData({ relatedTransactionId: "wtx_001" }), "/transactions");
});

test("routes unrelated notification payloads to notifications", () => {
  assert.equal(notificationRouteFromData({ notificationId: "ntf_001" }), "/notifications");
  assert.equal(notificationRouteFromData(undefined), "/notifications");
});
