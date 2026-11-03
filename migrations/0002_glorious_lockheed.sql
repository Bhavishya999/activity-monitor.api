ALTER TYPE "public"."role_name" ADD VALUE 'SUPER_ADMIN';--> statement-breakpoint
CREATE TABLE "password_reset_otp" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"otp_hash" text NOT NULL,
	"reset_token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "provider" SET DEFAULT 'local';--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "provider_subject" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "password_reset_otp" ADD CONSTRAINT "password_reset_otp_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_user_expires_idx" ON "password_reset_otp" USING btree ("user_id","expires_at");