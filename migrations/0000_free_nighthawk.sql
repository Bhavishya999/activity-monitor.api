CREATE TYPE "public"."github_account_type" AS ENUM('Organization', 'User', 'Bot', 'Mannequin');--> statement-breakpoint
CREATE TYPE "public"."commit_source" AS ENUM('import', 'webhook', 'reconcile');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."installation_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('EVENING', 'MORNING');--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('ADMIN', 'MANAGER', 'DEVELOPER');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('discovery', 'import', 'reconcile');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'partial', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processing', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"role" "role_name" DEFAULT 'DEVELOPER' NOT NULL,
	"employee_id" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" bigint,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"repository_id" bigint NOT NULL,
	"name" text NOT NULL,
	"head_sha" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"repository_id" bigint NOT NULL,
	"sha" text NOT NULL,
	"message" text NOT NULL,
	"author_account_id" bigint,
	"committer_account_id" bigint,
	"pusher_account_id" bigint,
	"author_name" text,
	"committer_name" text,
	"authored_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"pushed_at" timestamp with time zone,
	"html_url" text,
	"parent_count" integer DEFAULT 0 NOT NULL,
	"is_merge" boolean DEFAULT false NOT NULL,
	"additions" integer,
	"deletions" integer,
	"changed_files" integer,
	"source" "commit_source" NOT NULL,
	"sync_run_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commit_parent_count_ck" CHECK ("commit"."parent_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "commit_branch" (
	"commit_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	CONSTRAINT "commit_branch_commit_id_branch_id_pk" PRIMARY KEY("commit_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "daily_report" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" "report_kind" NOT NULL,
	"report_date" date NOT NULL,
	"timezone" text NOT NULL,
	"range_start" timestamp with time zone NOT NULL,
	"range_end" timestamp with time zone NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_account" (
	"id" bigint PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"html_url" text,
	"type" "github_account_type" DEFAULT 'User' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_developer_account" (
	"employee_id" bigint NOT NULL,
	"developer_account_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_developer_account_employee_id_developer_account_id_pk" PRIMARY KEY("employee_id","developer_account_id")
);
--> statement-breakpoint
CREATE TABLE "github_account" (
	"id" bigint PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"type" "github_account_type" NOT NULL,
	"avatar_url" text,
	"html_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installation" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"status" "installation_status" DEFAULT 'active' NOT NULL,
	"repository_selection" text,
	"permissions" jsonb,
	"events" jsonb,
	"last_synced_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_sheets_sync" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "report_execution" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repository" (
	"id" bigint PRIMARY KEY NOT NULL,
	"installation_id" bigint NOT NULL,
	"owner_id" bigint,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"default_branch" text,
	"html_url" text,
	"monitored" boolean DEFAULT true NOT NULL,
	"accessible" boolean DEFAULT true NOT NULL,
	"pushed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role" "role_name" NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permission_role_permission_key_pk" PRIMARY KEY("role","permission_key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"csrf_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_delivery" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_checkpoint" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sync_run_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"branch_name" text NOT NULL,
	"next_page" integer DEFAULT 1 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_error" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sync_run_id" bigint,
	"repository_id" bigint,
	"message" text NOT NULL,
	"http_status" integer,
	"retryable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository_id" bigint,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"since_date" timestamp with time zone,
	"commits_seen" integer DEFAULT 0 NOT NULL,
	"commits_inserted" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"rate_limit_remaining" integer,
	"rate_limit_reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"action" text,
	"installation_id" bigint,
	"payload" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit" ADD CONSTRAINT "commit_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit" ADD CONSTRAINT "commit_author_account_id_developer_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."developer_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit" ADD CONSTRAINT "commit_committer_account_id_developer_account_id_fk" FOREIGN KEY ("committer_account_id") REFERENCES "public"."developer_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit" ADD CONSTRAINT "commit_pusher_account_id_developer_account_id_fk" FOREIGN KEY ("pusher_account_id") REFERENCES "public"."developer_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_branch" ADD CONSTRAINT "commit_branch_commit_id_commit_id_fk" FOREIGN KEY ("commit_id") REFERENCES "public"."commit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_branch" ADD CONSTRAINT "commit_branch_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_developer_account" ADD CONSTRAINT "employee_developer_account_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_developer_account" ADD CONSTRAINT "employee_developer_account_developer_account_id_developer_account_id_fk" FOREIGN KEY ("developer_account_id") REFERENCES "public"."developer_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installation" ADD CONSTRAINT "github_installation_account_id_github_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."github_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_sheets_sync" ADD CONSTRAINT "google_sheets_sync_report_id_daily_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."daily_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_execution" ADD CONSTRAINT "report_execution_report_id_daily_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."daily_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository" ADD CONSTRAINT "repository_installation_id_github_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository" ADD CONSTRAINT "repository_owner_id_github_account_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."github_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_key_permission_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permission"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_delivery" ADD CONSTRAINT "slack_delivery_report_id_daily_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."daily_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_checkpoint" ADD CONSTRAINT "sync_checkpoint_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_checkpoint" ADD CONSTRAINT "sync_checkpoint_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_error" ADD CONSTRAINT "sync_error_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_installation_id_github_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_uq" ON "app_user" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_repo_name_uq" ON "branch" USING btree ("repository_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "commit_repo_sha_uq" ON "commit" USING btree ("repository_id","sha");--> statement-breakpoint
CREATE INDEX "commit_committed_at_idx" ON "commit" USING btree ("committed_at");--> statement-breakpoint
CREATE INDEX "commit_repo_committed_idx" ON "commit" USING btree ("repository_id","committed_at");--> statement-breakpoint
CREATE INDEX "commit_author_committed_idx" ON "commit" USING btree ("author_account_id","committed_at");--> statement-breakpoint
CREATE INDEX "commit_committer_idx" ON "commit" USING btree ("committer_account_id","committed_at");--> statement-breakpoint
CREATE INDEX "commit_branch_branch_idx" ON "commit_branch" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_report_kind_date_uq" ON "daily_report" USING btree ("kind","report_date");--> statement-breakpoint
CREATE INDEX "developer_login_idx" ON "developer_account" USING btree ("login");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_email_uq" ON "employee" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "eda_account_uq" ON "employee_developer_account" USING btree ("developer_account_id");--> statement-breakpoint
CREATE INDEX "github_account_login_idx" ON "github_account" USING btree ("login");--> statement-breakpoint
CREATE INDEX "installation_account_idx" ON "github_installation" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "installation_status_idx" ON "github_installation" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sheets_report_uq" ON "google_sheets_sync" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "repository_installation_idx" ON "repository" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "repository_full_name_idx" ON "repository" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_report_uq" ON "slack_delivery" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoint_run_repo_branch_uq" ON "sync_checkpoint" USING btree ("sync_run_id","repository_id","branch_name");--> statement-breakpoint
CREATE INDEX "sync_error_run_idx" ON "sync_error" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "sync_run_installation_idx" ON "sync_run" USING btree ("installation_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_run_status_idx" ON "sync_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_id_uq" ON "webhook_delivery" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_status_idx" ON "webhook_delivery" USING btree ("status","received_at");