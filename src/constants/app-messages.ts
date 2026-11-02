export const APP_MESSAGES = {
  INVALID_SIGNATURE: "Webhook signature is invalid",
  PAYLOAD_TOO_LARGE: "Webhook payload exceeds the size limit",
  MISSING_WEBHOOK_HEADERS: "Missing X-GitHub-Event or X-GitHub-Delivery header",
  INVALID_JSON: "Request body is not valid JSON",
  INVALID_PAYLOAD: "Webhook payload is missing required fields",
  RATE_LIMITED: "Too many requests, retry later",
  INTERNAL: "Unexpected server error",
  NOT_AUTHENTICATED: "Sign in to continue",
  SESSION_EXPIRED: "Your session has expired, sign in again",
  FORBIDDEN_ROLE: "Your role does not have access to this resource",
  CSRF_INVALID: "Missing or invalid CSRF token",
  DEV_AUTH_DISABLED: "Development login is not enabled",
  INVALID_DATE_RANGE: "Date range is invalid",
  RANGE_TOO_LARGE: "Date range cannot exceed 366 days",
  INVALID_TIMEZONE: "Unknown time zone",
  DEVELOPER_NOT_FOUND: "Developer not found",
  REPOSITORY_NOT_FOUND: "Repository not found",
} as const;

export const RATE_LIMITS = { WEBHOOK_PER_MINUTE: 600, API_PER_MINUTE: 300 } as const;
