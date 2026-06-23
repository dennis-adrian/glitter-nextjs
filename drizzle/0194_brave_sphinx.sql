UPDATE "participant_products" pp
SET "participation_id" = keepers."min_id"
FROM (
  SELECT "user_id", "reservation_id", MIN("id") AS "min_id"
  FROM "participations"
  GROUP BY "user_id", "reservation_id"
  HAVING COUNT(*) > 1
) keepers
INNER JOIN "participations" dup
  ON dup."user_id" = keepers."user_id"
  AND dup."reservation_id" = keepers."reservation_id"
  AND dup."id" > keepers."min_id"
WHERE pp."participation_id" = dup."id";--> statement-breakpoint
UPDATE "participations" keeper
SET "has_stamp" = true, "updated_at" = NOW()
WHERE "has_stamp" = false
  AND EXISTS (
    SELECT 1 FROM "participations" dup
    WHERE dup."user_id" = keeper."user_id"
      AND dup."reservation_id" = keeper."reservation_id"
      AND dup."id" > keeper."id"
      AND dup."has_stamp" = true
  );--> statement-breakpoint
DELETE FROM "participations" dup
USING "participations" keeper
WHERE dup."user_id" = keeper."user_id"
  AND dup."reservation_id" = keeper."reservation_id"
  AND dup."id" > keeper."id";--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_user_reservation_unique" UNIQUE("user_id","reservation_id");
