-- Phase 0B closure (PRD §11, §16): replace the single-member reservation
-- adapter with the real aggregate member table, so a reservation can hold more
-- than one stand once full tables land.
--
-- The parent `stand_reservations.stand_id` column and its
-- `stand_reservations_capacity_stand_unique` index deliberately stay: the PRD
-- keeps the parent protection until the member protection has been verified in
-- production. Writers keep both in step, and cardinality stays at one until
-- full-table confirmation actually creates a second member.
CREATE TABLE "stand_reservation_stands" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" integer NOT NULL,
	"stand_id" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"released_at" timestamp,
	-- Denormalised from the parent and maintained by trigger. Occupancy has to
	-- be enforced by a unique index rather than a check, and a partial index
	-- cannot reach into another table, so the predicate needs the status here.
	-- The default is never observed: the BEFORE trigger below overwrites it from
	-- the parent on every insert. It exists so writers do not have to pass a
	-- column they must not choose.
	"reservation_status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stand_reservation_stands_position_nonnegative" CHECK ("stand_reservation_stands"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stand_reservation_stands" ADD CONSTRAINT "stand_reservation_stands_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_reservation_stands" ADD CONSTRAINT "stand_reservation_stands_stand_id_stands_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."stands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservation_stands_reservation_position_unique" ON "stand_reservation_stands" USING btree ("reservation_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservation_stands_reservation_stand_unique" ON "stand_reservation_stands" USING btree ("reservation_id","stand_id");--> statement-breakpoint
-- The member-level occupancy guarantee: one live, unreleased member per stand.
CREATE UNIQUE INDEX "stand_reservation_stands_active_stand_unique" ON "stand_reservation_stands" USING btree ("stand_id") WHERE "stand_reservation_stands"."released_at" IS NULL AND "stand_reservation_stands"."reservation_status" IN ('pending', 'verification_payment', 'accepted');--> statement-breakpoint
CREATE INDEX "stand_reservation_stands_stand_id_idx" ON "stand_reservation_stands" USING btree ("stand_id");--> statement-breakpoint

-- Backfill every adapter row at position 0, unreleased, carrying the parent
-- status the occupancy predicate needs.
INSERT INTO "stand_reservation_stands"
  ("reservation_id", "stand_id", "position", "released_at", "reservation_status", "created_at")
SELECT m."reservation_id", m."stand_id", 0, NULL, r."status", m."created_at"
FROM "stand_reservation_members" m
INNER JOIN "stand_reservations" r ON r."id" = m."reservation_id";--> statement-breakpoint

-- Validate the copy before anything starts depending on it. A reservation that
-- lost its membership here would silently stop occupying its stand.
DO $$
DECLARE
  adapter_count bigint;
  copied_count bigint;
  mismatched bigint;
BEGIN
  SELECT count(*) INTO adapter_count FROM "stand_reservation_members";
  SELECT count(*) INTO copied_count FROM "stand_reservation_stands";
  IF adapter_count <> copied_count THEN
    RAISE EXCEPTION 'stand_reservation_stands backfill copied % of % adapter rows', copied_count, adapter_count;
  END IF;

  SELECT count(*) INTO mismatched
  FROM "stand_reservation_members" m
  LEFT JOIN "stand_reservation_stands" s
    ON s."reservation_id" = m."reservation_id" AND s."stand_id" = m."stand_id"
  WHERE s."id" IS NULL;
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'stand_reservation_stands backfill lost % membership rows', mismatched;
  END IF;

  SELECT count(*) INTO mismatched
  FROM "stand_reservation_stands" s
  INNER JOIN "stand_reservations" r ON r."id" = s."reservation_id"
  WHERE s."reservation_status" <> r."status";
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'stand_reservation_stands backfill left % rows with a stale status', mismatched;
  END IF;
END;
$$;--> statement-breakpoint

-- Keep the denormalised status honest. The BEFORE trigger lets writers insert
-- a member without knowing the parent status; the AFTER trigger propagates
-- every later transition.
CREATE OR REPLACE FUNCTION "stand_reservation_stand_status_default"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT "status" INTO NEW."reservation_status"
  FROM "stand_reservations"
  WHERE "id" = NEW."reservation_id";
  IF NEW."reservation_status" IS NULL THEN
    RAISE EXCEPTION 'stand reservation % does not exist', NEW."reservation_id";
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stand_reservation_stands_status_default"
BEFORE INSERT OR UPDATE OF "reservation_id" ON "stand_reservation_stands"
FOR EACH ROW EXECUTE FUNCTION "stand_reservation_stand_status_default"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "stand_reservation_stand_status_sync"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "stand_reservation_stands"
  SET "reservation_status" = NEW."status"
  WHERE "reservation_id" = NEW."id"
    AND "reservation_status" <> NEW."status";
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stand_reservations_sync_member_status"
AFTER UPDATE OF "status" ON "stand_reservations"
FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "stand_reservation_stand_status_sync"();--> statement-breakpoint

-- Holds gain the same aggregate shape. `stand_hold_members_stand_id_unique`
-- stays: it is the active-capacity guarantee, valid because every hold path
-- deletes the aggregate before a stand can be reused.
ALTER TABLE "stand_hold_members" ADD COLUMN "position" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stand_hold_members" ADD CONSTRAINT "stand_hold_members_position_nonnegative" CHECK ("stand_hold_members"."position" >= 0);--> statement-breakpoint
DROP INDEX "stand_hold_members_hold_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "stand_hold_members_hold_position_unique" ON "stand_hold_members" USING btree ("hold_id","position");--> statement-breakpoint
CREATE INDEX "stand_hold_members_hold_id_idx" ON "stand_hold_members" USING btree ("hold_id");--> statement-breakpoint

-- Writers now insert members explicitly, so the Phase 0B adapter machinery goes
-- away. Dropping the exactly-one constraint triggers is what finally makes a
-- two-stand aggregate representable.
DROP TRIGGER IF EXISTS "stand_holds_sync_single_member" ON "stand_holds";--> statement-breakpoint
DROP TRIGGER IF EXISTS "stand_hold_members_exactly_one" ON "stand_hold_members";--> statement-breakpoint
DROP TRIGGER IF EXISTS "stand_reservations_sync_single_member" ON "stand_reservations";--> statement-breakpoint
DROP TRIGGER IF EXISTS "stand_reservation_members_exactly_one" ON "stand_reservation_members";--> statement-breakpoint
DROP FUNCTION IF EXISTS "sync_stand_hold_member"();--> statement-breakpoint
DROP FUNCTION IF EXISTS "enforce_stand_hold_member_cardinality"();--> statement-breakpoint
DROP FUNCTION IF EXISTS "sync_stand_reservation_member"();--> statement-breakpoint
DROP FUNCTION IF EXISTS "enforce_stand_reservation_member_cardinality"();--> statement-breakpoint
DROP TABLE "stand_reservation_members";
