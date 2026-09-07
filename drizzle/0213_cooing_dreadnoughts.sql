CREATE TYPE "public"."feature_flag_visibility" AS ENUM('hidden', 'admin_only', 'public');--> statement-breakpoint
CREATE TABLE "feature_flag_user_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"flag_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"note" text,
	"created_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flag_user_targets_flag_id_user_id_unique" UNIQUE("flag_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"visibility" "feature_flag_visibility" DEFAULT 'hidden' NOT NULL,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "feature_flag_user_targets" ADD CONSTRAINT "feature_flag_user_targets_flag_id_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_user_targets" ADD CONSTRAINT "feature_flag_user_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_user_targets" ADD CONSTRAINT "feature_flag_user_targets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_flag_user_targets_user_id_idx" ON "feature_flag_user_targets" USING btree ("user_id");