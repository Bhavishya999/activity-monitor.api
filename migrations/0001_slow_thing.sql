ALTER TABLE "branch" ADD COLUMN "last_imported_sha" text;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "last_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "imported_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "imported_full" boolean DEFAULT false NOT NULL;