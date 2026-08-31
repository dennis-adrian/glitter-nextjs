ALTER TYPE "public"."reservation_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."reservation_status" ADD VALUE 'released';--> statement-breakpoint
CREATE TABLE "stand_hold_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"hold_id" integer NOT NULL,
	"stand_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stand_reservation_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" integer NOT NULL,
	"stand_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "stand_reservations_live_stand_unique";--> statement-breakpoint
ALTER TABLE "stand_holds" ADD COLUMN "individual_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_holds" ADD COLUMN "shared_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN "individual_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN "shared_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN "booked_participant_count" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
-- The legacy amount remains the booking adapter through Phase 2. Snapshot it
-- explicitly now so later shared-price work cannot rewrite booked prices.
UPDATE "stand_holds"
SET "individual_price_snapshot" = "price_amount_snapshot"
WHERE "individual_price_snapshot" IS NULL;--> statement-breakpoint
UPDATE "stand_reservations" AS sr
SET
  "individual_price_snapshot" = sr."price_amount_snapshot",
  "booked_participant_count" = counts.participant_count
FROM (
  SELECT reservation_id, count(*)::smallint AS participant_count
  FROM "participations"
  GROUP BY reservation_id
) AS counts
WHERE counts.reservation_id = sr.id;--> statement-breakpoint
ALTER TABLE "stand_hold_members" ADD CONSTRAINT "stand_hold_members_hold_id_stand_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."stand_holds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_hold_members" ADD CONSTRAINT "stand_hold_members_stand_id_stands_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."stands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_reservation_members" ADD CONSTRAINT "stand_reservation_members_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_reservation_members" ADD CONSTRAINT "stand_reservation_members_stand_id_stands_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."stands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_hold_members_hold_id_unique" ON "stand_hold_members" USING btree ("hold_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_hold_members_stand_id_unique" ON "stand_hold_members" USING btree ("stand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservation_members_reservation_id_unique" ON "stand_reservation_members" USING btree ("reservation_id");--> statement-breakpoint
-- A historical rejected/cancelled reservation can share a stand with its later
-- occupant, so member stand IDs are deliberately not globally unique. Capacity
-- is enforced by the parent partial index below until Phase 3 moves it to the
-- aggregate member model.
INSERT INTO "stand_hold_members" ("hold_id", "stand_id")
SELECT "id", "stand_id" FROM "stand_holds";--> statement-breakpoint
INSERT INTO "stand_reservation_members" ("reservation_id", "stand_id")
SELECT "id", "stand_id" FROM "stand_reservations";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sync_stand_hold_member"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "stand_hold_members" ("hold_id", "stand_id")
  VALUES (NEW.id, NEW.stand_id)
  ON CONFLICT ("hold_id") DO UPDATE SET "stand_id" = EXCLUDED."stand_id";
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stand_holds_sync_single_member"
AFTER INSERT OR UPDATE OF "stand_id" ON "stand_holds"
FOR EACH ROW EXECUTE FUNCTION "sync_stand_hold_member"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_stand_hold_member_cardinality"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_hold_id integer := CASE WHEN TG_OP = 'DELETE' THEN OLD.hold_id ELSE NEW.hold_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM "stand_holds" WHERE id = target_hold_id)
    AND (SELECT count(*) FROM "stand_hold_members" WHERE hold_id = target_hold_id) <> 1 THEN
    RAISE EXCEPTION 'stand hold % must have exactly one member during Phase 0B', target_hold_id;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "stand_hold_members_exactly_one"
AFTER INSERT OR UPDATE OR DELETE ON "stand_hold_members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_stand_hold_member_cardinality"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sync_stand_reservation_member"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "stand_reservation_members" ("reservation_id", "stand_id")
  VALUES (NEW.id, NEW.stand_id)
  ON CONFLICT ("reservation_id") DO UPDATE SET "stand_id" = EXCLUDED."stand_id";
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stand_reservations_sync_single_member"
AFTER INSERT OR UPDATE OF "stand_id" ON "stand_reservations"
FOR EACH ROW EXECUTE FUNCTION "sync_stand_reservation_member"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_stand_reservation_member_cardinality"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_reservation_id integer := CASE WHEN TG_OP = 'DELETE' THEN OLD.reservation_id ELSE NEW.reservation_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM "stand_reservations" WHERE id = target_reservation_id)
    AND (SELECT count(*) FROM "stand_reservation_members" WHERE reservation_id = target_reservation_id) <> 1 THEN
    RAISE EXCEPTION 'stand reservation % must have exactly one member during Phase 0B', target_reservation_id;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "stand_reservation_members_exactly_one"
AFTER INSERT OR UPDATE OR DELETE ON "stand_reservation_members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_stand_reservation_member_cardinality"();--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservations_capacity_stand_unique" ON "stand_reservations" USING btree ("stand_id") WHERE "stand_reservations"."status" IN ('pending', 'verification_payment', 'accepted');
