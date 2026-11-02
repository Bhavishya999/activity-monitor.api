/** Queue names shared by the API (enqueue) and the worker (consume). */
export const JOBS = {
  WEBHOOK: "webhook.process",
  DISCOVER: "installation.discover",
  IMPORT: "repository.import",
  RECONCILE: "installation.reconcile",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
