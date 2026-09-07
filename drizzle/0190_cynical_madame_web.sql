CREATE TABLE "festival_activity_coupon_book_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" integer,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_activity_coupon_book_configs_activity_id_unique" UNIQUE("activity_id")
);
--> statement-breakpoint
ALTER TABLE "festival_activity_coupon_book_configs" ADD CONSTRAINT "festival_activity_coupon_book_configs_activity_id_festival_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."festival_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_coupon_book_configs" ADD CONSTRAINT "festival_activity_coupon_book_configs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_coupon_book_configs" ADD CONSTRAINT "festival_activity_coupon_book_configs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;