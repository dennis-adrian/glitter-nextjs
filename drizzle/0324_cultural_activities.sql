-- Cultural activities (formerly live acts): two new categories, `workshop`
-- and `other`, and the fields they ask for. The new category labels are only
-- written by the app, never by a statement here (see
-- drizzle/enum-labels.test.ts), so the per-category requirements live in the
-- zod schema and the server action, not in CHECK constraints. Idempotent.
ALTER TYPE "public"."live_act_category" ADD VALUE IF NOT EXISTS 'workshop';--> statement-breakpoint
ALTER TYPE "public"."live_act_category" ADD VALUE IF NOT EXISTS 'other';--> statement-breakpoint
ALTER TABLE "live_acts" ADD COLUMN IF NOT EXISTS "other_type" text;--> statement-breakpoint
ALTER TABLE "live_acts" ADD COLUMN IF NOT EXISTS "workshop_capacity" integer;--> statement-breakpoint
ALTER TABLE "live_acts" ADD COLUMN IF NOT EXISTS "space_needs" text;--> statement-breakpoint
ALTER TABLE "live_acts" ADD COLUMN IF NOT EXISTS "related_offer" text;--> statement-breakpoint
ALTER TABLE "live_acts" ADD COLUMN IF NOT EXISTS "no_cost_acknowledged_at" timestamp;
