-- Apply after `scripts/backfill-reservation-hardening.ts` on databases that
-- already have reservation rows. Empty/dev databases can apply immediately.
DROP INDEX "invoice_settlement_submissions_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "payments_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "stand_holds_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "stand_reservations_live_stand_idx";--> statement-breakpoint
DROP INDEX "stand_reservations_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "stand_holds_stand_idx";--> statement-breakpoint
DROP INDEX "stand_holds_user_festival_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_settlement_submissions_idempotency_key_unique" ON "invoice_settlement_submissions" USING btree ("idempotency_key") WHERE "invoice_settlement_submissions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_unique" ON "payments" USING btree ("idempotency_key") WHERE "payments"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_holds_idempotency_key_unique" ON "stand_holds" USING btree ("idempotency_key") WHERE "stand_holds"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservations_live_stand_unique" ON "stand_reservations" USING btree ("stand_id") WHERE "stand_reservations"."status" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservations_idempotency_key_unique" ON "stand_reservations" USING btree ("idempotency_key") WHERE "stand_reservations"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_holds_stand_idx" ON "stand_holds" USING btree ("stand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_holds_user_festival_idx" ON "stand_holds" USING btree ("user_id","festival_id");