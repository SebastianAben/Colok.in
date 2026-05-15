import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClientError } from "./api";
import { runAuthenticatedRequest } from "./authenticated-request";

function unauthenticatedError() {
  return new ApiClientError(401, "UNAUTHENTICATED", "Invalid or expired access token.");
}

test("runAuthenticatedRequest uses the current access token without refreshing on success", async () => {
  const calls: string[] = [];

  const result = await runAuthenticatedRequest({
    accessToken: "access-current",
    clearSession: async () => {
      calls.push("clear");
    },
    refreshAccessToken: async () => {
      calls.push("refresh");
      return "access-next";
    },
    request: async (token) => {
      calls.push(`request:${token}`);
      return "ok";
    },
  });

  assert.equal(result, "ok");
  assert.deepEqual(calls, ["request:access-current"]);
});

test("runAuthenticatedRequest refreshes once and retries with the new access token after a 401", async () => {
  const calls: string[] = [];

  const result = await runAuthenticatedRequest({
    accessToken: "access-expired",
    clearSession: async () => {
      calls.push("clear");
    },
    refreshAccessToken: async () => {
      calls.push("refresh");
      return "access-fresh";
    },
    request: async (token) => {
      calls.push(`request:${token}`);
      if (token === "access-expired") {
        throw unauthenticatedError();
      }
      return "ok";
    },
  });

  assert.equal(result, "ok");
  assert.deepEqual(calls, ["request:access-expired", "refresh", "request:access-fresh"]);
});

test("runAuthenticatedRequest clears the session and throws a session-expired error when refresh fails", async () => {
  const calls: string[] = [];

  await assert.rejects(
    runAuthenticatedRequest({
      accessToken: "access-expired",
      clearSession: async () => {
        calls.push("clear");
      },
      refreshAccessToken: async () => {
        calls.push("refresh");
        throw unauthenticatedError();
      },
      request: async () => {
        calls.push("request");
        throw unauthenticatedError();
      },
    }),
    (error) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.code, "SESSION_EXPIRED");
      assert.equal(error.status, 401);
      return true;
    },
  );

  assert.deepEqual(calls, ["request", "refresh", "clear"]);
});

test("runAuthenticatedRequest retries only once after refreshing", async () => {
  const calls: string[] = [];

  await assert.rejects(
    runAuthenticatedRequest({
      accessToken: "access-expired",
      clearSession: async () => {
        calls.push("clear");
      },
      refreshAccessToken: async () => {
        calls.push("refresh");
        return "access-fresh";
      },
      request: async (token) => {
        calls.push(`request:${token}`);
        throw unauthenticatedError();
      },
    }),
    (error) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.code, "UNAUTHENTICATED");
      return true;
    },
  );

  assert.deepEqual(calls, ["request:access-expired", "refresh", "request:access-fresh"]);
});
