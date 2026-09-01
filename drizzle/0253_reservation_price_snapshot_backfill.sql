-- Repair databases where 0251 ran before the all-reservation backfill existed.
UPDATE "stand_reservations"
SET "individual_price_snapshot" = "price_amount_snapshot"
WHERE "individual_price_snapshot" IS NULL;
