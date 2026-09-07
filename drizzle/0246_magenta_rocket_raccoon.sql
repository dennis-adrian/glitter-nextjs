-- Apply after `scripts/backfill-reservation-hardening.ts` on databases that
-- already have reservation rows. Empty/dev databases can apply immediately.
--
-- Runbook before applying on non-empty databases:
--   1. `pnpm exec tsx scripts/backfill-reservation-hardening.ts --dry-run`
--   2. `pnpm exec tsx scripts/audit-reservation-invariants.ts` (must exit 0)
--   3. Resolve any ambiguous duplicate live reservations manually (see §7.2 in
--      docs/PLAN-stand-reservations-hardening.md) if the preflight below aborts.
-- Hold duplicates are deleted automatically; reservation losers are rejected.
DROP INDEX "invoice_settlement_submissions_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "payments_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "stand_holds_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "stand_reservations_live_stand_idx";--> statement-breakpoint
DROP INDEX "stand_reservations_idempotency_key_idx";--> statement-breakpoint
DROP INDEX "stand_holds_stand_idx";--> statement-breakpoint
DROP INDEX "stand_holds_user_festival_idx";--> statement-breakpoint
-- Duplicate stand_holds.stand_id cleanup (must run before stand_holds_stand_idx).
-- Keeper: newest unexpired hold (expires_at DESC), else latest expired row.
DELETE FROM "stand_holds" AS loser
USING (
	SELECT id
	FROM (
		SELECT id,
			ROW_NUMBER() OVER (
				PARTITION BY stand_id
				ORDER BY
					CASE WHEN expires_at > now() THEN 0 ELSE 1 END,
					expires_at DESC,
					id DESC
			) AS rn
		FROM "stand_holds"
	) AS ranked
	WHERE rn > 1
) AS dups
WHERE loser.id = dups.id;--> statement-breakpoint
-- Duplicate stand_holds (user_id, festival_id) cleanup (must run before stand_holds_user_festival_idx).
-- Keeper: same rule as stand_id dedup above.
DELETE FROM "stand_holds" AS loser
USING (
	SELECT id
	FROM (
		SELECT id,
			ROW_NUMBER() OVER (
				PARTITION BY user_id, festival_id
				ORDER BY
					CASE WHEN expires_at > now() THEN 0 ELSE 1 END,
					expires_at DESC,
					id DESC
			) AS rn
		FROM "stand_holds"
	) AS ranked
	WHERE rn > 1
) AS dups
WHERE loser.id = dups.id;--> statement-breakpoint
-- Ambiguous duplicate live stand_reservations require manual review (never auto-reject paid/accepted rows).
DO $$
DECLARE
	dup_report text;
BEGIN
	SELECT string_agg(
		format('stand_id=%s reservation_ids=%s', stand_id, reservation_ids),
		E'\n' ORDER BY stand_id
	)
	INTO dup_report
	FROM (
		SELECT
			sr.stand_id,
			string_agg(sr.id::text, ',' ORDER BY sr.id) AS reservation_ids
		FROM "stand_reservations" sr
		WHERE sr.status <> 'rejected'
		GROUP BY sr.stand_id
		HAVING count(*) > 1
			AND count(DISTINCT sr.id) FILTER (
				WHERE sr.status = 'accepted'
					OR EXISTS (
						SELECT 1
						FROM "invoices" i
						WHERE i.reservation_id = sr.id
							AND i.status = 'paid'
					)
			) > 1
	) AS ambiguous;

	IF dup_report IS NOT NULL THEN
		RAISE EXCEPTION 'Duplicate live stand reservations require manual review before unique index:%', E'\n' || dup_report
			USING HINT = 'Resolve per docs/PLAN-stand-reservations-hardening.md §7.2; never auto-reject a paid or accepted participant.';
	END IF;
END $$;--> statement-breakpoint
-- Duplicate non-rejected stand_reservations.stand_id cleanup (must run before stand_reservations_live_stand_unique).
-- Keeper: prefer paid invoice; then accepted > verification_payment > pending; then newest row. Losers are rejected.
UPDATE "stand_reservations" AS loser
SET status = 'rejected', updated_at = NOW()
FROM (
	SELECT id
	FROM (
		SELECT id,
			ROW_NUMBER() OVER (
				PARTITION BY stand_id
				ORDER BY
					CASE WHEN EXISTS (
						SELECT 1
						FROM "invoices" i
						WHERE i.reservation_id = "stand_reservations".id
							AND i.status = 'paid'
					) THEN 0 ELSE 1 END,
					CASE status
						WHEN 'accepted' THEN 0
						WHEN 'verification_payment' THEN 1
						WHEN 'pending' THEN 2
						ELSE 3
					END,
					updated_at DESC,
					created_at DESC,
					id DESC
			) AS rn
		FROM "stand_reservations"
		WHERE status <> 'rejected'
	) AS ranked
	WHERE rn > 1
) AS dups
WHERE loser.id = dups.id;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_settlement_submissions_idempotency_key_unique" ON "invoice_settlement_submissions" USING btree ("idempotency_key") WHERE "invoice_settlement_submissions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_unique" ON "payments" USING btree ("idempotency_key") WHERE "payments"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_holds_idempotency_key_unique" ON "stand_holds" USING btree ("idempotency_key") WHERE "stand_holds"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservations_live_stand_unique" ON "stand_reservations" USING btree ("stand_id") WHERE "stand_reservations"."status" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservations_idempotency_key_unique" ON "stand_reservations" USING btree ("idempotency_key") WHERE "stand_reservations"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_holds_stand_idx" ON "stand_holds" USING btree ("stand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_holds_user_festival_idx" ON "stand_holds" USING btree ("user_id","festival_id");
