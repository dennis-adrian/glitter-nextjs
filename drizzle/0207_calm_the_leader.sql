DO $$
DECLARE
	duplicate_infraction_ids text;
	inactive_sanction_ids text;
	reservation_delay_ids text;
	invalid_duration_ids text;
	invalid_relationship_ids text;
BEGIN
	SELECT string_agg(duplicate.infraction_id::text, ', ' ORDER BY duplicate.infraction_id)
	INTO duplicate_infraction_ids
	FROM (
		SELECT "infraction_id"
		FROM "sanctions"
		GROUP BY "infraction_id"
		HAVING count(*) > 1
	) AS duplicate;

	IF duplicate_infraction_ids IS NOT NULL THEN
		RAISE EXCEPTION 'Phase 3 migration requires manual review: infractions linked to several sanctions: %', duplicate_infraction_ids
			USING HINT = 'Resolve every duplicate legacy relationship before rerunning this migration.';
	END IF;

	SELECT string_agg("id"::text, ', ' ORDER BY "id")
	INTO inactive_sanction_ids
	FROM "sanctions"
	WHERE "active" = false;

	IF inactive_sanction_ids IS NOT NULL THEN
		RAISE EXCEPTION 'Phase 3 migration requires manual review: inactive sanctions must be classified as expired or revoked: %', inactive_sanction_ids
			USING HINT = 'Classify these records explicitly before rerunning this migration; the legacy active flag is ambiguous.';
	END IF;

	SELECT string_agg("id"::text, ', ' ORDER BY "id")
	INTO reservation_delay_ids
	FROM "sanctions"
	WHERE "type" = 'reservation_delay';

	IF reservation_delay_ids IS NOT NULL THEN
		RAISE EXCEPTION 'Phase 3 migration requires manual review: reservation-delay sanctions have ambiguous legacy duration values: %', reservation_delay_ids
			USING HINT = 'Separate sanction validity from reservation delay minutes before rerunning this migration.';
	END IF;

	SELECT string_agg("id"::text, ', ' ORDER BY "id")
	INTO invalid_duration_ids
	FROM "sanctions"
	WHERE "duration_unit" <> 'indefinitely'
		AND ("duration" IS NULL OR "duration" <= 0);

	IF invalid_duration_ids IS NOT NULL THEN
		RAISE EXCEPTION 'Phase 3 migration cannot backfill non-positive legacy sanction durations: %', invalid_duration_ids;
	END IF;

	SELECT string_agg(s."id"::text, ', ' ORDER BY s."id")
	INTO invalid_relationship_ids
	FROM "sanctions" s
	LEFT JOIN "infractions" i ON i."id" = s."infraction_id"
	WHERE i."id" IS NULL OR i."user_id" <> s."user_id";

	IF invalid_relationship_ids IS NOT NULL THEN
		RAISE EXCEPTION 'Phase 3 migration found sanctions without a valid same-user infraction: %', invalid_relationship_ids;
	END IF;
END
$$;--> statement-breakpoint
CREATE TYPE "public"."sanction_event_type" AS ENUM('created', 'approved', 'edited', 'extended', 'scope_changed', 'infractions_changed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."sanction_festival_scope" AS ENUM('global', 'glitter', 'festicker', 'twinkler');--> statement-breakpoint
CREATE TYPE "public"."sanction_status" AS ENUM('scheduled', 'active', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "sanction_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"sanction_id" integer NOT NULL,
	"actor_user_id" integer,
	"event_type" "sanction_event_type" NOT NULL,
	"from_status" "sanction_status",
	"to_status" "sanction_status",
	"changes" jsonb,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanction_infractions" (
	"sanction_id" integer NOT NULL,
	"infraction_id" integer NOT NULL,
	"linked_by_user_id" integer,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sanction_infractions_sanction_id_infraction_id_unique" UNIQUE("sanction_id","infraction_id")
);
--> statement-breakpoint
ALTER TABLE "sanctions" DROP CONSTRAINT "sanctions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sanctions" ALTER COLUMN "infraction_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "status" "sanction_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "festival_scope" "sanction_festival_scope" DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "validity_duration" integer;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "validity_unit" "duration_unit" DEFAULT 'indefinitely' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "starts_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "reservation_delay_minutes" integer;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "approved_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "approved_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "revoked_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "revocation_reason" text;--> statement-breakpoint
ALTER TABLE "sanction_events" ADD CONSTRAINT "sanction_events_sanction_id_sanctions_id_fk" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_events" ADD CONSTRAINT "sanction_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_infractions" ADD CONSTRAINT "sanction_infractions_sanction_id_sanctions_id_fk" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_infractions" ADD CONSTRAINT "sanction_infractions_infraction_id_infractions_id_fk" FOREIGN KEY ("infraction_id") REFERENCES "public"."infractions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_infractions" ADD CONSTRAINT "sanction_infractions_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanction_events_sanction_id_created_at_idx" ON "sanction_events" USING btree ("sanction_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sanction_infractions_infraction_id_unique" ON "sanction_infractions" USING btree ("infraction_id");--> statement-breakpoint
CREATE INDEX "sanction_infractions_sanction_id_idx" ON "sanction_infractions" USING btree ("sanction_id");--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanctions_user_id_status_idx" ON "sanctions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sanctions_festival_scope_status_idx" ON "sanctions" USING btree ("festival_scope","status");--> statement-breakpoint
CREATE INDEX "sanctions_ends_at_idx" ON "sanctions" USING btree ("ends_at");--> statement-breakpoint
WITH legacy_sanctions AS (
	SELECT
		"id",
		CASE "duration_unit"
			WHEN 'minutes' THEN "created_at" + "duration" * INTERVAL '1 minute'
			WHEN 'hours' THEN "created_at" + "duration" * INTERVAL '1 hour'
			WHEN 'days' THEN "created_at" + "duration" * INTERVAL '1 day'
			WHEN 'months' THEN "created_at" + "duration" * INTERVAL '1 month'
			WHEN 'years' THEN "created_at" + "duration" * INTERVAL '1 year'
			ELSE NULL
		END AS calculated_ends_at
	FROM "sanctions"
)
UPDATE "sanctions" AS s
SET
	"status" = CASE
		WHEN s."created_at" > now() THEN 'scheduled'::"sanction_status"
		WHEN legacy.calculated_ends_at IS NOT NULL AND legacy.calculated_ends_at <= now() THEN 'expired'::"sanction_status"
		ELSE 'active'::"sanction_status"
	END,
	"festival_scope" = 'global'::"sanction_festival_scope",
	"validity_duration" = CASE WHEN s."duration_unit" = 'indefinitely' THEN NULL ELSE s."duration" END,
	"validity_unit" = s."duration_unit",
	"starts_at" = s."created_at",
	"ends_at" = legacy.calculated_ends_at,
	"reservation_delay_minutes" = NULL,
	"approved_at" = s."created_at",
	"active" = CASE
		WHEN legacy.calculated_ends_at IS NOT NULL AND legacy.calculated_ends_at <= now() THEN false
		ELSE true
	END
FROM legacy_sanctions AS legacy
WHERE legacy."id" = s."id";--> statement-breakpoint
INSERT INTO "sanction_infractions" ("sanction_id", "infraction_id", "linked_at")
SELECT "id", "infraction_id", "created_at"
FROM "sanctions"
ORDER BY "id";--> statement-breakpoint
INSERT INTO "sanction_events" ("sanction_id", "event_type", "to_status", "note", "created_at")
SELECT "id", 'approved'::"sanction_event_type", "status", 'Migrated from legacy sanction record', "created_at"
FROM "sanctions"
ORDER BY "id";--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_validity_configuration_check" CHECK (
        (
          "sanctions"."validity_unit" = 'indefinitely'
          AND "sanctions"."validity_duration" IS NULL
          AND "sanctions"."ends_at" IS NULL
        )
        OR
        (
          "sanctions"."validity_unit" = 'festivals'
          AND "sanctions"."validity_duration" > 0
          AND "sanctions"."ends_at" IS NULL
        )
        OR
        (
          "sanctions"."validity_unit" IN ('minutes', 'hours', 'days', 'months', 'years')
          AND "sanctions"."validity_duration" > 0
          AND "sanctions"."ends_at" > "sanctions"."starts_at"
        )
      );--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_reservation_delay_configuration_check" CHECK (
        (
          "sanctions"."type" = 'reservation_delay'
          AND "sanctions"."reservation_delay_minutes" > 0
        )
        OR
        (
          "sanctions"."type" <> 'reservation_delay'
          AND "sanctions"."reservation_delay_minutes" IS NULL
        )
      );--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_revocation_configuration_check" CHECK (
        (
          "sanctions"."status" = 'revoked'
          AND "sanctions"."revoked_by_user_id" IS NOT NULL
          AND "sanctions"."revoked_at" IS NOT NULL
          AND NULLIF(BTRIM("sanctions"."revocation_reason"), '') IS NOT NULL
        )
        OR
        (
          "sanctions"."status" <> 'revoked'
          AND "sanctions"."revoked_by_user_id" IS NULL
          AND "sanctions"."revoked_at" IS NULL
          AND "sanctions"."revocation_reason" IS NULL
        )
      );
