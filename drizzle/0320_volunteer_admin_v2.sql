CREATE TABLE "volunteer_application_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"author_user_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volunteer_application_notes_body_length" CHECK (char_length("volunteer_application_notes"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "volunteer_availability_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"changed_by_user_id" integer,
	"added_shift_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"removed_shift_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"unassigned_shift_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volunteer_availability_changes_reason_length" CHECK (char_length("volunteer_availability_changes"."reason") <= 300)
);
--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" ADD COLUMN "added_by_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteer_application_notes" ADD CONSTRAINT "volunteer_application_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application_notes" ADD CONSTRAINT "volunteer_application_notes_application_fk" FOREIGN KEY ("application_id","festival_id") REFERENCES "public"."volunteer_applications"("id","festival_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_availability_changes" ADD CONSTRAINT "volunteer_availability_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_availability_changes" ADD CONSTRAINT "volunteer_availability_changes_application_fk" FOREIGN KEY ("application_id","festival_id") REFERENCES "public"."volunteer_applications"("id","festival_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "volunteer_application_notes_application_idx" ON "volunteer_application_notes" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "volunteer_availability_changes_application_idx" ON "volunteer_availability_changes" USING btree ("application_id","created_at");