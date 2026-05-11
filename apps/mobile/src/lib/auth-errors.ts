import { ApiClientError } from "./api";

const registerValidationMessages: Record<string, string> = {
  email: "Enter a valid email address.",
  name: "Name must be at least 2 characters.",
  password: "Password must be at least 6 characters.",
  phone: "Phone number must be at least 8 characters.",
};

type ValidationIssue = {
  path?: unknown;
};

function issueField(issue: ValidationIssue): string | null {
  if (!Array.isArray(issue.path)) {
    return null;
  }

  const [field] = issue.path;
  return typeof field === "string" ? field : null;
}

function validationIssuesFrom(details: Record<string, unknown> | undefined): ValidationIssue[] {
  const issues = details?.issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues.filter((issue): issue is ValidationIssue => {
    return typeof issue === "object" && issue !== null;
  });
}

export function messageFromAuthError(error: unknown) {
  if (!(error instanceof ApiClientError)) {
    return "Unable to connect to Colok.in. Please try again.";
  }

  if (error.code !== "VALIDATION_ERROR") {
    return error.message;
  }

  const messages = validationIssuesFrom(error.details)
    .map(issueField)
    .filter((field): field is string => field !== null)
    .map((field) => registerValidationMessages[field])
    .filter((message): message is string => Boolean(message));

  const uniqueMessages = Array.from(new Set(messages));
  if (uniqueMessages.length > 0) {
    return uniqueMessages.join("\n");
  }

  return error.message === "Request validation failed."
    ? "Please check your registration details."
    : error.message;
}
