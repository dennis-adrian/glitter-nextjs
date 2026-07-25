ALTER TYPE "public"."sanction_event_type" ADD VALUE 'activated' BEFORE 'edited';--> statement-breakpoint
ALTER TYPE "public"."sanction_event_type" ADD VALUE 'festival_excluded' BEFORE 'expired';--> statement-breakpoint
ALTER TYPE "public"."sanction_event_type" ADD VALUE 'festival_restored' BEFORE 'expired';--> statement-breakpoint
ALTER TYPE "public"."sanction_event_type" ADD VALUE 'reservation_eligibility_changed' BEFORE 'expired';--> statement-breakpoint
CREATE TABLE "festival_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"from_status" "festival_status",
	"to_status" "festival_status" NOT NULL,
	"actor_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanction_festivals" (
	"sanction_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"qualified_at" timestamp NOT NULL,
	"reservation_eligible_at" timestamp,
	"counted_at" timestamp,
	"festival_end_at" timestamp,
	"counts_toward_duration" boolean DEFAULT true NOT NULL,
	"excluded_reason" text,
	CONSTRAINT "sanction_festivals_sanction_id_festival_id_unique" UNIQUE("sanction_id","festival_id"),
	CONSTRAINT "sanction_festivals_exclusion_reason_check" CHECK ((
        ("sanction_festivals"."counts_toward_duration" = true AND "sanction_festivals"."excluded_reason" IS NULL)
        OR
        ("sanction_festivals"."counts_toward_duration" = false AND NULLIF(BTRIM("sanction_festivals"."excluded_reason"), '') IS NOT NULL)
      )),
	CONSTRAINT "sanction_festivals_count_snapshot_check" CHECK ((
        ("sanction_festivals"."counted_at" IS NULL AND "sanction_festivals"."festival_end_at" IS NULL)
        OR
        ("sanction_festivals"."counted_at" IS NOT NULL AND "sanction_festivals"."festival_end_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "festival_status_events" ADD CONSTRAINT "festival_status_events_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_status_events" ADD CONSTRAINT "festival_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_festivals" ADD CONSTRAINT "sanction_festivals_sanction_id_sanctions_id_fk" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_festivals" ADD CONSTRAINT "sanction_festivals_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "festival_status_events_festival_id_created_at_idx" ON "festival_status_events" USING btree ("festival_id","created_at");--> statement-breakpoint
CREATE INDEX "sanction_festivals_sanction_id_counted_at_idx" ON "sanction_festivals" USING btree ("sanction_id","counted_at");--> statement-breakpoint
CREATE INDEX "sanction_festivals_festival_id_idx" ON "sanction_festivals" USING btree ("festival_id");