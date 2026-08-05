CREATE TYPE "public"."program_promo_code_event_type" AS ENUM('created', 'updated', 'activated', 'deactivated');--> statement-breakpoint
CREATE TABLE "action_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp NOT NULL,
	"request_count" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "action_rate_limits_count_positive" CHECK ("action_rate_limits"."request_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "program_promo_code_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_code_id" integer NOT NULL,
	"actor_user_id" integer,
	"event_type" "program_promo_code_event_type" NOT NULL,
	"changes" jsonb,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_promo_code_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_code_id" integer NOT NULL,
	"purchase_id" integer NOT NULL,
	"code_snapshot" text NOT NULL,
	"partner_name_snapshot" text NOT NULL,
	"discount_percent_snapshot" integer NOT NULL,
	"base_amount_snapshot" numeric(10, 2) NOT NULL,
	"existing_price_amount_snapshot" numeric(10, 2) NOT NULL,
	"discount_amount_snapshot" numeric(10, 2) NOT NULL,
	"total_amount_snapshot" numeric(10, 2) NOT NULL,
	"higher_price_accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "program_promo_code_redemptions_purchase_id_unique" UNIQUE("purchase_id"),
	CONSTRAINT "program_promo_code_redemptions_amounts_valid" CHECK ("program_promo_code_redemptions"."base_amount_snapshot" >= 0
        AND "program_promo_code_redemptions"."existing_price_amount_snapshot" >= 0
        AND "program_promo_code_redemptions"."total_amount_snapshot" >= 0
        AND "program_promo_code_redemptions"."discount_amount_snapshot" >= 0
        AND "program_promo_code_redemptions"."total_amount_snapshot" <= "program_promo_code_redemptions"."base_amount_snapshot"
        AND "program_promo_code_redemptions"."discount_amount_snapshot" = "program_promo_code_redemptions"."base_amount_snapshot" - "program_promo_code_redemptions"."total_amount_snapshot"),
	CONSTRAINT "program_promo_code_redemptions_percent_range" CHECK ("program_promo_code_redemptions"."discount_percent_snapshot" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "program_promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"code" text NOT NULL,
	"partner_name" text NOT NULL,
	"discount_percent" integer NOT NULL,
	"starts_at" timestamp,
	"expires_at" timestamp,
	"max_uses" integer,
	"is_active" boolean DEFAULT false NOT NULL,
	"internal_notes" text,
	"created_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "program_promo_codes_nonblank" CHECK (length(trim("program_promo_codes"."code")) > 0 AND length(trim("program_promo_codes"."partner_name")) > 0),
	CONSTRAINT "program_promo_codes_percent_range" CHECK ("program_promo_codes"."discount_percent" BETWEEN 1 AND 100),
	CONSTRAINT "program_promo_codes_date_range" CHECK ("program_promo_codes"."expires_at" IS NULL OR "program_promo_codes"."starts_at" IS NULL OR "program_promo_codes"."expires_at" >= "program_promo_codes"."starts_at"),
	CONSTRAINT "program_promo_codes_max_uses_positive" CHECK ("program_promo_codes"."max_uses" IS NULL OR "program_promo_codes"."max_uses" > 0)
);
--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ADD COLUMN "base_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ADD COLUMN "existing_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ADD COLUMN "discount_amount" numeric(10, 2);--> statement-breakpoint
UPDATE "session_purchase_lines"
SET
	"base_price" = "unit_price",
	"existing_price" = "unit_price",
	"discount_amount" = 0;--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ALTER COLUMN "base_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ALTER COLUMN "existing_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ALTER COLUMN "discount_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "program_promo_code_events" ADD CONSTRAINT "program_promo_code_events_promo_code_id_program_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."program_promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_promo_code_events" ADD CONSTRAINT "program_promo_code_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_promo_code_redemptions" ADD CONSTRAINT "program_promo_code_redemptions_promo_code_id_program_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."program_promo_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_promo_code_redemptions" ADD CONSTRAINT "program_promo_code_redemptions_purchase_id_session_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."session_purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_promo_codes" ADD CONSTRAINT "program_promo_codes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_promo_codes" ADD CONSTRAINT "program_promo_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_rate_limits_updated_idx" ON "action_rate_limits" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "program_promo_code_events_code_created_idx" ON "program_promo_code_events" USING btree ("promo_code_id","created_at");--> statement-breakpoint
CREATE INDEX "program_promo_code_redemptions_code_created_idx" ON "program_promo_code_redemptions" USING btree ("promo_code_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "program_promo_codes_program_code_unique" ON "program_promo_codes" USING btree ("program_id",lower("code"));--> statement-breakpoint
CREATE INDEX "program_promo_codes_program_active_idx" ON "program_promo_codes" USING btree ("program_id","is_active");--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ADD CONSTRAINT "session_purchase_lines_price_breakdown_valid" CHECK ("session_purchase_lines"."base_price" >= 0
        AND "session_purchase_lines"."existing_price" >= 0
        AND "session_purchase_lines"."existing_price" <= "session_purchase_lines"."base_price"
        AND "session_purchase_lines"."discount_amount" >= 0
        AND "session_purchase_lines"."discount_amount" <= "session_purchase_lines"."base_price"
        AND "session_purchase_lines"."unit_price" <= "session_purchase_lines"."base_price"
        AND "session_purchase_lines"."unit_price" = "session_purchase_lines"."base_price" - "session_purchase_lines"."discount_amount");
