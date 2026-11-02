export const APP_MESSAGES = {
  INVALID_SIGNATURE: "Webhook signature is invalid",
  PAYLOAD_TOO_LARGE: "Webhook payload exceeds the size limit",
  MISSING_WEBHOOK_HEADERS: "Missing X-GitHub-Event or X-GitHub-Delivery header",
  INVALID_JSON: "Request body is not valid JSON",
  INVALID_PAYLOAD: "Webhook payload is missing required fields",
  RATE_LIMITED: "Too many requests, retry later",
  INTERNAL: "Unexpected server error",
} as const;

export const RATE_LIMITS = { WEBHOOK_PER_MINUTE: 600, API_PER_MINUTE: 300 } as const;
