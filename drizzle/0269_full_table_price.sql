-- A declared full table carries its own price, replacing its halves' individual
-- price on the invoice. Nullable: an unpriced table is withheld from
-- participants rather than sold at a guessed amount, so there is nothing to
-- backfill.
--
-- The snapshots keep a booked table on the price it was quoted at, the way the
-- individual and shared snapshots beside them already do.
ALTER TABLE "stand_groups" ADD COLUMN "full_table_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_holds" ADD COLUMN "full_table_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN "full_table_price_snapshot" numeric(12, 2);
