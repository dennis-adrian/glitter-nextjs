-- 0261 added stands.individual_price with DEFAULT 0 and no backfill, so every
-- row that predates it reads 0 while the legacy stands.price adapter still
-- holds the real amount. Copy the adapter across before any reader switches to
-- the new column, otherwise existing stands would silently price at Bs 0.
--
-- Only rows still sitting at the column default are touched: a stand an admin
-- already repriced through the Phase 2 editor keeps its edited value, and a
-- genuinely free stand is already correct at 0. Re-running is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stands'
      AND column_name = 'individual_price'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stands'
      AND column_name = 'price'
  ) THEN
    UPDATE "stands"
    SET "individual_price" = "price"
    WHERE "individual_price" = 0
      AND "price" <> 0;
  END IF;
END;
$$;
