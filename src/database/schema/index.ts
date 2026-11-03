import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, bigint, bigserial, integer, text, boolean, timestamp, jsonb, date,
  uniqueIndex, index, primaryKey, check,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

// ---------- enums ----------
export const installationStatus = pgEnum("installation_status", ["active", "suspended", "deleted"]);
export const accountType = pgEnum("github_account_type", ["Organization", "User", "Bot", "Mannequin"]);
export const syncKind = pgEnum("sync_kind", ["discovery", "import", "reconcile"]);
export const syncStatus = pgEnum("sync_status", ["pending", "running", "succeeded", "failed", "partial", "cancelled"]);
export const webhookStatus = pgEnum("webhook_status", ["received", "processing", "processed", "failed", "ignored"]);
export const commitSource = pgEnum("commit_source", ["import", "webhook", "reconcile"]);
export const roleName = pgEnum("role_name", ["ADMIN", "MANAGER", "DEVELOPER", "SUPER_ADMIN"]);
export const reportKind = pgEnum("report_kind", ["EVENING", "MORNING"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "sent", "failed", "skipped"]);

// ---------- GitHub installations / accounts / repos ----------
export const githubAccount = pgTable("github_account", {
  id: bigint("id", { mode: "number" }).primaryKey(), // GitHub numeric id
  login: text("login").notNull(),
  type: accountType("type").notNull(),
  avatarUrl: text("avatar_url"),
  htmlUrl: text("html_url"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("github_account_login_idx").on(t.login)]);

export const githubInstallation = pgTable("github_installation", {
  id: bigint("id", { mode: "number" }).primaryKey(), // GitHub installation id
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => githubAccount.id, { onDelete: "restrict" }),
  status: installationStatus("status").notNull().default("active"),
  repositorySelection: text("repository_selection"), // all | selected
  permissions: jsonb("permissions").$type<Record<string, string>>(),
  events: jsonb("events").$type<string[]>(),
  lastSyncedAt: ts("last_synced_at"),
  suspendedAt: ts("suspended_at"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("installation_account_idx").on(t.accountId), index("installation_status_idx").on(t.status)]);

export const repository = pgTable("repository", {
  id: bigint("id", { mode: "number" }).primaryKey(), // GitHub repo id
  installationId: bigint("installation_id", { mode: "number" }).notNull().references(() => githubInstallation.id, { onDelete: "cascade" }),
  ownerId: bigint("owner_id", { mode: "number" }).references(() => githubAccount.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  private: boolean("private").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  defaultBranch: text("default_branch"),
  htmlUrl: text("html_url"),
  monitored: boolean("monitored").notNull().default(true), // repo-level monitoring config
  accessible: boolean("accessible").notNull().default(true), // false when removed from installation
  pushedAt: ts("pushed_at"),
  lastSyncedAt: ts("last_synced_at"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index("repository_installation_idx").on(t.installationId),
  index("repository_full_name_idx").on(t.fullName),
]);

export const branch = pgTable("branch", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  repositoryId: bigint("repository_id", { mode: "number" }).notNull().references(() => repository.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  headSha: text("head_sha"),
  isDefault: boolean("is_default").notNull().default(false),
  deleted: boolean("deleted").notNull().default(false),
  // Import bookkeeping so unchanged branches are never re-fetched.
  lastImportedSha: text("last_imported_sha"),
  lastImportedAt: ts("last_imported_at"),
  importedSince: ts("imported_since"), // lower bound of imported window; null with importedFull = whole history
  importedFull: boolean("imported_full").notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("branch_repo_name_uq").on(t.repositoryId, t.name)]);

// ---------- identities ----------
export const developerAccount = pgTable("developer_account", {
  id: bigint("id", { mode: "number" }).primaryKey(), // GitHub numeric user id
  login: text("login").notNull(),
  avatarUrl: text("avatar_url"),
  htmlUrl: text("html_url"),
  type: accountType("type").notNull().default("User"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("developer_login_idx").on(t.login)]);

export const employee = pgTable("employee", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("employee_email_uq").on(t.email)]);

export const employeeDeveloperAccount = pgTable("employee_developer_account", {
  employeeId: bigint("employee_id", { mode: "number" }).notNull().references(() => employee.id, { onDelete: "cascade" }),
  developerAccountId: bigint("developer_account_id", { mode: "number" }).notNull().references(() => developerAccount.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.employeeId, t.developerAccountId] }),
  uniqueIndex("eda_account_uq").on(t.developerAccountId), // an account maps to at most one employee
]);

// ---------- commits ----------
export const commit = pgTable("commit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  repositoryId: bigint("repository_id", { mode: "number" }).notNull().references(() => repository.id, { onDelete: "cascade" }),
  sha: text("sha").notNull(),
  message: text("message").notNull(),
  authorAccountId: bigint("author_account_id", { mode: "number" }).references(() => developerAccount.id, { onDelete: "set null" }),
  committerAccountId: bigint("committer_account_id", { mode: "number" }).references(() => developerAccount.id, { onDelete: "set null" }),
  pusherAccountId: bigint("pusher_account_id", { mode: "number" }).references(() => developerAccount.id, { onDelete: "set null" }),
  authorName: text("author_name"),
  committerName: text("committer_name"),
  authoredAt: ts("authored_at").notNull(),
  committedAt: ts("committed_at").notNull(),
  pushedAt: ts("pushed_at"),
  htmlUrl: text("html_url"),
  parentCount: integer("parent_count").notNull().default(0),
  isMerge: boolean("is_merge").notNull().default(false),
  additions: integer("additions"), // null until enriched
  deletions: integer("deletions"),
  changedFiles: integer("changed_files"),
  source: commitSource("source").notNull(),
  syncRunId: bigint("sync_run_id", { mode: "number" }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("commit_repo_sha_uq").on(t.repositoryId, t.sha),
  index("commit_committed_at_idx").on(t.committedAt),
  index("commit_repo_committed_idx").on(t.repositoryId, t.committedAt),
  index("commit_author_committed_idx").on(t.authorAccountId, t.committedAt),
  index("commit_committer_idx").on(t.committerAccountId, t.committedAt),
  check("commit_parent_count_ck", sql`${t.parentCount} >= 0`),
]);

export const commitBranch = pgTable("commit_branch", {
  commitId: bigint("commit_id", { mode: "number" }).notNull().references(() => commit.id, { onDelete: "cascade" }),
  branchId: bigint("branch_id", { mode: "number" }).notNull().references(() => branch.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.commitId, t.branchId] }), index("commit_branch_branch_idx").on(t.branchId)]);

export const webhookDelivery = pgTable("webhook_delivery", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  deliveryId: text("delivery_id").notNull(), // X-GitHub-Delivery (GUID)
  event: text("event").notNull(),
  action: text("action"),
  installationId: bigint("installation_id", { mode: "number" }),
  payload: jsonb("payload").notNull(),
  status: webhookStatus("status").notNull().default("received"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
}, (t) => [uniqueIndex("webhook_delivery_id_uq").on(t.deliveryId), index("webhook_status_idx").on(t.status, t.receivedAt)]);

// ---------- sync ----------
export const syncRun = pgTable("sync_run", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: syncKind("kind").notNull(),
  installationId: bigint("installation_id", { mode: "number" }).notNull().references(() => githubInstallation.id, { onDelete: "cascade" }),
  repositoryId: bigint("repository_id", { mode: "number" }).references(() => repository.id, { onDelete: "cascade" }),
  status: syncStatus("status").notNull().default("pending"),
  sinceDate: ts("since_date"), // null = full history
  commitsSeen: integer("commits_seen").notNull().default(0),
  commitsInserted: integer("commits_inserted").notNull().default(0),
  startedAt: ts("started_at"), finishedAt: ts("finished_at"),
  rateLimitRemaining: integer("rate_limit_remaining"),
  rateLimitResetAt: ts("rate_limit_reset_at"),
  createdAt: createdAt(),
}, (t) => [index("sync_run_installation_idx").on(t.installationId, t.createdAt), index("sync_run_status_idx").on(t.status)]);

export const syncCheckpoint = pgTable("sync_checkpoint", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  syncRunId: bigint("sync_run_id", { mode: "number" }).notNull().references(() => syncRun.id, { onDelete: "cascade" }),
  repositoryId: bigint("repository_id", { mode: "number" }).notNull().references(() => repository.id, { onDelete: "cascade" }),
  branchName: text("branch_name").notNull(),
  nextPage: integer("next_page").notNull().default(1),
  completed: boolean("completed").notNull().default(false),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("checkpoint_run_repo_branch_uq").on(t.syncRunId, t.repositoryId, t.branchName)]);

export const syncError = pgTable("sync_error", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  syncRunId: bigint("sync_run_id", { mode: "number" }).references(() => syncRun.id, { onDelete: "cascade" }),
  repositoryId: bigint("repository_id", { mode: "number" }),
  message: text("message").notNull(),
  httpStatus: integer("http_status"),
  retryable: boolean("retryable").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("sync_error_run_idx").on(t.syncRunId)]);

// ---------- auth / RBAC ----------
export const appUser = pgTable("app_user", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  provider: text("provider").notNull().default("local"), // local | zoho (future)
  providerSubject: text("provider_subject"),
  passwordHash: text("password_hash"),
  role: roleName("role").notNull().default("DEVELOPER"),
  employeeId: bigint("employee_id", { mode: "number" }).references(() => employee.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("user_email_uq").on(t.email), uniqueIndex("user_provider_uq").on(t.provider, t.providerSubject)]);

export const session = pgTable("session", {
  id: text("id").primaryKey(), // hash of opaque token
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => appUser.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("session_user_idx").on(t.userId), index("session_expires_idx").on(t.expiresAt)]);

export const permission = pgTable("permission", {
  key: text("key").primaryKey(), // e.g. analytics:read:all
  description: text("description"),
});
export const rolePermission = pgTable("role_permission", {
  role: roleName("role").notNull(),
  permissionKey: text("permission_key").notNull().references(() => permission.key, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.role, t.permissionKey] })]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorUserId: bigint("actor_user_id", { mode: "number" }).references(() => appUser.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("audit_created_idx").on(t.createdAt), index("audit_actor_idx").on(t.actorUserId)]);

export const passwordResetOtp = pgTable("password_reset_otp", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => appUser.id, { onDelete: "cascade" }),
  otpHash: text("otp_hash").notNull(),
  resetTokenHash: text("reset_token_hash"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
}, (t) => [index("otp_user_expires_idx").on(t.userId, t.expiresAt)]);

// ---------- reporting ----------
export const dailyReport = pgTable("daily_report", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: reportKind("kind").notNull(),
  reportDate: date("report_date").notNull(), // local date in report timezone
  timezone: text("timezone").notNull(),
  rangeStart: ts("range_start").notNull(),
  rangeEnd: ts("range_end").notNull(),
  content: jsonb("content").notNull(), // canonical report object
  createdAt: createdAt(),
}, (t) => [uniqueIndex("daily_report_kind_date_uq").on(t.kind, t.reportDate)]);

export const reportExecution = pgTable("report_execution", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  reportId: bigint("report_id", { mode: "number" }).notNull().references(() => dailyReport.id, { onDelete: "cascade" }),
  status: syncStatus("status").notNull().default("pending"),
  error: text("error"),
  startedAt: ts("started_at").notNull().defaultNow(), finishedAt: ts("finished_at"),
});

export const slackDelivery = pgTable("slack_delivery", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  reportId: bigint("report_id", { mode: "number" }).notNull().references(() => dailyReport.id, { onDelete: "cascade" }),
  status: deliveryStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"), sentAt: ts("sent_at"),
}, (t) => [uniqueIndex("slack_report_uq").on(t.reportId)]);

export const googleSheetsSync = pgTable("google_sheets_sync", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  reportId: bigint("report_id", { mode: "number" }).notNull().references(() => dailyReport.id, { onDelete: "cascade" }),
  status: deliveryStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"), syncedAt: ts("synced_at"),
}, (t) => [uniqueIndex("sheets_report_uq").on(t.reportId)]);

export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});
