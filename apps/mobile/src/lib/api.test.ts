import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { ApiClientError, apiRequest } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("apiRequest converts network failures into ApiClientError", async () => {
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;

  await assert.rejects(apiRequest("/health"), (error) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.equal(error.status, 0);
    return true;
  });
});

test("apiRequest reports non-json server responses", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(new Response("<html>Bad Gateway</html>", { status: 502 }))) as typeof fetch;

  await assert.rejects(apiRequest("/health"), (error) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "INVALID_RESPONSE");
    assert.equal(error.status, 502);
    return true;
  });
});
