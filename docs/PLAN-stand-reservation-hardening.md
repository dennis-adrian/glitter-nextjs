# Implementation Plan: Stand Reservation Hardening

**Product:** Glitter

**Feature area:** Festival stand reservations, holds, invoices, payments

**Status:** In progress — Phases 0–2 implemented (PR [#472](https://github.com/dennis-adrian/glitter-nextjs/pull/472), merge `16975d22`). Next: Phase 3.

**Last updated:** 2026-08-30

**References:** [PRD-stand-reservations.md](./PRD-stand-reservations.md), [PRD-multi-payment-access.md](./PRD-multi-payment-access.md), [PRD-participant-status-management.md](./PRD-participant-status-management.md)

This plan hardens the complete self-service reservation path:

```text
map -> stand hold -> confirmation/partner -> invoice -> payment proof or zero-value review -> admin review
```

It also repairs the related admin actions, data invariants, privacy boundaries, hold cleanup, performance, accessibility, observability, and test coverage. The goal is not merely to make the current screens behave correctly; every state transition must remain correct when a caller bypasses the UI, retries a request, opens several tabs, races another participant, or encounters a post-commit provider failure.

All participant-facing Spanish introduced or changed by this project uses **voseo**.

Status legend used in this document:

| Mark | Meaning |
| --- | --- |
| Implemented | Shipped on `develop` and used by current paths |
| Partial | Present, but incomplete versus this plan |
| Not started | No durable implementation yet |
| Diverges | Implemented, but the as-built behavior differs from a locked decision |

---

## 0. Implementation status (audited 2026-08-30)

Phases **0 through 2 are implemented** as the current baseline. That confirmation is based on the merged reservation-hardening work on `develop` (PR #472) plus a file-level audit of schema, policy, hold/confirmation, admin create, payment/invoice actions, preflight/backfill scripts, and tests.

Phase 0–2 delivered the security containment, canonical participant policy, additive schema, money migration, dual-write of owner/source/snapshots/events, hold/confirmation idempotency, and operational scripts. They did **not** finish the transaction rewrite, settlement command layer, notification outbox worker, or later UX/performance work. A few planned Phase 2 constraints remain open and should be closed during Phase 3 rather than treated as unfinished Phase 0–2 scope.

### 0.1 Phase board

| Phase | Goal | Status |
| --- | --- | --- |
| 0 — Immediate security containment | Auth, ownership, Zod, no caller-supplied objects | **Implemented** (legacy payment route still present, hardened) |
| 1 — Canonical policy and participant flow | Shared policy for pages, holds, confirmation, partners | **Implemented** |
| 2 — Additive schema, preflight, data repair | Columns, money, events, scripts, unique hold/stand indexes | **Implemented** (two planned unique indexes still open) |
| 3 — Transaction and payment rewrite | Locks, settlement commands, outbox, UploadThing callback | **Next** |
| 4 — Cleanup, privacy, and performance | Cron-safe polling, DTOs, indexes, latency budgets | Partial early work only |
| 5 — UX, accessibility, and documentation | Recoverable errors, list view, voseo, Playwright, PRDs | Partial copy/error work only |
| 6 — Rollout and deletion of legacy paths | Flag, rehearsal, remove `/api/payments` and compatibility | Not started |

### 0.2 What Phase 3 should implement next

Do this work in this order. Later phases stay blocked on the command and lock model.

1. **Explicit admin and settlement commands.** Replace remaining generic mutators (`updateReservation`, `deleteReservation`, `updateReservationStatus`, `updateReservationSimple`, `updateInvoiceStatus`, `adminAttachPaymentVoucher`) with:
   - `createAdminReservation` (already exists; move to a server-only admin service)
   - `approveInvoiceSettlement({ submissionId })`
   - `rejectInvoiceSettlement({ submissionId, reason, correction })`
   - `rejectReservation({ reservationId, reason })` (already exists; keep as the only reject path)
   - `cancelReservation({ reservationId, reason })`
   - `extendReservationDeadline({ reservationId, dueAt })` (exists as `extendReservationPaymentDeadline`)
2. **Unified settlement review.** Give `invoice_settlement_submissions` a kind (`payment_proof` \| `zero_value_entitlement`) and review status. Fold `createPayment` and `confirmFreeInvoice` into one payment service. Zero-value owner submission must remain pending review; only admin approval may mark the invoice paid and accept the reservation.
3. **Global lock ordering and advisory locks.** Apply §4.4 in hold, confirmation, payment, discount, admin assignment, and eligibility-changing mutations. Confirmation already uses `FOR UPDATE` and idempotency keys; it does not yet take participant advisory locks.
4. **Notification outbox.** The `reservation_notification_jobs` table exists and is unused. Add `notification-outbox.ts` plus `app/api/cron/morning/reservationNotifications/route.ts`. Enqueue inside the mutation transaction and process with `after()` plus cron. Remove synchronous Resend from hold/payment/reject hot paths.
5. **Authoritative UploadThing callback.** Persist the payment + `payment_proof / submitted` settlement in `onUploadComplete` using `fileKey` as the idempotency key. Stop treating a separate client `createPayment` call as the source of truth.
6. **Close remaining Phase 2 constraints after a clean preflight:**
   - Partial unique `(festival_id, owner_user_id) WHERE source = 'user_reservation' AND status <> 'rejected'`
   - Unique active festival index `UNIQUE WHERE status = 'active'`

Keep the §1 festival-participation lock in every Phase 3 policy and confirmation test: a reservation in any status, including `rejected`, blocks later self-service and partner adds. The unique owner index still excludes `rejected` because rejected rows remain and must not collide with a later admin-assigned reservation.

### 0.3 Carry-overs (not product divergences)

| Topic | Plan | As-built | Action |
| --- | --- | --- | --- |
| Module layout | Thin `"use server"` actions + server-only services named in §4.1 | Policy/errors/schemas/hold-service exist. Authorization lives in `policy.ts` + `tx-eligibility.ts`. Confirmation lives in `hold-service.ts`. Payments live in `app/data/invoices/actions.ts`. Admin create lives in `admin-actions.ts`. | Finish the split in Phase 3; do not treat missing filenames as missing behavior. |
| `/api/payments` | Remove after the Server Action is canonical | Route still exists; it now authenticates and delegates to `createPayment`. UI already uses the Server Action. | Remove in Phase 6 after Phase 3 settlement rewrite. |
| Settlement table | Kind, status, reviewer, evidence snapshot, one submitted row per invoice | Table stores invoice/payment/file/uploader/idempotency only. Zero-value review uses `confirmFreeInvoice` and sets invoice + reservation to `verification_payment` without a settlement row. | Phase 3 schema follow-up. |
| Events table | `metadata`, `idempotency_key`, settlement event types | `payload` jsonb, no event idempotency key. Event types are `created`, `confirmed`, `rejected`, `status_changed`, `payment_submitted`, `deadline_extended`. | Additive columns in Phase 3. |
| Notification outbox | Enqueue + worker | Table and status enum exist. No enqueue helper, no cron, emails still send after commit. | Phase 3. |
| Single active festival | Partial unique index | Audited by `scripts/audit-reservation-invariants.ts` only | Add the index after preflight is clean. |
| One live self-service reservation per owner | Partial unique on `(festival_id, owner_user_id)` | Enforced in hold/confirm queries, not by a unique index | Add the index after backfill/preflight. |
| `festival_admin` | View only | `canMutateAdminReservations` is `admin` only. Festival admins can still view dashboard reservation data. | Keep this locked rule in Phase 3 commands. |

### 0.4 As-built file map

Planned files that exist:

```text
app/lib/reservations/schemas.ts
app/lib/reservations/policy.ts
app/lib/reservations/queries.ts
app/lib/reservations/dto.ts
app/lib/reservations/errors.ts
app/lib/reservations/hold-service.ts
app/lib/reservations/participant-actions.ts
app/api/cron/morning/standHoldExpiration/route.ts
scripts/audit-reservation-invariants.ts
scripts/backfill-reservation-hardening.ts
```

Planned files not created (behavior lives elsewhere or is still pending):

| Planned | Current home / status |
| --- | --- |
| `authorization.ts` | `policy.ts` (`canMutateAdminReservations`, invoice/collaborator helpers) |
| `reservation-service.ts` | `hold-service.ts` (`confirmStandHold`) |
| `admin-service.ts` | `admin-actions.ts` (still `"use server"`) |
| `payment-service.ts` / `payment-actions.ts` | `app/data/invoices/actions.ts` |
| `notification-outbox.ts` | Table only |
| `health.ts` | `scripts/audit-reservation-invariants.ts` |
| `app/api/cron/morning/reservationNotifications/route.ts` | Not started. Existing `reservationReminders` cron is a separate reminder job. |

Extra modules added during Phases 0–2 and worth keeping:

```text
app/lib/reservations/entry.ts              page-level self-service denial
app/lib/reservations/tx-eligibility.ts     in-transaction eligibility
app/lib/reservations/money.ts              numeric(12,2) rounding
app/lib/reservations/events.ts             stand_reservation_events dual-write
app/lib/reservations/partner-search.ts     partner DTO search
app/lib/reservations/reveal.ts             revealAt privacy for hidden admin reservations
app/lib/stands/effective-status.ts         availability without trusting stale stand.status
app/components/pages/profiles/festivals/reservation-not-allowed.tsx
```

Schema landed in `drizzle/0245_cold_mysterio.sql` (additive columns/tables/money) and `drizzle/0246_magenta_rocket_raccoon.sql` (unique hold and live-stand indexes). Apply 0246 only after `scripts/backfill-reservation-hardening.ts` on databases that already have reservation rows.

---

## 1. Locked product decisions

| Topic | Decision | Status |
| --- | --- | --- |
| Active participant | `users.status = verified`. `paused`, `banned`, `pending`, and `rejected` cannot reserve. | Implemented — `evaluateSelfServiceEligibility` |
| Festival enrollment | A current `user_requests` row with `type = festival_participation` and `status = accepted` is required. Terms acceptance alone is not enrollment. | Implemented |
| Self-service reservation count | A participant can belong to at most one non-rejected **self-service** reservation per festival, whether primary participant or partner. | Implemented in queries; DB unique on owner still missing |
| Festival participation lock | Any reservation in the current festival — `pending`, `verification_payment`, `accepted` (confirmed), or `rejected` — permanently blocks that person from later self-service and from being added as a partner. Rejecting a reservation releases the **stand**; it does not restore the **person**. | Implemented — `RESERVATION_REJECTED` / `PARTNER_ALREADY_RESERVED`; locked 2026-08-30 |
| Admin-created reservations | Admins can create additional reservations for the same participant. Participant pages must continue supporting lists, not singular assumptions. | Implemented — `source = admin_assignment` |
| Stand occupancy | A stand can have at most one non-rejected reservation, regardless of source. | Implemented — `stand_reservations_live_stand_unique` |
| Payment authority | The invoice owner pays. Partners can view the invoice but cannot submit or replace its payment proof. | Implemented — `canSubmitInvoiceSettlement` / `canViewInvoiceRecord` |
| Participant self-service window | Festival must be `active` and `reservationsStartDate <= now`. Moving the festival away from `active` closes self-service immediately. | Implemented |
| Admin assignment window | Separate from participant self-service. Admin assignment can prepare reservations before opening, with explicit source/audit metadata. | Implemented — `createAdminReservation` + `revealAt` |
| Hold duration | Configurable per festival, default **5 minutes**. The server-provided `expiresAt` is canonical. | Implemented — `festivals.reservation_hold_minutes` |
| Flow steps | Three: **Elegí tu espacio**, **Confirmá tu reserva**, then **Completá el pago** or **Solicitá revisión** for a zero-value invoice. | Partial — confirmation/payment exist; PRD still describes four steps / 3 minutes |
| Rejected reservation | Releases the stand so another participant can take it. The rejected person cannot make a new self-service reservation or be added as a partner in that festival. | Implemented — locked 2026-08-30; matches shipped policy |
| Terms unavailable | Self-service is unavailable. The map must show a clear blocked state instead of allowing selection and failing later. | Implemented — `ReservationNotAllowed` |
| Zero-value invoice | Owner submits it for admin review. Admin verifies the participant's entitlement before the invoice is marked paid and the reservation accepted. | Partial — `confirmFreeInvoice` submits for review; no unified settlement approval command |
| Revalidation | Eligibility, terms, sanctions, enrollment, occupancy, and price are checked again inside the confirmation transaction. | Implemented — `denySelfServiceMutation` in `confirmStandHold` |

### 1.1 Product confirmations — locked 2026-08-29

| Topic | Confirmed decision | Status |
| --- | --- | --- |
| `festival_admin` powers | View reservation and payment status only. No assignment, confirmation, rejection, deletion, discount administration, or payment review. | Implemented in reservation/discount mutation guards |
| Zero-value invoice | Requires admin review before confirmation. The review verifies the participant's right to the discount/free entitlement. | Partial — participant submit exists; admin still uses generic invoice updates |
| Hold duration | Configurable per festival; default 5 minutes. | Implemented |

### 1.2 Product confirmation — locked 2026-08-30

| Topic | Confirmed decision | Status |
| --- | --- | --- |
| Festival participation lock | A participant with a reservation in **any** status in the current festival (`pending`, `verification_payment`, `accepted` / confirmed, `rejected`) can no longer participate through self-service. They cannot create a new reservation and cannot be added as a stand partner by another participant. Cancellation/rejection frees the stand only. | Implemented |

These decisions are implementation requirements, not rollout options. Admin assignment remains a separate audited path (see the admin-created reservations row in §1). This confirmation applies to participant self-service and to one participant adding another as partner.

---

## 2. Success criteria

The feature is complete only when all of these hold:

1. No reservation, hold, payment, invoice, discount, or collaborator mutation trusts page access as authorization. — **Partial** (generic admin mutators remain)
2. Every mutation authenticates the actor, validates runtime input, loads canonical records, and authorizes the exact resource. — **Partial**
3. Self-service confirmation succeeds only for verified, enrolled, eligible participants during the active/open festival. — **Implemented**
4. UI category/subcategory/participation-type restrictions are identical to server restrictions. — **Implemented** (`standMatchesParticipant`)
5. One stand cannot have two live reservations; one participant cannot join two live self-service reservations in one festival; a rejected (or otherwise existing) reservation in that festival also blocks later self-service and partner adds. — **Partial** (stand unique exists; owner unique does not; participation lock is implemented in policy)
6. Retrying a successful request returns the same result and never duplicates reservations, invoices, payments, tasks, or email jobs. — **Partial** (hold/confirm/payment idempotency keys exist; emails are not outbox-deduped)
7. Provider failures after commit never turn a successful reservation/payment into a reported failure. — **Partial** (emails are try/caught after commit; still synchronous)
8. Expired holds cannot block a stand even when cron and polling are delayed. — **Partial** (effective status + in-transaction cleanup; cron exists)
9. Browser payloads contain only fields rendered by that screen; no email, phone, Clerk ID, birthdate, or unrelated profile data crosses the RSC/Server Action boundary. — **Partial** (`dto.ts` / `queries.ts` for some reads)
10. Every settlement submission is a canonical server-verified chain across owner, invoice, reservation, stand, festival, discount/entitlement, and uploaded file when present. — **Partial**
11. The map is usable with keyboard and screen reader, and has a non-map list alternative. — **Not started**
12. All new or changed visible Spanish uses voseo. — **Partial** (`errors.ts` + `copy.test.ts`)

### 2.1 Audit baseline

The implementation should preserve this baseline so improvements and regressions are measurable:

- Warm local reservation map responses measured approximately **4.7–5.1 seconds** against the configured database. This is not a production benchmark, but it confirms a material server/query waterfall.
- Warm stand-status polling responses measured **33–43 ms** locally. Per-request latency is acceptable; aggregate four-second polling load and overlapping/out-of-order requests are the risks.
- Read-only invariant audit found **three stands with multiple non-rejected reservations**. No live duplicate holds, expired holds, or stand-status mismatches were present at that moment.
- An archived festival rendered the complete reservation map in live browser inspection.
- Focused reservation tests passed **13/13**, but they did not cover authorization, payment ownership, database concurrency, archived festivals, or E2E behavior.
- Full unit run reported **1,030 passed, 37 skipped, 3 failed**. The three failures were unrelated terms tests that failed during import because required environment secrets were absent; they were not reservation assertion failures. Pure policy tests introduced here must not import runtime secret validation.

**Baseline follow-up (2026-08-30):** Phase 0–2 added authorization, payment-ownership, and policy tests. They still do not cover database concurrency (`Promise.all` races), archived-festival E2E, or Playwright. Re-run `scripts/audit-reservation-invariants.ts` against each environment before adding the remaining unique indexes. Treat the map-latency numbers above as the last recorded baseline until Phase 4 measures again.

---

## 3. Threat and failure model

Design every boundary for these conditions:

- Caller invokes a Server Action directly without rendering its page.
- Caller sends valid IDs belonging to different invoices, reservations, stands, festivals, or users.
- Unauthenticated caller posts directly to an API route.
- Participant opens two tabs and confirms different stands concurrently.
- Two participants select the same stand concurrently.
- The same confirmation/payment request is retried after a timeout.
- Admin changes stand price, status, category, terms, or participant status while a hold exists.
- Hold expires while confirmation is in flight.
- Email, PostHog, UploadThing cleanup, or cache revalidation fails after the database commits.
- Serverless instances run cleanup simultaneously or do not run cleanup at all.
- Poll requests overlap, finish out of order, or stop because the client is offline.
- Existing inconsistent rows are present during migration.

Page layouts, hidden buttons, random Server Action identifiers, client validation, and TypeScript types are never security boundaries.

**Status:** Phase 0–2 closed the unauthenticated/unrelated-caller cases for the exposed payment, reservation, discount, and collaborator actions. Phase 3 must close races, retries, and post-commit provider failures.

---

## 4. Target architecture

### 4.1 Module boundaries

Replace broad `"use server"` data modules with thin public actions and server-only services:

```text
app/lib/reservations/
  schemas.ts                    runtime input schemas
  policy.ts                     pure policy decisions + typed denial reasons
  authorization.ts              actor/resource authorization
  queries.ts                    server-only canonical reads
  dto.ts                        explicit browser-safe response shapes
  hold-service.ts               transactional hold lifecycle
  reservation-service.ts        self-service confirmation
  admin-service.ts              admin-only assignment/transitions
  payment-service.ts            owner payment submission/admin review
  notification-outbox.ts        durable post-commit notifications
  participant-actions.ts        thin "use server" participant entry points
  admin-actions.ts              thin "use server" admin entry points
  payment-actions.ts            thin "use server" payment entry points
  errors.ts                     stable error codes and voseo messages
```

Rules:

- Internal service/query files import `server-only`; they are not Server Actions.
- Every exported Server Action parses `unknown` input with Zod and authenticates independently.
- Services accept a resolved actor and canonical IDs, not caller-provided domain objects.
- A Server Action never calls another Server Action. Both call the same server-only service.
- Do not accept `standId` when it can be derived from `reservationId`; do not accept `festivalId` when it can be derived from the reservation/invoice.
- Mutation responses return `{ success, code, message, data? }`; clients branch on `code`, never parse Spanish messages.

**Status:** Partial. `schemas.ts`, `policy.ts`, `queries.ts`, `dto.ts`, `hold-service.ts`, `participant-actions.ts`, and `errors.ts` exist. `hold-service.ts` already imports `server-only`. `admin-actions.ts` is still a `"use server"` module that contains the service. Payments and confirmation have not been extracted into the planned service files.

### 4.2 Actor and role matrix

| Capability | Owner participant | Partner | `festival_admin` | `admin` |
| --- | ---: | ---: | ---: | ---: |
| View eligible reservation map | Yes | Yes | Yes | Yes |
| Create/replace own hold | Yes | No, unless creating own reservation | No behalf-of mutation | Yes via admin flow |
| Confirm own hold | Yes | No | No | Yes via admin flow |
| View reservation invoice | Yes | Yes | Yes | Yes |
| Submit/replace payment proof | Invoice owner only | No | No | Yes only through explicit admin action |
| Apply discount | Invoice owner with valid code | No | No | Yes |
| Assign extra reservation | No | No | No | Yes |
| Confirm/reject/delete reservation | No | No | View only | Yes |
| Create/update discount codes | No | No | No | Yes |
| Add/remove collaborator | Reservation participant if product keeps this feature | Same | View only | Yes |

`festival_admin` must not inherit global mutation access merely because the dashboard layout admits the role. Any future expansion requires a new product decision plus a festival-admin assignment table that scopes every query by assigned festival.

**Status:** Implemented for the current action surface via `canMutateAdminReservations`, `canViewAdminReservationData`, `canSubmitInvoiceSettlement`, `canViewInvoiceRecord`, and `canMutateReservationCollaborators`. Phase 3 commands must keep using these helpers rather than role string checks scattered in UI.

### 4.3 Canonical policy result

Create one policy vocabulary shared by page loaders and mutations:

```text
UNAUTHENTICATED
UNAUTHORIZED
PROFILE_NOT_VERIFIED
FESTIVAL_NOT_ACTIVE
RESERVATIONS_NOT_OPEN
NOT_ENROLLED
TERMS_UNAVAILABLE
TERMS_STALE
SANCTION_BLOCKED
STAND_NOT_FOUND
STAND_WRONG_FESTIVAL
STAND_NOT_ELIGIBLE
STAND_UNAVAILABLE
HOLD_EXPIRED
HOLD_NOT_OWNED
PARTNER_NOT_ELIGIBLE
PARTNER_ALREADY_RESERVED
ALREADY_RESERVED
CONFLICT_RETRY
INVOICE_NOT_OWNED
INVOICE_NOT_PENDING
PAYMENT_ALREADY_SUBMITTED
```

`policy.ts` maps codes to participant-facing voseo copy. Admin copy may use neutral imperative wording but must not switch to `tú` or `usted` when addressing the user.

**Status:** Implemented. All planned codes exist in `app/lib/reservations/errors.ts`. Extra codes: `RESERVATION_REJECTED`, `VALIDATION`. Page loaders use `getSelfServicePageDenial` in `entry.ts`. Messages live in `RESERVATION_ERROR_MESSAGES` (no separate `copy.ts`).

### 4.4 Global lock ordering

All reservation and eligibility-changing services use the same order to prevent deadlocks and time-of-check/time-of-use policy races:

1. Resolve candidate IDs with non-authoritative reads.
2. Acquire transaction advisory locks for participant `(festivalId, userId)` keys in ascending user-ID order.
3. Lock festival rows in ascending festival ID order.
4. Lock the global terms document/current published version before reading acceptance. Terms publication takes the conflicting lock.
5. Lock participant `users` and `user_requests` rows in ascending user ID order.
6. Lock stands in ascending stand ID order.
7. Lock holds/reservations, then invoices/payments, in ascending primary-key order.
8. Re-read and validate every value after locks are acquired.

Festival status transitions, participant status changes, enrollment/terms mutations, sanction changes, terms publication, and stand eligibility/price edits must take their corresponding lock or participant advisory key. Otherwise confirmation could still commit against eligibility that changed concurrently.

**Status:** Not started. Hold cleanup sorts stand IDs before `FOR UPDATE`. There is no `pg_advisory_xact_lock` in the reservation domain. This is the first Phase 3 engineering task after the command split.

---

## 5. Canonical self-service eligibility

### 5.1 Page entry

The map loader calls the same read-only evaluator used by mutations. It returns either an allowed context or a typed denial:

1. Authenticated actor exists.
2. Actor owns `profileId`; self-service does not allow acting on behalf.
3. Target profile exists and `status = verified`.
4. Festival exists and `status = active`.
5. `now >= reservationsStartDate`.
6. Festival participant terms are enabled and a published version exists.
7. Accepted `festival_participation` enrollment exists with current `termsVersionId`.
8. No active ban or reservation-delay sanction blocks the participant.
9. The participant has no reservation in this festival in any status, including `rejected`. A live self-service reservation returns `ALREADY_RESERVED`; a rejected reservation returns `RESERVATION_REJECTED`.

Render a specific blocked state for each expected denial. Do not load maps, stands, partners, or reservation PII after a denial.

**Status:** Implemented. `getSelfServicePageDenial` + `ReservationNotAllowed` on sector, map, and hold-confirmation pages. Archived, unopened, and terms-unavailable festivals no longer render the map.

### 5.2 Hold creation transaction

`createOrReplaceStandHold({ standId, idempotencyKey })`:

1. Authenticate owner and parse positive integer/UUID input.
2. Begin transaction.
3. Acquire a transaction-scoped advisory lock for `(festivalId, userId)` after resolving the stand festival. Use deterministic numeric keys.
4. Lock target stand `FOR UPDATE`.
5. Delete/reconcile expired holds for both target stand and `(user, festival)`.
6. Re-run all canonical participant/festival eligibility checks in the transaction.
7. Validate stand belongs to festival and is `available` after reconciliation.
8. Validate stand category, participation type, and subcategory rules with the same pure helper the UI uses.
9. Reject if the participant already belongs to any reservation in this festival, including a rejected one.
10. If an unexpired hold exists on the same stand, return it idempotently.
11. If an unexpired hold exists on another stand, verify the new stand first, then release the old hold while locking old and new stands in ascending ID order.
12. Insert hold with canonical price snapshot and expiration.
13. Update stand status to `held` only after the hold insert succeeds.
14. Insert an audit event or structured operation log without PII.
15. Commit, then revalidate through a guarded post-commit helper.

The old hold must never be lost because the newly requested stand became unavailable.

**Status:** Partial. `hold-service.ts` implements create/replace, expired-hold reconciliation, eligibility, category match, price snapshot, idempotency replay, and guarded `revalidatePath`. Advisory locks and a hold-created audit event are still missing.

### 5.3 Confirmation transaction

`confirmStandHold({ holdId, partnerId?, idempotencyKey })`:

1. Authenticate owner; never accept `userId` from the client.
2. Begin transaction.
3. Resolve hold membership, acquire the global locks from §4.4, then re-fetch and lock hold and stand.
4. If the idempotency key already completed, return the existing reservation.
5. Validate hold owner, non-expiration, stand/festival relation, and stand status `held`.
6. Resolve primary participant plus optional partner.
7. Acquire `(festivalId, userId)` advisory locks for every participant in ascending user-ID order.
8. Re-run festival active/open, verified status, accepted enrollment/current terms, sanctions, stand eligibility, and festival-participation-lock checks for every participant (owner and partner) while the eligibility rows are locked. A reservation in any status, including `rejected`, denies the participant.
9. Re-read stand category/participation/subcategories and compare with the primary participant.
10. Use the hold's price snapshot, not current stand price.
11. Insert reservation with `source = user_reservation`, canonical owner, price snapshot, and idempotency key.
12. Insert participants, invoice, and scheduled payment task.
13. Update stand to `reserved` with a guarded `WHERE status = held`; require one returned row.
14. Delete hold.
15. Enqueue notification jobs in the same transaction.
16. Commit and immediately return success.
17. Trigger best-effort outbox processing with `after()`. Provider failure cannot change the returned mutation result.

**Status:** Partial. Confirmation, eligibility re-check, price snapshot, owner, source, and idempotency replay are implemented in `hold-service.ts`. Email still sends after commit (caught). No advisory locks, no outbox enqueue, no `after()`.

### 5.4 Partner rules

Partner search is advisory; confirmation is authoritative. A selectable partner must:

- Be `verified`.
- Have accepted enrollment/current terms for the same festival.
- Pass sanctions/reservation-delay checks.
- Match the sharing categories permitted by product.
- Not belong to any reservation in that festival, including a rejected one.
- Not equal the primary participant.

A rejected reservation still counts against the person. Partner search must return them as not selectable (`PARTNER_ALREADY_RESERVED`) rather than hiding them or treating them as available. Admin-assigned additional reservations remain a separate admin path and do not restore self-service or partner eligibility for someone who already has a festival reservation.

**Status:** Implemented for the participation lock. `partner-search.ts` returns `PartnerSearchResultDto` with `selectable` + `denialCode` and treats a rejected partner reservation as already reserved. Rate-limited in `participant-actions.ts`. Trigram index and client sequencing remain later work.

---

## 6. Data model and invariants

Use additive migrations first. Run data repair before validating constraints.

### 6.1 `festivals`

Add:

| Column | Type | Default | Purpose | Status |
| --- | --- | --- | --- | --- |
| `reservation_hold_minutes` | integer | `5` | Configurable hold duration; check `1..30`. | Implemented |

Add a partial unique index allowing at most one active festival:

```text
UNIQUE WHERE status = 'active'
```

Activation must surface a conflict explaining which festival is already active. `fetchActiveFestivalBase` must use a query that assumes and asserts uniqueness, not unordered `findFirst` behavior.

**Status:** Column and check constraint implemented. Unique active-festival index **not started**. Multiple active festivals are reported by the preflight script.

### 6.2 `stand_holds`

Add:

| Column | Type | Purpose | Status |
| --- | --- | --- | --- |
| `price_amount_snapshot` | `numeric(12,2)` | Price shown and invoiced if confirmed. | Implemented |
| `idempotency_key` | text | Unique request identity. | Implemented |

Indexes/constraints:

- Unique `stand_id`. — Implemented (`stand_holds_stand_idx`)
- Unique `(user_id, festival_id)`. — Implemented (`stand_holds_user_festival_idx`)
- Index `expires_at` for sweeps. — Not started as a dedicated index (cleanup currently filters `expires_at`)
- Check `expires_at > created_at`. — Not started

Expired rows are deleted before a conflicting insert. The cron is reconciliation, not correctness.

### 6.3 `stand_reservations`

Add/change:

| Column | Type | Purpose | Status |
| --- | --- | --- | --- |
| `owner_user_id` | FK users, initially nullable | Canonical reservation/invoice owner. | Implemented (still nullable) |
| `price_amount_snapshot` | `numeric(12,2)` | Immutable booked price. | Implemented |
| `idempotency_key` | text, nullable unique | Deduplicates confirmation retries. | Implemented (partial unique when not null) |
| `source` | add `legacy_unknown` enum value | Existing rows cannot be safely classified because admin creation used the self-service default. | Implemented (`user_reservation`, `admin_assignment`, `legacy_unknown`) |

Constraints/indexes:

- Partial unique index on `stand_id WHERE status <> 'rejected'`. — Implemented
- Partial unique index on `(festival_id, owner_user_id) WHERE source = 'user_reservation' AND status <> 'rejected'`. — **Not started**
- Index `(festival_id, status, stand_id)`. — Not started
- Composite FK or explicit transaction assertion that stand and reservation festival match. — Partial (application checks)

Do not add a blanket unique `(userId, festivalId)` across participants; existing product requirements intentionally allow admin-created additional reservations. The owner unique index still excludes `rejected` because rejected rows remain and admin assignment can add another live reservation. The festival participation lock — no later self-service or partner add after any reservation, including `rejected` — is enforced in policy and confirmation, not by that unique index. Self-service partner races are serialized with participant advisory locks and canonical membership queries.

### 6.4 Reservation events

Add immutable `stand_reservation_events`:

| Column | Type | Notes | Status |
| --- | --- | --- | --- |
| `id` | serial PK | | Implemented |
| `reservation_id` | FK | Cascade or retain according to delete policy below. | Implemented (cascade) |
| `event_type` | enum | Plan: `created`, `settlement_submitted`, `settlement_approved`, `settlement_rejected`, `accepted`, `rejected`, `deleted`, `deadline_extended`. | Partial — as-built: `created`, `confirmed`, `rejected`, `status_changed`, `payment_submitted`, `deadline_extended` |
| `from_status` | reservation status nullable | | Implemented |
| `to_status` | reservation status nullable | | Implemented |
| `actor_user_id` | FK nullable | Null only for system worker. | Implemented |
| `metadata` | jsonb | IDs/reason codes only; no email, phone, provider response, or full caller object. | Partial — column is `payload` |
| `idempotency_key` | text nullable unique | Deduplicates event-producing retries. | Not started |
| `created_at` | timestamp | | Implemented |

Prefer soft cancellation/rejection over hard deletion. If product still requires hard delete, restrict it to reservations with no payment history and record an audit event in a retained audit table before deletion.

**Status:** Table and `insertStandReservationEvent` helper exist. `deleteReservation` is still a hard-delete admin path.

### 6.5 Invoices and payments

Replace monetary `real` columns with `numeric(12,2)` using explicit rounded migration expressions:

- `stands.price`
- `invoices.original_amount`
- `invoices.discount_amount`
- `invoices.amount`
- `payments.amount`
- `discount_codes.discount_value` if currently floating point

**Status:** Implemented in 0245 via `round(...::numeric, 2)` and the shared `money()` helper.

All mutation inputs use a shared money schema limited to two decimals. Canonical invoice totals are calculated server-side; payment submission never accepts an amount from the browser.

Add a unified settlement-review lifecycle for both payment proofs and zero-value entitlement claims:

```text
settlement_submission_kind: payment_proof | zero_value_entitlement
settlement_submission_status: submitted | approved | rejected
```

Add to `payments`:

| Column | Type | Purpose | Status |
| --- | --- | --- | --- |
| `file_key` | text unique | Canonical UploadThing identity. | Partial — column exists, not unique |
| `uploaded_by_user_id` | FK users | Must equal invoice owner for participant flow. | Implemented |
| `idempotency_key` | text unique | Upload/callback deduplication. | Implemented (partial unique when not null) |

Add immutable `invoice_settlement_submissions`:

| Column | Type | Purpose | Status |
| --- | --- | --- | --- |
| `id` | serial PK | | Implemented |
| `invoice_id` | FK invoices | Canonical invoice being reviewed. | Implemented |
| `payment_id` | FK payments nullable | Required only for `payment_proof`. | Implemented |
| `kind` | settlement kind | Proof or zero-value entitlement. | Not started |
| `status` | settlement status | Admin review state. | Not started |
| `submitted_by_user_id` | FK users | Must equal invoice owner for self-service. | Partial — `uploaded_by_user_id` |
| `reviewed_by_user_id` | FK users nullable | Admin reviewer. | Not started |
| `reviewed_at` | timestamp nullable | | Not started |
| `rejection_reason` | text nullable | Sanitized admin reason. | Not started |
| `evidence_snapshot` | jsonb | Canonical IDs/amounts/scope at submission; no copied PII. | Not started |
| `idempotency_key` | text unique | Deduplicates participant submission/retry. | Implemented (partial unique when not null) |
| timestamps | timestamps | | Partial — `created_at` only |

Constraints:

- `payment_proof` requires `payment_id`; `zero_value_entitlement` requires it to be null.
- At most one `submitted` settlement per invoice.
- A zero-value submission requires canonical `invoice.amount = 0` inside the locked transaction.
- Approval/rejection updates the submission and aggregate in one transaction.

Add `invoices.due_at` as the canonical payment deadline. Reservation creation sets it to the same timestamp as the scheduled task; extending a deadline updates both in one transaction. Participant pages and emails stop deriving deadlines from `createdAt + 5 days`.

**Status:** `due_at` column exists and is written on create/extend. Settlement kind/status lifecycle is **Phase 3**. `confirmFreeInvoice` currently sets both invoice and reservation to `verification_payment` without a settlement row.

State meaning:

| Event | Settlement submission | Invoice | Reservation | Stand |
| --- | --- | --- | --- | --- |
| Reservation created | none | `pending` | `pending` | `reserved` |
| Voucher submitted | `payment_proof / submitted` | `pending` | `verification_payment` | `reserved` |
| Zero-value entitlement submitted | `zero_value_entitlement / submitted` | `pending` | `verification_payment` | `reserved` |
| Admin approves either submission | `approved` | `paid` | `accepted` | `confirmed` |
| Admin rejects either submission | `rejected` | `pending` | `pending` | `reserved` |
| Reservation rejected/cancelled | retained audit history | `cancelled` | `rejected` | `available` |

Uploading a voucher or submitting a zero-value invoice must not mark an invoice paid. Only the admin review command can approve the settlement and confirm the reservation.

For a zero-value review, `evidence_snapshot` references the applied discount code or free-price basis, owner, festival, original amount, discount amount, final amount, and submission timestamp. Admin UI loads current canonical records alongside that snapshot.

Rejecting a zero-value claim requires an explicit corrective outcome in the same transaction:

- Remove/reverse an ineligible discount and decrement its use exactly once, restoring the canonical amount; or
- Apply an admin-approved corrected amount; or
- Cancel/reject a reservation that has no valid price/entitlement basis.

The system must not return a rejected zero-value invoice to `pending` while leaving it unchanged at zero with no valid next action.

### 6.6 Notification outbox

Add `reservation_notification_jobs`, following the existing disciplinary/storage job patterns:

- `status`: pending/processing/completed/failed.
- Deduplication key unique.
- Payload references canonical entity IDs; avoid copying PII where a worker can resolve it.
- Attempts, next attempt, lease owner/expiry, last sanitized error, completion timestamp.
- Enqueue inside the reservation/payment transaction.
- Immediate `after()` attempt plus authenticated cron retry.
- Provider idempotency key equals durable deduplication key.

Notifications include reservation created, proof submitted, zero-value review requested, settlement approved/rejected, reservation rejected, and deadline extended.

**Status:** Table exists with the planned operational columns. No enqueue module, no worker, no `after()`. Current code still calls `sendEmail` after commit in `hold-service.ts`, `createPayment`, `confirmFreeInvoice`, and `rejectReservation`.

---

## 7. Data repair and migration

The inspected database already contains stands with multiple non-rejected reservations. Do not create constraints until operations resolves those rows.

### 7.1 Preflight report

Create a read-only script that exits non-zero and reports IDs/counts for:

- Multiple active festivals.
- Multiple hold rows per stand.
- Multiple hold rows per user/festival.
- Expired holds whose stand remains `held`.
- Stands with multiple non-rejected reservations.
- Reservation/stand festival mismatch.
- Stand status inconsistent with its effective reservation/hold state.
- Invoices whose owner is not a reservation participant.
- Payments attached to unrelated or missing invoices.
- `verification_payment` reservations without a submitted settlement.
- Submitted proof settlements without a payment/file, or submitted zero-value settlements whose invoice is not zero.
- Multiple submitted settlements for one invoice.
- Accepted reservations whose invoice is not paid.
- Admin-created rows still labeled `user_reservation` where provenance cannot be proven.

Never print participant PII; IDs and state are sufficient.

**Status:** Implemented as `scripts/audit-reservation-invariants.ts`. Re-run in every environment before adding the remaining unique indexes. Extend the script in Phase 3 when settlement kind/status columns exist.

### 7.2 Repair rules

- **Duplicate active stand reservations:** manual decision required. Prefer the accepted/paid reservation; never automatically reject a paid participant.
- **Duplicate holds:** keep the newest unexpired hold after locking the related stands; delete expired/losing rows and recompute stand statuses.
- **Legacy source:** set existing reservations to `legacy_unknown` unless a durable audit record proves origin.
- **Owner backfill:** use invoice owner when exactly one exists; otherwise use the oldest reservation participant and flag ambiguity for manual review.
- **Price snapshot:** use invoice original amount; fall back to current stand price only when invoice is missing, and report that fallback.
- **Settlement state:** accepted + paid with a payment row -> approved proof settlement; accepted + paid zero invoice without payment -> approved zero-value settlement. For `verification_payment`, a payment row becomes submitted proof settlement and a zero invoice without payment becomes submitted zero-value settlement. Non-zero rows without payment and other ambiguous combinations go to manual review.
- **Festival mismatch:** manual repair; do not infer based only on URL/history.

**Status:** Partial. `scripts/backfill-reservation-hardening.ts` backfills owner, price snapshots, hold snapshots, `due_at`, and `legacy_unknown`. Settlement-state backfill waits for kind/status columns.

### 7.3 Migration sequence

1. Add enum values, nullable columns, new tables, and non-unique indexes. — **Done (0245)**
2. Deploy code that dual-writes source, owner, snapshots, idempotency, events, and payment fields. — **Done**
3. Run preflight in dev/test/production read-only. — **Script ready; run per environment**
4. Resolve ambiguous production rows in an approved maintenance window. — **Operations**
5. Backfill deterministic rows in bounded, restartable batches. — **Script ready**
6. Re-run preflight until clean. — **Operations**
7. Create unique/partial indexes concurrently where supported. — **Partial (0246 hold + live stand; owner + active festival still open)**
8. Mark required columns non-null after validation. — **Not started**
9. Stop dual-read compatibility and remove obsolete paths in a later deploy. — **Phase 6**

Every repair script supports `--dry-run`, bounded batch size, structured counts, and safe restart. Production writes require an explicit target check and operator confirmation.

---

## 8. Payment and upload security

### 8.1 Remove the unsafe mutation surface

- Remove `POST /api/payments`, or make it a private authenticated adapter to the same canonical service with no duplicated logic. Preferred: remove it and use one Server Action/callback workflow.
- Remove browser-controlled `amount`, `reservationId`, `standId`, `oldVoucherUrl`, and arbitrary payment `id`.
- `invoiceId` is the only client domain identifier. Server loads invoice -> reservation -> stand -> festival and verifies owner.
- Read functions return owner/participant-scoped DTOs. Admin reads require admin authorization.
- Success pages verify current actor can view the invoice; they never expose a voucher URL to an unrelated participant.

**Status:** Partial. `createPayment` authenticates, parses Zod input, and scopes by invoice ownership. `/api/payments` is hardened and still present. Generic `updateInvoiceStatus` / `adminAttachPaymentVoucher` remain.

### 8.2 UploadThing flow

The `reservationPayment` uploader accepts typed input `{ invoiceId }`:

1. Middleware authenticates current profile.
2. Loads invoice canonically.
3. Requires current profile equals `invoice.userId`.
4. Requires invoice pending, reservation pending or payment-verification, and no submitted settlement unless replacing an owned rejected proof.
5. Applies per-user/invoice upload rate limits and image type/size validation.
6. Returns canonical user/invoice metadata to UploadThing.
7. `onUploadComplete` inserts an immutable payment plus a `payment_proof / submitted` settlement using `fileKey` as idempotency key and server metadata—not client URL claims.
8. Replacement enqueues the old file in `storageCleanupJobs` within the same transaction.
9. Client refreshes state from the canonical invoice response.

Arbitrary signed-in profiles cannot consume reservation-proof storage without an invoice they own.

**Status:** Partial. Middleware validates auth and invoice ownership. Persistence still happens in a later `createPayment` call. `onUploadComplete` is not authoritative.

### 8.3 Zero-value entitlement review

`submitZeroValueInvoiceForReview({ invoiceId, idempotencyKey })`:

1. Authenticates the invoice owner.
2. Locks invoice, reservation, stand, owner, applied discount, and any existing settlement.
3. Requires invoice pending, amount exactly zero in canonical numeric storage, and no submitted settlement.
4. Revalidates that the invoice/discount relationship has not been tampered with; this is an integrity check, not the final entitlement approval.
5. Inserts `zero_value_entitlement / submitted` with canonical evidence snapshot.
6. Moves reservation to `verification_payment`; invoice remains pending and stand remains reserved.
7. Writes event and notification jobs in the same transaction.
8. Returns review-pending state. It never confirms the reservation.

Participant UI:

- Title: `Solicitá la revisión de tu reserva`.
- Explanation: `No tenés que realizar un pago. Un administrador va a revisar que el beneficio corresponda antes de confirmar tu reserva.`
- CTA: `Solicitá revisión`.
- Submitted state: `Tu reserva está en revisión.`

Admin review shows owner, festival, stand, original amount, discount/free basis, applied code and scope when present, final amount, submission time, and prior events. Approval re-runs canonical scope/integrity checks and then atomically approves settlement, pays invoice, accepts reservation, and confirms stand. Rejection requires the corrective outcome defined in §6.5.

**Status:** Partial. `confirmFreeInvoice` is the current owner submit path. It moves reservation and invoice to `verification_payment`, returns `Tu reserva está en revisión.`, and does not mark the invoice paid. It does not write a settlement row or evidence snapshot. Admin approval/rejection commands are not implemented.

### 8.4 Discount codes

- Create/update/list/detail actions require `admin`.
- Apply action requires invoice owner or explicit admin action.
- Rate-limit attempts with the existing database-backed `consumeActionRateLimit` pattern, keyed by user.
- Normalize code once, cap input length, and use constant-shaped failure responses for invalid/inactive/expired/exhausted codes.
- Lock both invoice and code rows.
- Verify invoice festival and user scope canonically.
- Increment usage and update invoice in one transaction.
- Retrying the same code on the same invoice returns current applied result without incrementing usage again.

**Status:** Partial. Admin CRUD is gated by `canMutateAdminReservations`. Apply/rate-limit/lock/idempotent-retry hardening is Phase 3.

---

## 9. Admin reservation lifecycle

Replace caller-driven status mutations with explicit commands:

```text
createAdminReservation({ festivalId, standId, ownerUserId, partnerId?, revealAt? })
approveInvoiceSettlement({ submissionId })
rejectInvoiceSettlement({ submissionId, reason, correction })
rejectReservation({ reservationId, reason })
cancelReservation({ reservationId, reason })
extendReservationDeadline({ reservationId, dueAt })
```

Each command:

- Requires `admin`; `festival_admin` is view-only.
- Parses runtime input.
- Loads and locks the canonical reservation, stand, invoice/payment, participants, and task.
- Verifies every supplied child ID belongs to the loaded aggregate.
- Performs a legal state transition only.
- Uses guarded updates with expected prior status and requires returned rows.
- Writes `stand_reservation_events`.
- Enqueues canonical notification jobs.
- Never accepts a full reservation/user/festival object from the browser.

Admin assignment additionally:

- Rejects `held`, `reserved`, `confirmed`, and `disabled` stands unless a separate audited override flow is explicitly designed.
- Sets `source = admin_assignment`.
- Sets owner and price snapshot.
- Locks stand and participant IDs deterministically.
- Allows additional admin-assigned reservations per participant, but never a second live reservation on the same stand.
- Makes pre-opening visibility explicit through `revealAt` without falsifying stand availability to the transaction layer.

Delete collaborator by the `(reservationId, collaboratorId)` join. Do not delete a global collaborator row unless it is orphaned and the actor owns every affected association.

**Status:** Partial.

| Command | Status |
| --- | --- |
| `createAdminReservation` | Implemented in `admin-actions.ts` |
| `extendReservationDeadline` | Implemented as `extendReservationPaymentDeadline` |
| `rejectReservation` | Implemented in `app/api/reservations/actions.ts` (canonical IDs only) |
| `approveInvoiceSettlement` | Not started |
| `rejectInvoiceSettlement` | Not started |
| `cancelReservation` | Not started (hard `deleteReservation` still exists) |

Legacy generic paths still exported: `updateReservation`, `deleteReservation`, `updateReservationStatus`, `updateReservationSimple`. Phase 3 must stop calling them from UI and then delete them.

---

## 10. Hold expiration and availability

### 10.1 Correctness path

Every availability read derives an **effective** state:

- An unexpired hold makes an otherwise available stand held.
- An expired/missing hold never makes a stand unavailable solely because `stands.status` is stale.
- A non-rejected reservation wins over hold state.

Every hold mutation reconciles expired conflicting rows inside its transaction. Therefore users can reserve immediately after expiry even if cron has not run.

**Status:** Partial. `effective-status.ts` and hold-service cleanup exist. Confirm with a concurrency test in Phase 3 (expired hold + stale `held` is immediately reservable).

### 10.2 Reconciliation worker

Add authenticated cron route using `isAuthorizedCronRequest`:

```text
app/api/cron/morning/standHoldExpiration/route.ts
```

Worker behavior:

- Claim bounded expired holds with `FOR UPDATE SKIP LOCKED`.
- Lock stands in ascending ID order.
- Delete only the claimed expired hold.
- Set stand available only when no live hold or non-rejected reservation exists.
- Return counts only; no entity IDs.
- Be safe under overlapping/double cron runs.

Remove cleanup side effects and in-memory throttle from `GET /api/stands/status`.

**Status:** Implemented early (Phase 0–2). Route exists and calls `cleanupExpiredHolds()`. Status endpoint no longer mutates. `SKIP LOCKED` claiming can still be tightened in Phase 4.

### 10.3 Status endpoint and polling

Endpoint:

- Requires authenticated verified participant, `festival_admin`, or `admin`.
- Verifies sector belongs to a festival the participant is enrolled in, unless admin.
- Returns minimal `{ standId, effectiveStatus, updatedAt/version }` plus current sector availability count.
- Uses `Cache-Control: private, no-store` unless a per-user-safe cache key is proven.
- Rate-limits by user; IP-hash fallback for unauthenticated denial telemetry only.

Client hook:

- One in-flight request at a time.
- `AbortController` on sector change/unmount.
- Monotonic response version prevents older responses overwriting newer state.
- Pause while hidden; immediate refresh when visible.
- Exponential backoff after failures; reset after success.
- Show a non-blocking stale-state indicator after a defined threshold.
- Update availability badges for all sectors through a lightweight summary query, not stale initial props.

Keep four-second polling initially. Instrument production load before considering SSE/WebSocket.

**Status:** Partial. `GET /api/stands/status` is read-only and authenticated. `use-stand-polling.ts` pauses when hidden and refreshes when visible. It does not abort, version, back off, or rate-limit. Phase 4.

---

## 11. Privacy and response DTOs

Never pass Drizzle rows directly to client components.

### 11.1 Map DTO

```text
FestivalReservationMapDto
  festival: id, name, holdMinutes
  profile: id, displayName, category, participationType, imageUrl
  sectors:
    id, name, order, map bounds/elements
    stands:
      id, label, number, effectiveStatus, position, dimensions,
      category, participationType, price, eligible subcategory ids,
      visibleParticipantSummaries: id, displayName, imageUrl, reservationStatus
  activeHold: id, standId, expiresAt
```

Explicitly exclude email, phone, Clerk ID, birthdate, address, private social/contact data, sanctions, user requests, invoices, payments, and unrelated reservations.

Hidden reservation identity remains filtered server-side: before `revealAt`, participants may receive an occupied/effective status but never participant IDs, names, images, or reservation details. Admin DTOs are separate and explicitly authorized.

**Status:** Partial. `dto.ts` and `queries.ts` expose public profile summaries. `reveal.ts` withholds hidden admin reservations. Many map/confirmation pages still serialize richer ORM shapes. Phase 4.

### 11.2 Partner DTO

```text
PartnerSearchResultDto
  id
  displayName
  imageUrl
  selectable
  denialCode?
```

Search action:

- Authenticates current participant.
- Derives `excludeUserId` from actor; never accepts it.
- Verifies actor is eligible for that festival.
- Requires trimmed query length `2..80`.
- Rate-limits per user.
- Returns at most five DTOs.
- Treats any existing festival reservation, including `rejected`, as not selectable.
- Uses a matching trigram expression index.

Recent partners use the same DTO and authorization. Do not serialize complete user rows through RSC props.

**Status:** Partial. DTO, auth, query-length, rate limit, max-five results, and the rejected-reservation participation lock are implemented. Trigram index is Phase 4.

---

## 12. Query and rendering performance

### 12.1 Server waterfall

After authentication/route ownership is resolved, parallelize independent reads where transaction consistency is not required:

- Festival + target profile.
- Published terms metadata + sanction eligibility inputs.
- Static map geometry + active hold summary.

Do not parallelize writes or checks that must observe the same locked transaction.

### 12.2 Split static and dynamic map data

- Static: sector geometry, map elements, stand positions/labels/dimensions/category restrictions. Cache by festival/sector version.
- Dynamic: effective stand status, visible reservation summary, active hold. Keep private and fresh.
- Query only stands eligible for the participant instead of loading all stands from every qualifying sector.
- Select exact columns; avoid nested `with: { user: true }`.
- Confirmation page fetches only its hold/stand thumbnail DTO and partner summaries.

### 12.3 Database indexes

Add/verify with `EXPLAIN (ANALYZE, BUFFERS)`:

- `stands(festival_id, stand_category, participation_type, festival_sector_id, status)`.
- `stand_subcategories(stand_id, subcategory_id)` unique.
- `stand_holds(expires_at)` plus uniqueness above.
- `stand_reservations(festival_id, status, stand_id)`.
- `user_requests(user_id, festival_id, type, status, terms_version_id)`.
- `invoices(reservation_id, user_id, status)`.
- `payments(invoice_id, status, created_at)`.
- GIN trigram expression matching `replace(lower(users.display_name), ' ', '')` exactly.

### 12.4 Initial budgets

Recommended production p75 budgets, measured with real map sizes:

- Reservation map server response: <= 1.5 s.
- Confirmation server response: <= 1.0 s.
- Stand status endpoint: <= 200 ms.
- Partner search: <= 300 ms.
- No reservation-page RSC payload may include unrendered PII.

Record baseline before optimization and p50/p75/p95 after every phase. Treat these as proposed budgets until production telemetry confirms realistic thresholds.

**Status:** Not started as a dedicated performance pass. Some supporting indexes landed with 0245/0246. Phase 4.

---

## 13. UX and accessibility

### 13.1 Route states

Provide dedicated screens for:

- Festival not active: `Las reservas no están disponibles para este festival.`
- Reservations not open: `Vas a poder reservar desde {fecha}.`
- Terms unavailable: `Los términos todavía no están disponibles. Volvé a intentar más tarde.`
- Terms stale: `Aceptá la versión actual de los términos para reservar.`
- Not enrolled: `No estás habilitado para participar en este festival.`
- Already reserved: show every current reservation and separate admin-assigned entries.
- Reservation rejected: `RESERVATION_REJECTED` blocked state. The person cannot start a new self-service reservation.
- No eligible sectors/stands: explain why and offer profile/admin contact path.
- Connectivity stale: keep map visible, disable confirmation until refreshed.

Do not show the full map for archived, published, draft, unopened, or terms-unavailable festivals.

**Status:** Partial. Typed blocked states render through `ReservationNotAllowed`. Already-reserved should list every current reservation, including admin-assigned extras. Connectivity-stale map behavior is Phase 5.

### 13.2 Recoverable confirmation errors

| Error | Behavior |
| --- | --- |
| Partner became unavailable/stale terms/sanctioned | Keep hold, clear partner, show inline error, refocus partner selector. |
| Transient network/server failure | Keep screen and hold countdown; allow retry with same idempotency key. |
| Stand/hold conflict or expiry | Explain loss, return to map, refresh statuses. |
| Confirmation already succeeded | Navigate to canonical invoice/reservation returned by idempotency lookup. |

Never redirect to the map for every `success: false` result.

**Status:** Partial. Clients receive structured `{ success, code, message }`. Full recoverable UX is Phase 5.

### 13.3 Hold recovery

- Opening the map with a live hold shows stand, expiry, and **Continuá con tu reserva**.
- Browser refresh/reopen reconstructs countdown from server `expiresAt`.
- Closing the tab does not require synchronous cancellation; expiry remains authoritative.
- Back/cancel waits for server response, but navigation failure does not create a second hold.
- Timer effect uses one interval per hold, not one interval recreation per second.

**Status:** Partial. Server `expiresAt` is canonical. Recovery CTA and timer-interval fix are Phase 5.

### 13.4 Partner search

- Debounce and attach a monotonically increasing request sequence.
- Ignore stale results.
- Catch failure and show voseo retry copy.
- Explain exact disabled reason from typed denial code.
- Confirmation revalidation remains authoritative.

**Status:** Partial. Denial codes exist. Client sequencing/debounce hardening is Phase 5.

### 13.5 Accessible map and stand details

- Implement stand details with the existing accessible Dialog/Drawer primitives: labelled title, description, focus trap, Escape close, focus return.
- Localize all state labels: `Disponible`, `En espera`, `Reservado`, `Confirmado`, `No disponible`.
- Use `aria-live="polite"` for hold/status updates and `role="alert"` only for blocking errors.
- Announce timer thresholds, not every second.
- Minimum 44x44 CSS-pixel interactive targets.
- Preserve visible focus at every zoom and mobile breakpoint.
- Tabs use `tablist`/`tab` semantics with arrow-key behavior.
- Add a list view grouped by sector with stand label, price, dimensions, status, and reserve action. This is the keyboard/screen-reader fallback and also helps users who find map navigation difficult.
- Do not encode availability by color alone; retain text/shape/legend distinctions.

**Status:** Not started. Phase 5.

### 13.6 Voseo standard

All new/changed display text uses these forms:

| Avoid | Use |
| --- | --- |
| Elige / Selecciona | Elegí / Seleccioná |
| Puedes | Podés |
| Tienes | Tenés |
| Haz | Hacé |
| Confirma | Confirmá |
| Vuelve | Volvé |
| Intenta | Intentá |
| Recarga | Recargá |
| Contacta | Contactá |
| Busca | Buscá |
| Cancela | Cancelá |

Create a reservation copy module rather than scattering mutation messages. Add a focused test scanning reservation UI/error-copy modules for known non-voseo imperatives. It is a guardrail, not a substitute for copy review.

**Status:** Partial. `RESERVATION_ERROR_MESSAGES` plus `app/lib/reservations/copy.test.ts`. Broader UI scan and remaining screen copy are Phase 5.

---

## 14. Error handling and idempotency

### 14.1 Mutation contract

```ts
type ReservationActionResult<T> =
  | { success: true; data: T; message: string }
  | { success: false; code: ReservationErrorCode; message: string };
```

- Expected policy conflicts return typed failures and are not logged as exceptions.
- Unexpected errors log operation name, request correlation ID, actor ID, and canonical entity IDs only.
- Never log complete request bodies, participant objects, voucher URLs, email-provider responses, or PII.
- Revalidation failures are caught/logged after success; they do not reverse the result.

**Status:** Implemented for hold, confirmation, payment, and several admin paths via `errors.ts`. Remaining generic admin mutators still return ad-hoc `{ success, message }` without `code`.

### 14.2 Idempotency

- Client creates one UUID per hold/confirmation/payment intent and retains it across retry.
- Database unique keys enforce one result.
- A duplicate confirmation key returns existing reservation/invoice IDs.
- UploadThing `fileKey` and callback idempotency prevent duplicate payment rows.
- Admin approve/reject commands use expected state plus event idempotency.
- Notification outbox deduplication prevents duplicate email.

**Status:** Partial. Hold, confirmation, and payment accept optional UUID keys and replay existing rows. UploadThing callback and outbox dedupe are Phase 3.

---

## 15. Tests

### 15.1 Unit tests

Policy matrix:

- Every user status.
- Festival draft/published/active/archived.
- Before/at/after reservation opening.
- Enrollment pending/accepted/rejected and wrong request type.
- Terms disabled/missing/current/stale.
- Ban/delay/warning sanctions.
- Category, participation type, unrestricted/restricted/matching subcategory.
- Rejected vs live reservation (both block later self-service and partner add).
- Admin-assigned vs self-service reservation.
- Primary and partner combinations.
- Voseo copy guard.

Authorization:

- Unauthenticated, unrelated participant, partner, festival admin, admin.
- Every exported reservation/invoice/payment/discount/collaborator action.
- Canonical ID mismatch cases.
- Ensure privileged internal functions are not exported from `"use server"` modules.

**Status:** Partial. Present: `policy.test.ts`, `schemas.test.ts`, `copy.test.ts`, `money.test.ts`, `queries.test.ts`, `participant-actions.test.ts`, `admin-actions.test.ts`, `hold-actions.test.ts`, `app/api/reservations/actions.test.ts`, `app/data/invoices/actions.test.ts`, `app/api/payments/route.test.ts`, `discount_codes/actions.test.ts`. Policy tests stay import-safe (no secret validation).

### 15.2 Integration tests with migrated test PostgreSQL

Concurrency tests use real transactions and `Promise.all`:

1. Two participants hold the same stand -> exactly one succeeds.
2. Same participant holds two stands concurrently -> exactly one live hold.
3. Old hold replacement loses race -> old hold remains when new stand is unavailable.
4. Two confirmation retries -> one reservation, one invoice, one task, one event/outbox set.
5. Same participant confirms two self-service stands -> one succeeds.
6. Same partner added concurrently to two self-service reservations -> one succeeds.
7. Admin assigns extra reservation to participant -> succeeds on another available stand.
8. Any attempt to create a second live reservation on one stand -> database rejection.
9. Expired hold with stale `held` status -> immediately reservable without cron.
10. Cleanup and confirmation race -> no confirmed stand becomes available.
11. Price changes during hold -> invoice retains hold snapshot.
12. Terms/status/sanction changes during hold -> confirmation revalidation denies.
13. Notification/provider failure -> committed mutation still returns success; job remains retryable.
14. Cross-invoice/reservation/stand/festival payment IDs -> rejected without writes.
15. Unauthorized voucher upload -> rejected before storage allocation.
16. Discount retry -> usage increments once.
17. Zero-value owner submission -> remains pending review; admin approval performs one atomic legal transition.
18. Zero-value rejection -> requires and atomically applies a corrective amount/discount reversal/cancellation.

**Status:** Partial. `partner-search.integration.test.ts` exists. The concurrency matrix is Phase 3 exit criteria and should land with the lock/settlement rewrite.

### 15.3 Route and component tests

- Archived/unopened/terms-disabled festival never renders map.
- Payment route rejects wrong owner and wrong festival/reservation composition.
- DTO snapshots contain only approved fields.
- Recoverable partner error retains confirmation page/hold.
- Expiry redirects with refreshed map.
- Out-of-order polling/search responses are ignored.
- Dialog focus trap, return focus, labels, keyboard tabs, list alternative.
- Mobile 390px layout and 200% zoom.

**Status:** Partial (payment/auth unit tests). Route/component/a11y coverage is Phase 5.

### 15.4 Playwright end-to-end

Seed deterministic verified, paused, banned, pending, enrolled, unenrolled, sanctioned, owner, partner, and admin users. Cover:

- Happy-path paid reservation through proof submission.
- Zero-value submission followed by admin approval and a separate rejection/correction scenario.
- Partner selection and partner invoice read-only access.
- Simultaneous browsers competing for one stand.
- Refresh/reopen with active hold.
- Expired hold recovery.
- Rejected reservation cannot rebook and cannot be added as a partner.
- Direct URL/API/Server Action authorization attempts.
- Admin assignment followed by participant self-service reservation.
- Keyboard-only and mobile flow.

No production Clerk/payment/email side effects. Use the Clerk test instance and the test database, and stub provider delivery at the boundary.

**Status:** Not started. The repo has `e2e/store-responsive.spec.ts` only. Phase 5.

### 15.5 Performance verification

- Capture query count and timing for map/confirmation/partner search.
- Assert no N+1 growth as stands/participants increase.
- Test representative small, normal, and largest festival fixtures.
- Record RSC payload size and scan serialized data for forbidden profile columns.
- Load-test polling at expected concurrent reservation traffic plus safety margin.

**Status:** Not started. Phase 4.

---

## 16. Observability and operations

Structured events/metrics:

- Hold create/replace/conflict/expire/cancel counts.
- Hold duration remaining at confirmation.
- Confirmation success/failure by stable reason code.
- Duplicate/idempotent retry count.
- Constraint violations and transaction retry count.
- Map/confirmation/action/partner-search p50/p75/p95 latency.
- Poll request volume, error/backoff rate, stale-client count.
- Settlement submitted/approved/rejected by kind and review time.
- Outbox pending/failed/oldest age.
- Cleanup scanned/expired/reconciled counts.
- Data invariant health check results.

PostHog events use canonical server results, never caller-provided IDs/amounts as truth. Logs omit PII and provider-sensitive details.

Add an admin-only reservation health report or scheduled alert for:

- Multiple active festivals.
- Duplicate live reservations/holds.
- Stand status mismatch.
- Stuck payment verification beyond threshold.
- Expired holds not reconciled.
- Failed notification/storage jobs.

**Status:** Not started as product telemetry. Preflight script is the current operational check. `health.ts` was not created. Phase 4/6.

---

## 17. Delivery phases

### Phase 0 — Immediate security containment

**Status: Implemented** (merged in PR #472).

Goal: close exploitable mutation/read surfaces without waiting for schema redesign.

- Require auth/authorization in payment route/actions.
- Require admin in reservation/discount management actions.
- Require ownership in collaborator and invoice reads.
- Load canonical relations; reject mismatched IDs.
- Stop accepting caller-supplied full reservation/email objects.
- Add Zod runtime schemas and guarded updates.
- Add regression tests for every exposed action.

Exit: unauthenticated/unrelated callers cannot read or mutate reservation/payment data.

Carry-over into Phase 3/6: `/api/payments` still exists as a hardened adapter; generic admin invoice/reservation updaters are still exported.

### Phase 1 — Canonical policy and participant flow

**Status: Implemented** (merged in PR #472).

- Build policy/error/copy modules.
- Enforce active/open/verified/enrolled/current terms/sanctions/category/existing reservation in hold and confirmation.
- Separate self-service from admin acting-on-behalf flow.
- Enforce the festival participation lock: any reservation status, including rejected, blocks later self-service and partner add.
- Fix terms-disabled and archived route states.
- Add idempotency at service boundary where possible before schema constraints.

Exit: UI and direct action calls produce the same policy result.

The festival participation lock is locked and implemented. Phase 3 tests should treat `RESERVATION_REJECTED` and partner `PARTNER_ALREADY_RESERVED` as canonical.

### Phase 2 — Additive schema, preflight, and data repair

**Status: Implemented** (merged in PR #472; migrations `0245`, `0246`).

- Add source/owner/price/idempotency/event/settlement/payment/outbox/hold fields.
- Add money migration and supporting indexes.
- Run preflight and manually resolve duplicates/ambiguities.
- Backfill and validate.
- Add unique/partial constraints.

Exit: database prevents duplicate stand occupancy and hold conflicts; inspected production invariants are clean.

Carry-over into Phase 3: owner-per-festival unique, single-active-festival unique, settlement kind/status columns, event idempotency, and production preflight/repair. 0246 must run after backfill on existing databases.

### Phase 3 — Transaction and payment rewrite

**Status: Next (not started as a phase).** Some prerequisites already exist: confirmation idempotency, `createAdminReservation`, `rejectReservation`, `confirmFreeInvoice` review submit, hold cron, money types.

- Implement lock ordering/advisory locks.
- Implement idempotent confirmation.
- Replace payment API/client-ID flow.
- Implement authoritative UploadThing callback, unified settlement review, and zero-value entitlement review.
- Replace synchronous provider work with outboxes.
- Replace admin generic updates with explicit commands.

Exit: retries, races, and provider failures preserve correct state.

### Phase 4 — Cleanup, privacy, and performance

**Status: Partial early work only** (hold cron and read-only status endpoint already shipped). Remaining work waits for Phase 3.

- Add hold reconciliation cron and lazy reconciliation.
- Remove GET side effects/in-memory throttle.
- Harden polling/search with rate limits, abort, ordering, backoff.
- Introduce browser-safe DTOs and minimal queries.
- Add indexes and split static/dynamic data.
- Validate performance budgets.

Exit: no stale hold blocks availability; payload/privacy and latency targets pass.

### Phase 5 — UX, accessibility, and documentation

**Status: Partial copy/error work only.** Remaining work waits for Phase 3–4.

- Typed recoverable error handling.
- Hold recovery and current partner feedback.
- Accessible Drawer/Dialog, tabs, announcements, list alternative.
- Voseo copy migration and guard tests.
- Update reservation and multi-payment PRDs to as-built three-step/five-minute/state behavior.
- Complete Playwright scenarios.

Exit: keyboard/mobile/screen-reader flows pass and all displayed reservation copy uses voseo.

`docs/PRD-stand-reservations.md` still describes a four-step flow and a three-minute hold. Do not rewrite those PRDs until Phase 5, when the settlement state machine and three-step copy are as-built.

### Phase 6 — Rollout and deletion of legacy paths

**Status: Not started.**

- Enable behind `reservation_hardening_v2` for admins/test users first if feature flags are desired.
- Observe metrics through a full reservation opening rehearsal.
- Roll out to participants.
- Remove legacy payment route/actions, deep-row client types, cleanup side effects, and compatibility reads.
- Run invariant report after rollout and after the first live reservation window.

There is no `reservation_hardening_v2` flag in the repo today.

---

## 18. File-level implementation map

### New

```text
app/lib/reservations/schemas.ts                                    Implemented
app/lib/reservations/policy.ts                                     Implemented
app/lib/reservations/authorization.ts                              Not created (logic in policy.ts)
app/lib/reservations/queries.ts                                    Implemented
app/lib/reservations/dto.ts                                        Implemented
app/lib/reservations/errors.ts                                     Implemented
app/lib/reservations/hold-service.ts                               Implemented
app/lib/reservations/reservation-service.ts                        Not created (logic in hold-service.ts)
app/lib/reservations/admin-service.ts                              Not created (logic in admin-actions.ts)
app/lib/reservations/payment-service.ts                            Not created (logic in invoices/actions.ts)
app/lib/reservations/notification-outbox.ts                        Not started
app/lib/reservations/participant-actions.ts                        Implemented
app/lib/reservations/payment-actions.ts                            Not created
app/lib/reservations/health.ts                                     Not created (preflight script exists)
app/api/cron/morning/standHoldExpiration/route.ts                  Implemented
app/api/cron/morning/reservationNotifications/route.ts             Not started
scripts/audit-reservation-invariants.ts                            Implemented
scripts/backfill-reservation-hardening.ts                          Implemented
```

Tests mirror each service plus integration and E2E suites.

### Replace or narrow

```text
app/lib/stands/hold-actions.ts                                     Narrowed to facade over hold-service
app/api/reservations/actions.ts                                    Partial — reject is explicit; generic update/delete remain
app/lib/reservations/actions.ts                                    Partial — collaborators + generic status update
app/lib/reservations/admin-actions.ts                              Partial — create + extend
app/data/invoices/actions.ts                                       Partial — createPayment + confirmFreeInvoice
app/lib/discount_codes/actions.ts                                  Partial — admin-gated
app/api/uploadthing/core.ts                                        Partial — ownership middleware only
app/api/stands/status/route.ts                                     Narrowed to read-only effective status
app/hooks/use-stand-polling.ts                                     Partial — visibility pause only
app/lib/festival_sectors/actions.ts                                Unchanged / later
app/lib/festivals/actions.ts                                       Unchanged / later
app/components/pages/profiles/festivals/map-reservation.tsx        Partial — policy gate added
app/components/pages/profiles/festivals/hold-confirmation.tsx      Partial — policy gate added
app/components/festivals/reservations/hold-confirmation-client.tsx Partial — idempotency key
app/components/festivals/reservations/stand-info-card.tsx          Partial — idempotency key
app/components/festivals/reservations/map-tabs-client.tsx          Later (a11y)
app/(routes)/profiles/[profileId]/festivals/[festivalId]/reservations/[reservationId]/payments/page.tsx
                                                                  Later (settlement UX)
```

### Remove after migration

```text
app/api/payments/route.ts                                          Still present; remove in Phase 6
```

Remove any duplicate/obsolete payment components only after `rg` confirms no live route imports them.

---

## 19. Finding-to-work traceability

| Audit finding | Plan sections | Status |
| --- | --- | --- |
| Unauthenticated payment POST and mismatched IDs | §4, §6.5, §8, Phase 0/3 | Phase 0 done; Phase 3 settlement rewrite remaining |
| Unauthorized reservation mutations | §4.2, §9, Phase 0 | Phase 0 done; generic mutators remain |
| Unauthorized discounts/collaborators/invoice reads | §4.2, §8.4, §9, Phase 0 | Implemented |
| Missing active/open/enrollment/category/single-reservation enforcement | §5, Phase 1 | Implemented |
| Archived festival map | §5.1, §13.1 | Implemented (blocked state) |
| Missing hold/reservation DB invariants and existing duplicates | §6, §7, Phase 2 | Partial — live-stand unique in; owner unique and production repair remaining |
| Admin duplicates and wrong source | §6.3, §7, §9 | Partial — `admin_assignment` + `legacy_unknown` dual-write |
| Post-commit email/provider false failures | §6.6, §14, Phase 3 | Not started (caught sync send only) |
| Partner/map PII overfetch | §11, Phase 4 | Partial |
| Rejected reservation inconsistencies | §1, §5.4, Phase 1 | Implemented — any reservation status locks the person; reject only releases the stand |
| Fragile cleanup and polling | §10, Phase 4 | Partial — cron + read-only status |
| Price/terms/status races | §5.2–5.3, §6.2–6.3 | Partial — revalidation exists; advisory locks do not |
| Floating-point money | §6.5, Phase 2 | Implemented |
| Cross-festival payment route composition | §8.1, §15 | Partial |
| Slow map/confirmation and partner search | §12, Phase 4 | Not started |
| Confirmation redirects, search/timer races, hold recovery | §13, Phase 5 | Not started |
| Accessibility gaps | §13.5, Phase 5 | Not started |
| Multiple active festivals | §6.1, §7 | Audited only |
| Outdated three-minute/four-step PRD | §1, Phase 5 | Not started |
| Missing auth/concurrency/E2E coverage | §15 | Auth unit tests added; concurrency/E2E remaining |
| Inconsistent Spanish register | §13.6 | Partial |

---

## 20. Definition of done

- [x] Product confirmed §1.1 decisions on 2026-08-29.
- [x] Product confirmed the festival participation lock on 2026-08-30 (§1.2): any reservation status in the current festival, including `rejected`, blocks later self-service and partner add.
- [x] Phases 0–2 shipped on `develop` (PR #472, 2026-08-30 audit).
- [ ] Every reservation-related Server Action/API route has auth, runtime validation, canonical ownership, and negative tests.
- [x] Participant self-service policy is centralized and used by pages, holds, confirmation, and partner search.
- [x] Admin assignment is a separate audited path.
- [ ] Preflight report is clean; known duplicate live reservations are resolved.
- [ ] Hold and stand reservation constraints are active.
- [x] Money no longer uses `real` in this domain.
- [ ] Reservation/payment transitions are explicit, atomic, idempotent, and audited.
- [ ] Notification and file cleanup side effects are durable and retryable.
- [ ] Expired holds cannot block stands without cron.
- [ ] Map/partner/invoice DTOs contain no unauthorized fields.
- [ ] Polling/search are rate-limited, ordered, abortable, and observable.
- [ ] Production performance budgets are measured and accepted.
- [ ] Keyboard, screen-reader, mobile, retry, refresh, and concurrency E2E scenarios pass.
- [ ] All new/changed visible Spanish uses voseo.
- [ ] PRDs describe the final three-step flow, configured hold duration, settlement/payment state machine, role matrix, and known intentional admin multi-reservation behavior.
- [ ] Invariant health check is clean after rollout and the first live reservation window.

---

## 21. Locked product note — 2026-08-30

The earlier draft of this plan said a rejected reservation should allow later self-service. That is **not** the product rule.

Confirmed: a participant with a reservation in any status in the current festival (`pending`, `verification_payment`, `accepted` / confirmed, `rejected`) can no longer participate through self-service. They cannot create a new reservation and cannot be added as a stand partner by another participant. Rejection or cancellation frees the stand for someone else; it does not restore the original participant or partner.

The shipped Phase 1 policy already matches this rule (`RESERVATION_REJECTED`, partner `PARTNER_ALREADY_RESERVED`). Treat those codes as canonical in Phase 3 tests.