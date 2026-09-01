-- Repair databases where 0251 ran before the all-reservation backfill existed.
-- A shared preview database can record a newer branch migration and therefore
-- skip 0251; leave that unrelated schema state untouched instead of failing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stand_reservations'
      AND column_name = 'individual_price_snapshot'
  ) THEN
    UPDATE "stand_reservations"
    SET "individual_price_snapshot" = "price_amount_snapshot"
    WHERE "individual_price_snapshot" IS NULL;
  END IF;
END;
$$;
