ALTER TABLE "app_user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DEFAULT 'DEVELOPER'::text;--> statement-breakpoint
ALTER TABLE "role_permission" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."role_name";--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('DEVELOPER', 'ADMIN', 'SUPER_ADMIN');--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DEFAULT 'DEVELOPER'::"public"."role_name";--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DATA TYPE "public"."role_name" USING "role"::"public"."role_name";--> statement-breakpoint
ALTER TABLE "role_permission" ALTER COLUMN "role" SET DATA TYPE "public"."role_name" USING "role"::"public"."role_name";