CREATE TYPE "public"."festival_reservation_feature_type" AS ENUM('full_table', 'late_partner', 'reservation_release');--> statement-breakpoint
CREATE TYPE "public"."reservation_feature_action_item_kind" AS ENUM('feature_access', 'shared_price_difference');--> statement-breakpoint
CREATE TYPE "public"."stand_group_type" AS ENUM('visual_group', 'full_table');--> statement-breakpoint
CREATE TABLE "festival_reservation_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"type" "festival_reservation_feature_type" NOT NULL,
	"category" "user_category",
	"enabled" boolean DEFAULT false NOT NULL,
	"credit_price" numeric(12, 2) NOT NULL,
	"deadline_override_at" timestamp,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_reservation_features_credit_price_nonnegative" CHECK ("festival_reservation_features"."credit_price" >= 0),
	CONSTRAINT "festival_reservation_features_category_by_type" CHECK (("festival_reservation_features"."type" = 'full_table' AND "festival_reservation_features"."category" IS NOT NULL
           AND "festival_reservation_features"."category" IN ('illustration', 'entrepreneurship'))
          OR ("festival_reservation_features"."type" <> 'full_table' AND "festival_reservation_features"."category" IS NULL)),
	CONSTRAINT "festival_reservation_features_deadline_by_type" CHECK ("festival_reservation_features"."deadline_override_at" IS NULL OR "festival_reservation_features"."type" = 'late_partner')
);
--> statement-breakpoint
CREATE TABLE "reservation_feature_action_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature_action_id" integer NOT NULL,
	"kind" "reservation_feature_action_item_kind" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description_snapshot" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_feature_action_items_amount_nonnegative" CHECK ("reservation_feature_action_items"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "reservation_feature_actions" ADD COLUMN "feature_config_id" integer;--> statement-breakpoint
ALTER TABLE "stand_groups" ADD COLUMN "type" "stand_group_type" DEFAULT 'visual_group' NOT NULL;--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "individual_price" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "shared_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "festival_reservation_features" ADD CONSTRAINT "festival_reservation_features_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_reservation_features" ADD CONSTRAINT "festival_reservation_features_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_feature_action_items" ADD CONSTRAINT "reservation_feature_action_items_feature_action_id_reservation_feature_actions_id_fk" FOREIGN KEY ("feature_action_id") REFERENCES "public"."reservation_feature_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "festival_reservation_features_scoped_unique" ON "festival_reservation_features" USING btree ("festival_id","type","category") WHERE "festival_reservation_features"."category" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "festival_reservation_features_festival_wide_unique" ON "festival_reservation_features" USING btree ("festival_id","type") WHERE "festival_reservation_features"."category" IS NULL;--> statement-breakpoint
CREATE INDEX "festival_reservation_features_festival_id_idx" ON "festival_reservation_features" USING btree ("festival_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_feature_action_items_action_kind_unique" ON "reservation_feature_action_items" USING btree ("feature_action_id","kind");--> statement-breakpoint
ALTER TABLE "reservation_feature_actions" ADD CONSTRAINT "reservation_feature_actions_feature_config_id_festival_reservation_features_id_fk" FOREIGN KEY ("feature_config_id") REFERENCES "public"."festival_reservation_features"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_feature_actions_feature_config_id_idx" ON "reservation_feature_actions" USING btree ("feature_config_id");--> statement-breakpoint
CREATE INDEX "stand_groups_type_idx" ON "stand_groups" USING btree ("type");--> statement-breakpoint
ALTER TABLE "stands" ADD CONSTRAINT "stands_individual_price_nonnegative" CHECK ("stands"."individual_price" >= 0);--> statement-breakpoint
ALTER TABLE "stands" ADD CONSTRAINT "stands_shared_price_not_below_individual" CHECK ("stands"."shared_price" IS NULL OR "stands"."shared_price" >= "stands"."individual_price");