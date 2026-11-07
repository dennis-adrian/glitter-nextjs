# Implementation Plan: Payment Voucher Verification

**Product:** Glitter

**Feature area:** Payment vouchers in the store, stand reservations, credit top-ups, and paid programs

**Status:** Proposed — nothing implemented. Phases ordered so each ships alone and is useful alone.

**Last updated:** 2026-11-07

**References:** [PRD-multi-payment-access.md](./PRD-multi-payment-access.md), [PRD-paid-programs-and-sessions.md](./PRD-paid-programs-and-sessions.md), [ARCHITECTURE-feature-flags.md](./ARCHITECTURE-feature-flags.md)

---

## 0. Why this shape

Every voucher today is confirmed by hand against the Banco Mercantil Santa Cruz account statement. The voucher image proves nothing on its own: it can belong to another payee, be uploaded twice, or describe a transfer that never arrived. The bank statement is the only ground truth, so the system verifies **statement rows**, and uses the voucher image only to find the right row.

A dry run against a production backup (74 vouchers from 04/11 to the export cutoff, 68 bank credits) set the design constraints:

| Scenario | Share | Consequence |
| --- | --- | --- |
| Amount + minute + ≥2 whole name tokens match one row | 46 / 74 | The only tier that may auto-confirm |
| Amount + minute match, payer name differs (relative or friend paid) | 8 / 74 | Candidate shown to the reviewer, never auto |
| Amount + minute match, payer is a fintech (Binance → `A T C S A`, Takenos, Yape) | 5 / 74 | Candidate, never auto |
| Several rows with the same amount in the same minute (nine Bs 370 at 20:01) | 9 / 74 | Reviewer picks; the system only narrows |
| No statement row (after cutoff, or never arrived) | 6 / 74 | Flagged; cutoff distinguishes "wait" from "missing" |

Other facts the design has to honour:

- Legal names are often nicknames (`Cooper R.`, `Cheesecake Arts`); half the festival-491 owners have fewer than three name tokens. Match on **whole tokens only**; prefix matching produced false positives.
- The same person pays with the same bank account across flows, so a learned payer alias per user is high value.
- Expected amount is `invoice total − credit allocations − prior payments`. 13 invoices were mixed tender (Bs 20 credits + bank), and repriced invoices carry two payments.
- Every UploadThing upload mints a new key, so duplicate uploads are invisible today. Dedupe needs a **content hash**, not the file key.
- Rejection reasons were never recorded, so there is no history to calibrate thresholds on. Shadow mode produces it.
- Credit top-ups grant credits **before** review (`submitCreditTopUpVoucher`); 27 top-ups were spent before approval. That flow gains the most from fast verification and goes first.
- All vouchers are JPEG or PNG, 78 KB to 1.2 MB.
- The glosa reveals the QR used: `tiendita glitter` = store, `festivales` = festival QR, `glitter` = credits/other.

## 1. Non-goals

- No bank API or webhook integration. Mercantil offers none the team can use; the Excel export is the feed.
- No OCR of other banks' transaction ids. BCP, BNB, Yape, and Binance ids never appear in the Mercantil statement.
- No auto-rejection, ever. The system auto-**confirms** one tier and only annotates the rest.
- No change to how participants upload. Upload routes gain a hash; the screens stay as they are.

## 2. Verdict model

Every voucher review produces one `verification` row with a verdict:

| Verdict | Rule | Admin effect |
| --- | --- | --- |
| `exact` | Exactly one unconsumed statement row with the expected amount, within ±2 min of the voucher time, and ≥2 whole name tokens shared with the payer's legal name or a learned alias | Auto-confirm (once out of shadow mode) |
| `candidate` | Exactly one unconsumed row with the expected amount within ±2 min, name does not qualify | Pre-selected in the dialog, reviewer confirms |
| `ambiguous` | More than one unconsumed row qualifies on amount + time | Rows listed, reviewer picks one |
| `amount_mismatch` | A row matches on time + name but not on the expected amount | Shown with the delta; reviewer decides |
| `no_row` | Nothing matches | `after_cutoff` or `missing` sub-flag by comparing voucher time to the latest ingested statement |
| `duplicate` | Content hash already attached to another voucher | Blocked at upload, surfaced to admin |
| `unreadable` | Extraction could not get amount or time | Reviewer handles as today |

A row is **consumed** when a review confirms it against a voucher. A consumed row never matches again; this is what turns "same voucher uploaded to two orders" and "one transfer claimed twice" into hard failures instead of judgment calls.

## 3. Phases

### Phase 0 — Content-hash dedupe on every upload route

Smallest change, immediate payoff, and the hash is needed by every later phase.

- New table `voucher_files`: `sha256` (unique), `url`, `file_key`, `byte_size`, `width`, `height`, `uploaded_by_user_id`, `flow` (`order` | `reservation` | `credit_top_up` | `program`), `target_id`, `created_at`.
- In `app/api/uploadthing/core.ts`, the `onUploadComplete` of `storeOrderPayment`, `guestOrderPayment`, `reservationPayment`, `adminReservationPayment`, `creditTopUpVoucher`, and `sessionPurchaseVoucher` fetches the file, hashes it, and inserts the row. A hash collision with a different target returns a `DUPLICATE_VOUCHER` failure to the client and the upload is queued for deletion through `storageCleanupJobs`.
- Backfill script hashes existing vouchers (read-only against UploadThing, writes only `voucher_files`), so the dedupe check sees history from day one.
- Orders and programs gain a `voucher_file_id` reference; reservations and credits already have `file_key` and get the same reference for uniformity.

### Phase 1 — Statement ingestion

- New table `bank_statement_entries`: `bank` (enum, `mercantil` only for now), `ft_code` (unique per bank), `posted_at` (timestamptz, converted from La Paz time), `amount`, `payer_name`, `payer_name_normalized`, `glosa`, `glosa_channel` (`store` | `festival` | `credits` | `other`, derived from the glosa), `raw` (jsonb), `import_id`, `consumed_by_verification_id` (nullable), `created_at`.
- New table `bank_statement_imports`: `uploaded_by_user_id`, `file_name`, `period_start`, `period_end`, `cutoff_at` (latest `posted_at` in the file), `row_count`, `new_row_count`, `created_at`.
- Admin page `/dashboard/finanzas/extractos`: upload the Mercantil Excel export, preview the parsed rows, confirm. Re-uploading an overlapping period is safe because FT code is the key; existing rows are left untouched (consumption must survive re-import).
- Parser is a pure function with fixtures from real exports (names and amounts anonymised). Name normalization: uppercase, strip accents, collapse whitespace, drop punctuation, tokenize on spaces.
- Library: `xlsx` (SheetJS) or `exceljs`; pick the one that reads the export without a browser dependency. Neither is in the repo today.

### Phase 2 — Voucher field extraction

- New table `voucher_extractions`: `voucher_file_id`, `model`, `amount`, `currency`, `paid_at` (timestamptz, from the printed La Paz time), `payer_name`, `payee_name`, `bank`, `transaction_ref`, `confidence` (`high` | `medium` | `low`), `raw` (jsonb), `created_at`.
- Extraction runs from `onUploadComplete` through an outbox job, never inline: a slow or failed model call must not fail the upload. Job table follows the existing notification-outbox pattern (`app/api/cron/...`).
- Call Claude through `@anthropic-ai/sdk` with the image as base64 and `output_config.format` set to the extraction schema, so the result validates without hand parsing. Model `claude-opus-5-5`, `output_config.effort: "low"`, with the server-side `fallbacks: "default"` parameter on. Haiku 5.5 is evaluated during shadow mode as a cheaper extractor; the switch is a config change.
- Prompt asks only for the printed fields. It never asks whether the payment is valid; that is the matcher's job.
- Retries: three attempts with backoff, then `unreadable`.

### Phase 3 — Matching engine (shadow mode)

- Pure module `app/lib/payments/verification/match.ts`: input is the extraction, the expected amount, the payer's legal name plus aliases, and the unconsumed statement rows in the time window. Output is the verdict and the ordered candidate rows with reason codes. No database access inside; it is tested with the dry-run scenarios turned into fixtures.
- Expected amount per flow:
  - Orders: order total minus any prior confirmed payment.
  - Reservations: invoice total minus credit allocations minus prior payments (from `invoices`, `invoiceCreditAllocations`, `payments`).
  - Credit top-ups: `creditTopUps.amount`.
  - Programs: purchase total.
- New table `voucher_verifications`: `flow`, `target_id`, `voucher_file_id`, `extraction_id`, `verdict`, `sub_flag`, `expected_amount`, `candidate_entry_ids` (int[]), `selected_entry_id`, `reason_codes` (text[]), `decided_by` (`system` | `admin`), `reviewer_user_id`, `admin_decision` (`approved` | `rejected` | null), `rejection_reason_code`, `created_at`, `decided_at`.
- Runs after extraction and again whenever a new statement import lands (re-evaluates every open `no_row` and `after_cutoff` verification).
- **Shadow mode:** the verdict and candidates appear in the four existing review dialogs as a read-only panel. The admin decides exactly as today. Every decision is recorded against the system verdict, with a rejection reason code picked from a fixed list (`wrong_payee`, `wrong_amount`, `duplicate`, `not_received`, `unreadable`, `other`).
- Feature flag `voucher_verification` at `admin_only` gates the panel.

### Phase 4 — Payer aliases

- New table `payer_aliases`: `user_id`, `bank`, `payer_name_normalized`, `source` (`confirmed_match` | `admin`), `confirmations`, `last_seen_at`. Unique on (`user_id`, `bank`, `payer_name_normalized`).
- Written whenever an admin confirms a voucher against a statement row whose payer name did not already qualify. The next voucher from the same relative or fintech account becomes `exact`.
- Admin can see and delete aliases from the user's profile in the dashboard.

### Phase 5 — Auto-confirm, credits first

Entry condition, measured over shadow-mode data: every `exact` verdict in the sample was also approved by an admin, with zero exceptions, over at least four weeks or 100 vouchers, whichever is later.

- Flag `voucher_auto_confirm_credits` at `admin_only`, then `public`. When on, an `exact` verdict calls `reviewCreditTopUp` with `reviewerUserId` set to the system user and `decided_by = 'system'`, inside the same transaction that consumes the statement row.
- Then reservations (`approveInvoiceSettlement`), store orders (`updateOrderStatus`), and programs (`review-actions.ts`), each behind its own flag and its own shadow-mode gate.
- Auto-confirmation is reversible by an admin through the existing rejection path; rejecting releases the consumed statement row.
- Every auto-confirmation posts an in-app notification to admins listing the voucher, the FT code, and the matched row, so a wrong match is seen the same day.

### Phase 6 — Queue and reporting

- The four review queues gain a verdict column and a filter, so admins work `candidate` and `ambiguous` first and `no_row` once a new statement is in.
- `/dashboard/finanzas/extractos` shows unmatched **statement rows** too: money that arrived with no voucher. Today that is invisible.
- Weekly digest: auto-confirmed count, overridden count, open `no_row` older than 48 h.

## 4. Invariants

- A statement row is consumed by at most one verification. Enforced with a unique partial index on `consumed_by_verification_id`.
- A voucher file hash belongs to at most one target. Enforced with the unique index on `voucher_files.sha256`.
- `exact` is the only verdict that can set `decided_by = 'system'`. Enforced with a check constraint.
- Consumption and the flow's own approval commit in one transaction; a failure in either rolls back both.
- Re-importing a statement never updates or deletes an existing row.

## 5. Order of work and sizing

| Phase | Depends on | Size |
| --- | --- | --- |
| 0 — Hash dedupe | — | S |
| 1 — Statement ingestion | — | M |
| 2 — Extraction | 0 | M |
| 3 — Matching + shadow panel | 1, 2 | L |
| 4 — Aliases | 3 | S |
| 5 — Auto-confirm (credits, then the rest) | 3, 4, shadow data | M |
| 6 — Queue and reporting | 3 | M |

Phases 0 and 1 can be built in parallel. Phase 5 has a calendar dependency on shadow data that no amount of engineering shortens.

## 6. Open decisions for Dennis

1. Time window: ±2 minutes between the printed voucher time and the statement `posted_at`, or stricter (same minute)? The dry run used the same minute; a wider window raises `ambiguous` counts in bursts.
2. Whether a `candidate` with a learned alias and the right amount should auto-confirm, or whether aliases only ever promote to `exact` on the next voucher.
3. Who is the system reviewer user in `reviewed_by_user_id`: a dedicated service row, or null with `decided_by = 'system'` carrying the meaning.
4. Whether statement upload is admin-only or also `festival_admin`.

## 7. Testing

- Matcher: fixture-driven unit tests from the dry-run scenarios (exact, relative payer, fintech payer, same-minute burst, repriced invoice, mixed tender, after cutoff, never arrived, prefix-name false positive).
- Parser: fixtures from anonymised real exports, including a re-import of an overlapping period.
- Integration: upload → hash → extraction job → verdict → admin decision → consumption, per flow, against the Docker test database (`pnpm db:test:up && pnpm migrate:test && pnpm test:integration`).
- Duplicate upload across two flows is rejected at the second upload.
- Auto-confirm transaction rolls back when consumption fails.

## 8. Database rules

Schema changes go through `db/schema.ts` and `pnpm exec drizzle-kit generate`. Migrations are never hand-edited and never applied by anyone but Dennis against production.
