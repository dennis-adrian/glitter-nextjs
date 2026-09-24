ALTER TABLE "merch_collections" ALTER COLUMN "sort_order" SET DEFAULT 1;
--> statement-breakpoint
-- Shift existing values without changing their relative order.
UPDATE "merch_collections" SET "sort_order" = "sort_order" + 1 WHERE "sort_order" < 2147483647;
