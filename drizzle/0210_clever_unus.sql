ALTER TABLE "infraction_types" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "infraction_types" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "infraction_types_label_unique" ON "infraction_types" USING btree (lower("label"));--> statement-breakpoint
CREATE INDEX "infraction_types_active_label_idx" ON "infraction_types" USING btree ("active","label");--> statement-breakpoint
ALTER TABLE "infraction_types" ADD CONSTRAINT "infraction_types_archive_state_check" CHECK (
        (
          "infraction_types"."active" = true
          AND "infraction_types"."archived_at" IS NULL
        )
        OR
        (
          "infraction_types"."active" = false
          AND "infraction_types"."archived_at" IS NOT NULL
        )
      );