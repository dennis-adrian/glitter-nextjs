CREATE TABLE "festival_activity_waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"position" integer NOT NULL,
	"notified_at" timestamp,
	"expires_at" timestamp,
	"notified_for_detail_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_activity_waitlist_activity_id_user_id_unique" UNIQUE("activity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "waitlist_window_minutes" integer;--> statement-breakpoint
ALTER TABLE "festival_activity_waitlist" ADD CONSTRAINT "festival_activity_waitlist_activity_id_festival_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."festival_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_waitlist" ADD CONSTRAINT "festival_activity_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_waitlist" ADD CONSTRAINT "festival_activity_waitlist_notified_for_detail_id_festival_activity_details_id_fk" FOREIGN KEY ("notified_for_detail_id") REFERENCES "public"."festival_activity_details"("id") ON DELETE no action ON UPDATE no action;