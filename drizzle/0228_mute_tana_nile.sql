CREATE TABLE "festival_admin_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_admin_assignments_user_festival_unique" UNIQUE("user_id","festival_id")
);
--> statement-breakpoint
ALTER TABLE "festival_admin_assignments" ADD CONSTRAINT "festival_admin_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_admin_assignments" ADD CONSTRAINT "festival_admin_assignments_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "festival_admin_assignments_festival_id_idx" ON "festival_admin_assignments" USING btree ("festival_id");