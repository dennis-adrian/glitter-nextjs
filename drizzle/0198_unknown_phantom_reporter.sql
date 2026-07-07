ALTER TYPE "public"."user_status" ADD VALUE 'paused';--> statement-breakpoint
CREATE TABLE "user_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_status" "user_status" NOT NULL,
	"to_status" "user_status" NOT NULL,
	"reason" text,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_status_events" ADD CONSTRAINT "user_status_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_status_events" ADD CONSTRAINT "user_status_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;