import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClientError } from "./api";
import { messageFromAuthError } from "./auth-errors";

test("messageFromAuthError maps register validation issues to field-specific messages", () => {
  const error = new ApiClientError(400, "VALIDATION_ERROR", "Request validation failed.", {
    issues: [
      { code: "too_small", path: ["password"], message: "Too small" },
      { code: "invalid_format", path: ["email"], message: "Invalid email" },
    ],
  });

  assert.equal(
    messageFromAuthError(error),
    "Password must be at least 6 characters.\nEnter a valid email address.",
  );
});

test("messageFromAuthError keeps specific backend validation messages", () => {
  const error = new ApiClientError(400, "VALIDATION_ERROR", "Email or phone is already registered.", {
    target: ["email"],
  });

  assert.equal(messageFromAuthError(error), "Email or phone is already registered.");
});

test("messageFromAuthError falls back for unmapped generic validation errors", () => {
  const error = new ApiClientError(400, "VALIDATION_ERROR", "Request validation failed.", {
    issues: [{ code: "invalid_type", path: ["unknown"], message: "Invalid" }],
  });

  assert.equal(messageFromAuthError(error), "Please check your registration details.");
});

test("messageFromAuthError converts network errors to the existing generic auth message", () => {
  assert.equal(
    messageFromAuthError(new Error("network down")),
    "Unable to connect to Colok.in. Please try again.",
  );
});
