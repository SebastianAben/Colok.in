import assert from "node:assert/strict";
import test from "node:test";
import { calculateServerTimeOffsetMs, formatCurrencyIdr, formatDurationMinutes } from "./display";

test("formats IDR currency with Indonesian thousands separators", () => {
  assert.equal(formatCurrencyIdr(100000), "Rp 100.000");
  assert.equal(formatCurrencyIdr(0), "Rp 0");
});

test("formats rental duration in hours and minutes", () => {
  assert.equal(formatDurationMinutes(120), "2 hour(s) 0 minute(s)");
  assert.equal(formatDurationMinutes(75), "1 hour(s) 15 minute(s)");
  assert.equal(formatDurationMinutes(0), "0 hour(s) 0 minute(s)");
});

test("calculates server-time offset from server and local timestamps", () => {
  assert.equal(
    calculateServerTimeOffsetMs("2026-05-01T01:00:30.000Z", Date.parse("2026-05-01T01:00:00.000Z")),
    30_000,
  );
});
