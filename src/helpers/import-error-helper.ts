import { GitHubHttpError, RateLimitError } from "../services/github/index.js";

export type ImportErrorKind =
  | { kind: "rate-limit"; resetAt: Date }
  | { kind: "permanent"; reason: string }
  | { kind: "transient" };

/** Statuses where retrying cannot help: repo gone/renamed (404), empty repo (409), bad ref (422), legal block (451). */
const PERMANENT_STATUSES: ReadonlySet<number> = new Set([404, 409, 410, 422, 451]);

const PERMANENT_REASONS: Readonly<Record<number, string>> = {
  404: "Repository or branch no longer exists or access was revoked",
  409: "Repository is empty",
  410: "Repository was removed",
  422: "GitHub rejected the request for this ref",
  451: "Repository is unavailable for legal reasons",
};

export function classifyImportError(err: unknown): ImportErrorKind {
  if (err instanceof RateLimitError) return { kind: "rate-limit", resetAt: err.resetAt };
  if (err instanceof GitHubHttpError && PERMANENT_STATUSES.has(err.status)) {
    return { kind: "permanent", reason: PERMANENT_REASONS[err.status] ?? `GitHub returned ${err.status}` };
  }
  return { kind: "transient" };
}
