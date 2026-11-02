CREATE TABLE "team" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"team_id" bigint NOT NULL,
	"developer_account_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_team_id_developer_account_id_pk" PRIMARY KEY("team_id","developer_account_id")
);
--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_developer_account_id_developer_account_id_fk" FOREIGN KEY ("developer_account_id") REFERENCES "public"."developer_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_slug_uq" ON "team" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "team_member_account_idx" ON "team_member" USING btree ("developer_account_id");