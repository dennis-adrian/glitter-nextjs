# FastPass implementation plan

**Product:** Glitter  
**Public name:** Pase Rápido  
**Date:** 2026-08-02  
**Status:** Proposed  
**Product requirements:** [PRD-fast-pass.md](./PRD-fast-pass.md)

---

## 1. Architecture decision

Build FastPass as a dedicated festival-day domain. Do not store FastPass purchases in store `orders`, paid-program `session_purchases`, or legacy festival `tickets`.

Reasons:

- Store orders model merchandise fulfillment and two-day payment deadlines.
- Paid-program purchases require a program, occurrence, session line, and attendee identity that do not describe festival-day priority access.
- Legacy festival tickets have only `pending`/`checked_in`, require a `visitorId`, embed group size in `numberOfVisitors`, and have no purchase, voucher, transaction, child, channel, seller, or audit model.
- On-site FastPass sales may intentionally omit visitor data, which legacy visitor/ticket constraints cannot represent.

Reuse existing implementations as patterns:

| Existing code                                           | Reuse                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `app/lib/programs/checkout-actions.ts`                  | Transactional holds, row locking, idempotency, fixed 20-minute behavior |
| `app/lib/programs/tokens.ts`                            | Random token generation and SHA-256 token storage                       |
| `app/lib/programs/voucher-actions.ts` and `vouchers.ts` | Versioned immutable proofs and state validation                         |
| `app/lib/programs/review-actions.ts`                    | Guarded admin transitions and ticket issuance after approval            |
| `app/lib/programs/scheduled-actions.ts`                 | Lazy expiration plus periodic bookkeeping sweep                         |
| `session_purchase_events`                               | Append-only actor/status/change audit model                             |
| `session_tickets` and `session_attendances`             | Separate ticket validity and immutable activation history               |
| `app/vendors/resend.ts`                                 | Idempotent best-effort email delivery                                   |
| `app/api/uploadthing/core.ts`                           | Authorized proof upload route                                           |
| `app/lib/feature_flags/*`                               | Admin-only pilot and public rollout                                     |
| `requireFastPassFestivalAdmin(festivalId)`              | Global-admin access plus scoped festival-admin assignments              |
| `visitors` and `tickets`                                | Optional link/create behavior when holder data is complete              |

## 2. Proposed code layout

```text
app/lib/fast-pass/
  access.ts
  admin-actions.ts
  availability.ts
  checkout-actions.ts
  definitions.ts
  inventory-queries.ts
  notifications.ts
  pos-access.ts
  pos-actions.ts
  purchase-queries.ts
  review-actions.ts
  scheduled-actions.ts
  state.ts
  tickets.ts
  transaction-actions.ts
  vouchers.ts

app/components/fast-pass/
  public/
  payment/
  admin/
  pos/
  check-in/

app/(routes)/festivals/[id]/fast-pass/
app/(routes)/fast-pass/purchases/[purchaseId]/
app/(routes)/fast-pass/recover/
app/(routes)/fast-pass/pos/[credential]/

app/dashboard/festivals/[id]/fast-pass/
  page.tsx
  settings/page.tsx
  purchases/page.tsx
  transactions/page.tsx
  tickets/page.tsx
  operators/page.tsx
  refunds/page.tsx
  check-in/page.tsx
```

Route names may be adjusted to existing folder conventions, but public purchase access, admin management, restricted POS access, and check-in must remain separate authorization surfaces.

## 3. Data model

Use new tables in `db/schema.ts` and a generated Drizzle migration. Money columns use `numeric(10,2)` with `mode: "number"`.

### 3.1 `fast_pass_day_settings`

One row per `festivalDates.id`.

Key fields:

- `festivalDateId` unique FK, `ON DELETE RESTRICT` after financial history exists.
- `offeringEnabled`.
- `onlineSalesEnabled`, `onSiteSalesEnabled`.
- `onlineSalesPausedAt`, `onSiteSalesPausedAt`.
- `price`.
- `salesStartAt`, `salesEndAt`.
- `paidInventoryLimit`, `priorityCapacityLimit`.
- `onlinePaidAllocation`, `onSitePaidAllocation`.
- `onlinePriorityAllocation`, `onSitePriorityAllocation`.
- `maxPaidPassesPerPurchase`, default 10.
- `bankQrImageUrl`.
- `onSiteBankQrEnabled`, default true.
- `onSiteCashEnabled`, default false.
- `onSiteProofRequired`, default true.
- `onSiteVisitorDetailsRequired`, default false.
- `notifyOnSale`, `notifyOnCancellation`.
- `cancelledAt`, `updatedByUserId`, timestamps.

Checks:

- Price is non-negative.
- Inventory, capacity, allocations, and limits are positive where applicable.
- `onlinePaidAllocation + onSitePaidAllocation <= paidInventoryLimit`.
- `onlinePriorityAllocation + onSitePriorityAllocation <= priorityCapacityLimit`.
- Settings changes cannot reduce any total or channel allocation below quantities already held or sold.
- Sales end is not before sales start.
- At least one on-site payment method is enabled when on-site sales are enabled.

The initial hold and the one correction window use one fixed 20-minute domain
constant. There is no `holdMinutes` settings column or administrator override.
Checkout, review actions, deadline copy, tests, and the scheduled expiration
sweep all use persisted deadlines derived from this fixed duration.

### 3.2 `fast_pass_notification_recipients`

- `settingsId` FK.
- Normalized lowercase `email`.
- Unique `(settingsId, lower(email))`.
- Created/updated timestamps.

Zero recipients is valid and means no internal notification is sent.

### 3.3 `fast_pass_pos_operators`

- `settingsId` FK.
- `displayName`.
- `accessTokenHash` unique.
- `expiresAt`, `revokedAt`.
- `createdByUserId`.
- `lastUsedAt`, timestamps.

The raw credential is returned once. The POS route exchanges it for a secure HTTP-only session cookie or presents it to each scoped action; only the hash is stored.

### 3.4 `fast_pass_purchases`

- `settingsId` and denormalized `festivalDateId`.
- `channel`: `online` or `on_site`.
- `status`: `pending_upload`, `under_verification`, `changes_requested`, `approved`, `rejected`, `expired`, `cancelled`.
- `paymentMethod`: `bank_qr` or `cash`.
- Buyer/contact fields: required name, email, and phone for online purchases; optional name plus email and/or phone for on-site purchases.
- `accessTokenHash` nullable for on-site purchases, unique when present.
- `subtotalAmount`, `totalAmount`.
- `holdExpiresAt`, `correctionExpiresAt`.
- `voucherSubmittedAt`, `approvedAt`, `rejectedAt`, `expiredAt`, `cancelledAt`.
- `policyVersion`, `policyAcceptedAt` for online purchases.
- `posOperatorId` nullable.
- `createdByUserId` nullable for admin-created POS sales.
- Snapshot booleans for on-site proof and visitor-data requirements.
- `allocationRestored`, nullable until cancellation and changed atomically with
  the restoration audit record.
- `idempotencyKey` unique.
- Timestamps.

Identity checks differ by channel:

- Online requires buyer name, email, phone, access-token hash, and policy acceptance.
- On-site forbids an access token and requires exactly one actor: POS operator or admin.
- When an on-site purchase snapshots visitor details as required, every paid line requires a holder full name and the purchase requires at least one contact method: email or phone.
- When on-site visitor details are optional, all customer identity fields may be null.

### 3.5 `fast_pass_purchase_lines`

One row per paid holder.

- `purchaseId` FK.
- `unitPrice` and pricing snapshot.
- Holder snapshot fields supporting the complete online registration dataset and the minimal on-site full name. Columns remain nullable so anonymous POS sales are representable; domain validation enforces the applicable channel/settings snapshot.
- `responsibleChildCount`, constrained to 0–5.
- Optional `visitorId` and `festivalTicketId` links when identity is complete.
- Timestamps.

The sum of lines is the paid-pass quantity. The sum of `1 + responsibleChildCount` is the priority-person quantity.

### 3.6 `fast_pass_vouchers`

Append-only, modeled after `session_purchase_vouchers`:

- `purchaseId`, `version`, `fileUrl`.
- Uploader type: `buyer`, `admin`, or `pos_operator`.
- Optional uploader user/operator FK.
- Unique `(purchaseId, version)`.
- Timestamp.

Online purchases require a voucher before review. On-site bank-QR purchases require one only when the settings snapshot says so.

### 3.7 `fast_pass_tickets`

One per paid line, issued idempotently.

- `purchaseLineId` unique.
- Opaque `code` unique.
- `status`: `valid`, `activated`, `cancelled`.
- Holder snapshot.
- `issuedAt`, `activatedAt`, `cancelledAt`, cancellation metadata.
- Optional link to an existing festival ticket.

On-site tickets are inserted directly as activated. Their codes exist for audit/recovery but are never emailed.

### 3.8 `fast_pass_activations`

One per ticket, enforced by unique `ticketId`.

- `ticketId`, `festivalDateId`.
- `method`: `qr_scan`, `on_site_sale`, or `manual`.
- `operatorUserId` or `posOperatorId`.
- `wristbandIssued`, default true.
- Timestamp.

This table preserves history if a ticket is later cancelled.

### 3.9 `fast_pass_transactions`

Append-only financial ledger.

- `purchaseId`.
- `type`: `sale`, `cancellation`, or `refund`.
- Signed `amount`: sales are strictly positive; cancellations and refunds are
  strictly negative and equal the reversed/refunded magnitude.
- `paymentMethod`.
- `relatedTransactionId` for cancellation/refund linkage.
- `posOperatorId` or `actorUserId`.
- `reason` required for cancellation/refund.
- Cash metadata: amount received and change.
- Timestamp.

Enforce one sale transaction per purchase. Lock the originating sale before
reading reversals, and reject a cancellation when the absolute value of existing
reversals plus the requested cancellation exceeds the positive sale amount.
Reporting sums positive sales for gross, reports absolute cancellation/refund
magnitudes in their columns, and computes net from the signed ledger sum. Refund
work-item amounts remain positive payout magnitudes; resolving one writes an
equal negative refund transaction.

### 3.10 `fast_pass_events`

Append-only audit trail:

- Purchase or settings scope.
- Actor type: `buyer`, `admin`, `pos_operator`, `system`.
- Actor FK where applicable.
- Event type.
- From/to status.
- Reason required for sensitive admin actions.
- JSONB changes snapshot.
- Timestamp.

### 3.11 `fast_pass_refunds`

- Purchase and originating sale transaction.
- Trigger fixed to festival cancellation in MVP.
- Status: `pending`, `paid`.
- Amount, payment method, resolution notes/reference.
- Created/resolved actor and timestamps.
- Unique `(saleTransactionId, trigger)`. Festival-cancellation creation uses
  conflict-safe insert semantics; a uniqueness conflict reuses the existing work
  item or is treated as an idempotent success.

### 3.12 `fast_pass_allocation_restorations`

Durable, append-only proof that capacity was restored exactly once:

- `purchaseId` unique and FK to the restored purchase.
- `sourceTransactionId` nullable unique FK for an admin cancellation.
- `sourceRefundId` nullable unique FK for a refund/festival-cancellation path.
- Restored paid/priority quantities, actor, reason, and timestamp.
- Exactly one source is present.

Cancellation/refund processing inserts this row in the same transaction that
closes the purchase. A uniqueness conflict means restoration already happened
and is an idempotent success. Availability derives restoration from this record;
transaction/refund audit output links to it rather than relying on an ephemeral
calculation.

## 4. Inventory algorithm

Create one canonical availability function used by public pages, checkout, POS, settings validation, admin reports, and tests.

Counts:

- `heldPaid`: paid lines in non-expired `pending_upload`, `under_verification`, or `changes_requested` online purchases.
- `heldPriority`: `1 + childCount` for the same purchases.
- `approvedPaid` and `approvedPriority`: active approved purchases, including on-site.
- Channel-specific versions of each count.
- A cancellation restores counts only when its durable allocation-restoration
  record exists.

Every checkout/POS transaction:

1. Locks the `fast_pass_day_settings` row.
2. Re-reads current state and allocations.
3. Lazily treats overdue holds as unavailable to themselves but free to new purchases.
4. Computes paid and priority demand for the complete group.
5. Verifies total and channel-specific limits.
6. Inserts all purchase, line, transaction/ticket/activation, and audit rows atomically.

Use one deterministic lock target per festival day. This is simpler than locking every purchase and prevents online/POS overselling races.

## 5. State and concurrency helpers

Implement pure resolvers before server actions:

- `resolveFastPassSaleState(settings, now)`.
- `isFastPassPurchaseHolding(purchase, now)`.
- `resolveVoucherSubmission(purchase, now)`.
- `resolveReviewDecision(purchase, voucherCount, decision, now)`.
- `resolveBuyerCancellation(purchase, now)`.
- `resolveActivation(ticket, festivalDate, now)`.
- `resolveTransactionCancellation(transaction, wristbandRecovery)`.

Unit-test the state matrix independently of React and the database.

Critical races:

- Last online allocation versus last POS allocation transfer.
- Checkout versus sales pause.
- Voucher upload at the 20-minute boundary.
- Correction upload at its boundary.
- Approval versus rejection/cancellation.
- QR activation versus admin cancellation.
- Duplicate POS submit after an uncertain network response.
- Two admins cancelling the same transaction.

Cancellation commands include a client-generated idempotency key. The command
transaction first locks the original sale (and its purchase when restoration is
possible) with `FOR UPDATE`, then reads all linked cancellation/refund entries,
computes the remaining reversible balance, and inserts the cancellation. The
idempotency key returns the prior result on retry; the sale lock plus a unique
full-cancellation constraint ensures two administrators cannot create duplicate
or excessive negative entries even when they submit different command keys.

## 6. Phase 0 — Contracts, schema, and feature flag

### Deliverables

- Add `fast_pass` to `app/lib/feature_flags/registry.ts`, default `hidden`.
- Add enums, tables, relations, constraints, and indexes to `db/schema.ts`.
- Generate and review the Drizzle migration.
- Add `app/lib/fast-pass/definitions.ts`, state resolvers, inventory calculations, and token helpers.
- Add unit tests for states, capacity, child accounting, allocation transfers, transactions, and tokens.

### Gate

- Migration applies on a clean database.
- Children affect priority counts but never paid units or revenue.
- Invalid settings, identity branches, and transaction reversals fail at the database or domain boundary.

## 7. Phase 1 — Admin configuration and reporting foundation

### Deliverables

- Add FastPass entry from the festival card/dashboard.
- Add `/dashboard/festivals/[id]/fast-pass` overview.
- Add per-`festivalDate` settings editor.
- Implement enable/disable, online/on-site pause/resume, pricing, sales windows, inventory/capacity, channel allocations, on-site requirements, payment methods, and notification recipients.
- Prevent settings/allocation reductions below existing holds/sales.
- Add base transaction/purchase/ticket queries and reporting cards.
- Audit every settings change with actor and field diff.

### Gate

- Existing passes remain valid when sales are paused or disabled.
- An admin cannot configure a mathematically impossible allocation.
- Global admins are authorized server-side; festival admins require an assignment to the requested festival; ordinary users are denied.

## 8. Phase 2 — Online guest checkout and recovery

### Deliverables

- Public Pase Rápido section on the festival-day experience, behind the feature flag and settings state.
- Spanish value proposition and capacity qualification from the PRD.
- Group builder with up to the configured paid-pass limit and 0–5 children per adult.
- Guest buyer and holder forms using existing visitor-registration fields.
- Atomic checkout with idempotency key and 20-minute hold.
- Secure purchase page with payment QR, server deadline, voucher upload, buyer cancellation, and current status.
- Add `fastPassVoucher` UploadThing route authorized by owner token.
- Secure-link recovery and rotation by email/purchase reference.
- Expiration derived lazily in availability plus a `/api/cron/.../fastPassHoldExpiration` bookkeeping sweep, scheduled at least every 10 minutes.
- Initial secure-link and voucher-received emails through `sendEmail` with idempotency keys.

### Gate

- Reload and cross-device secure-link access restore the same purchase.
- Double-submit returns the original outcome and creates one hold.
- Expired holds stop consuming availability immediately even before cron bookkeeping.
- Buyer cancellation is available only before voucher submission.

## 9. Phase 3 — Review, ticket issuance, and entrance activation

### Deliverables

- Admin online review queue, oldest voucher first.
- Immutable voucher versions and latest-version review.
- Approve, request one 20-minute correction, and reject transitions with reasons.
- Ticket issuance inside the approval transaction, one per paid line.
- Approval email with secure link and individual ticket QRs.
- FastPass check-in page optimized for the dedicated priority entrance.
- QR and manual-code activation actions.
- Wristband-issued confirmation and duplicate-activation response.
- Optional link/create behavior for existing `visitors` and festival `tickets` when complete holder data is present.

### Gate

- No ticket exists before approval.
- Approval retry issues no duplicate ticket or email.
- Duplicate scan creates no second activation.
- Re-entry requires no application action.
- A ticket for another festival day cannot activate.

## 10. Phase 4 — Restricted POS and on-site sales

### Deliverables

- Admin POS operator create/revoke interface.
- Hashed event-day POS credentials with expiration.
- POS route outside `/dashboard` with server-scoped authorization.
- Mobile-first POS: quantities, child assignment, total, method, conditional visitor/proof fields, success, and new-sale flow.
- Visitor fields hidden by default behind **Add visitor details** when the festival-day setting makes them optional.
- Required on-site data limited to full name per paid holder plus one purchase-level email or phone; no birthdate, gender, event-discovery source, address, or identity document.
- Bank-QR and optional cash payment.
- Cash received/change calculation.
- Atomic on-site sale that creates approved purchase, positive transaction, tickets, `on_site_sale` activations, and audit events.
- No visitor email or exposed ticket QR for on-site sales.
- Recent-sales recovery and idempotent retry behavior.
- Internal sale notifications to configured recipients.

### Gate

- POS credential cannot access dashboard, settings, review, cancellation, or complete customer data.
- Seller cannot change price.
- Proof and visitor requirements follow the purchase-time settings snapshot.
- Wristband counts on success equal paid holders plus children.
- QR and cash totals reconcile separately.

## 11. Phase 5 — Immutable cancellation, refunds, and operational reporting

### Deliverables

- Admin-only cancellation UI with reason and wristband-recovery confirmation.
- Negative cancellation transaction linked to original positive sale.
- Ticket invalidation while retaining activation history.
- Allocation restoration only when safe.
- Cancellation notifications to configured recipients.
- Festival cancellation action that pauses channels, invalidates affected passes, and creates refund work items.
- Manual QR/cash refund resolution with references and audit history.
- Reporting for gross/cancelled/refunded/net amounts, channel, method, seller, children, expected priority visitors, activations, and notification failures.
- Exportable transaction report if existing admin reporting patterns support CSV without a new dependency.

### Gate

- No UI or server action deletes a purchase, ticket, voucher, transaction, activation, or audit event.
- Repeated cancellation cannot create excess negative value.
- Financial cancellation and refund remain distinct.
- Children never enter revenue totals.

## 12. Phase 6 — Hardening and pilot

### Deliverables

- End-to-end tests for online QR purchase, expiration, correction, approval, entrance, POS QR, POS cash, cancellation, and festival cancellation.
- Concurrency tests for all races in §5.
- Authorization tests for admin, festival admin, buyer token, POS credential, revoked/expired POS credential, and anonymous visitor.
- Accessibility and mobile viewport review for checkout, payment, POS, and check-in.
- Structured logs without raw access tokens or unnecessary visitor data.
- Operational runbook covering wristbands, lane setup, on-site allocation, payment evidence, cash handling, capacity pause, gift tokens, cancellations, and network recovery.
- Admin-only production rehearsal, then one-day pilot behind the feature flag.

### Gate

- No critical reconciliation difference among settings, holds, approved passes, transactions, tickets, activations, and child counts.
- Staff complete the full rehearsal without database intervention.
- Public copy and on-site signage match the PRD.

## 13. Test matrix

| Scenario                                       | Required result                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Last online pass purchased twice concurrently  | One succeeds; one receives unavailable result                               |
| Adult plus five children                       | One paid unit, six priority units, one revenue unit                         |
| Sixth child added                              | Validation refuses purchase                                                 |
| Reload during payment                          | Same purchase and server countdown restored                                 |
| Buyer cancels before upload                    | Hold released once; purchase retained as cancelled                          |
| Voucher arrives at hold boundary               | Serialized transition; either review holds capacity or expiry wins cleanly  |
| Changes requested                              | One new 20-minute window; replacement retained as a new voucher version     |
| Approve twice                                  | One ticket set and one approval email                                       |
| POS proof optional                             | Sale succeeds without file and records settings snapshot                    |
| POS proof required                             | Confirmation blocked without file                                           |
| POS visitor data optional                      | Anonymous tickets/activation created with complete counts                   |
| POS visitor data required                      | Full name per paid holder plus one purchase email or phone required         |
| Cash sale                                      | No voucher; received/change and cash revenue recorded                       |
| POS response lost after commit                 | Reload finds committed sale; retry creates nothing                          |
| Online activation                              | Ticket activated once; wristband issuance recorded                          |
| On-site sale                                   | Tickets already activated; no second scan or visitor email                  |
| Duplicate QR scan                              | Already activated; no new activation                                        |
| Pause sales                                    | New purchases blocked; approved tickets remain valid                        |
| Cancel issued sale without recovered wristband | Negative transaction allowed only under admin policy; capacity not restored |
| Cancel unissued sale                           | Negative transaction created; safe allocation restored once                 |
| Festival cancellation                          | Sales stop, passes invalidate, refund work items created                    |
| Notification send fails                        | Sale/cancellation remains committed; failure is observable                  |
| Revoked POS credential                         | All POS reads and writes denied                                             |

## 14. Current-code impact map

| Current area                                           | Expected change                                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `db/schema.ts`                                         | Add isolated FastPass enums/tables/relations                                                                |
| `app/lib/feature_flags/registry.ts`                    | Register `fast_pass`                                                                                        |
| `vercel.json` and cron routes                          | Add hold-expiration bookkeeping sweep                                                                       |
| `app/api/uploadthing/core.ts`                          | Add online/POS FastPass voucher upload authorization                                                        |
| `app/vendors/resend.ts`                                | Reuse unchanged; add FastPass email templates/callers                                                       |
| `app/components/organisms/festivals/table-actions.tsx` | Link to FastPass management from the active festivals table menu                                            |
| Public festival routes/components                      | Add Pase Rápido discovery and purchase entry                                                                |
| Legacy `visitors` / `tickets`                          | Link/create only when complete identity is available; do not expand them into the purchase ledger           |
| Existing ticket verification                           | Keep unchanged initially; use a dedicated FastPass check-in page to avoid legacy numeric-code parsing       |
| Paid-program domain                                    | No schema coupling; reuse patterns and shared low-level helpers only when they are genuinely domain-neutral |

## 15. Deferred work

- Full application-wide RBAC and staff accounts.
- Offline POS with synchronization.
- Cash drawer opening/closing, shifts, and variance reconciliation.
- Automated bank confirmation or refunds.
- Native mobile seller app.
- Re-entry scanning or live inside/outside occupancy tracking.
- Dynamic wait-time promises.
- Dedicated FastPass merchandise or gifts.
- Cross-festival passes or multi-day bundles.

## 16. Implementation order summary

1. Contracts, schema, state tests, feature flag.
2. Admin configuration and canonical availability.
3. Online guest checkout, persistence, voucher, and expiry.
4. Review, ticket issuance, and first-entry activation.
5. Restricted POS with QR/cash and immediate activation.
6. Cancellation ledger, refund work queue, notifications, and reporting.
7. Concurrency hardening, operational rehearsal, and pilot.

Do not begin public UI implementation before the schema, state contracts, and canonical availability tests are accepted. Inventory, money, and physical wristband issuance must share one source of truth from the first production sale.
