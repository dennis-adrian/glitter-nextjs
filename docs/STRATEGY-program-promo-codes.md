# Strategy: Promo codes for paid programs

**Date:** 2026-08-04

**Status:** Implemented in `codex/program-promo-codes`; validation in progress

**Base:** `develop` at `6561f8d3`

**References:**

- [PRD: Paid Programs and Sessions](./PRD-paid-programs-and-sessions.md)
- [Architecture: Paid Programs and Sessions](./ARCHITECTURE-paid-programs-and-sessions.md)
- [Implementation roadmap](./ROADMAP-paid-programs-and-sessions.md)

## 1. Recommendation

Build program promo codes as a separate programs-domain capability. Do not reuse the existing
festival/reservation `discount_codes` workflow.

Each code belongs to one program and one named referral partner (influencer, artist, or other
campaign owner). A buyer may apply one code during checkout. The server revalidates it inside the
same transaction that locks seats and creates the purchase.

Required price order:

1. Resolve the session's public base price.
2. Separately resolve the buyer's existing public or active-participant price for comparison.
3. Apply the promo percentage to the public base price. It replaces the existing discount; it does
   not compound with it.
4. Round the promo price down to whole bolivianos, per purchase line.
5. Preserve the base, existing, promo, and final prices as immutable purchase history.

Examples:

- Public base Bs 70, participant price after 20% discount Bs 56, promo 50% → Bs 35, not Bs 28.
- Public base Bs 70, participant price Bs 56, promo 10% → Bs 63. The UI must warn that applying the
  code produces a higher price than the existing Bs 56 price.
- Public base Bs 101, promo 50% → raw Bs 50.50 → final Bs 50.

## 2. Historical pre-implementation comparison

This table records the `develop` baseline reviewed before this branch was implemented. It is not a
description of the branch's current state; the implemented contracts are in §§4–10.

| Area                 | Documented contract                                                       | Current implementation                                                                                                                                              | Promo impact                                                                                                    |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Domain               | Programs remain separate from festivals, store products, and reservations | Implemented with dedicated program/session/occurrence/purchase tables                                                                                               | Keep promo tables in the programs domain                                                                        |
| Pricing              | Resolve public/participant price on the server and snapshot the result    | Implemented in `pricing.ts`; half-up cents today                                                                                                                    | Resolve promo independently from public base; compare it with, but do not compound it onto, participant pricing |
| Checkout             | Revalidate price, audience, and inventory under occurrence locks          | Implemented in `startPaidCheckout`                                                                                                                                  | Validate and lock the code in this transaction too                                                              |
| Purchases            | `subtotalAmount` and `totalAmount`; `totalAmount <= subtotalAmount`       | Implemented, but currently both are equal                                                                                                                           | For version 2 pricing, use subtotal for public base and total for the selected existing/promo price             |
| Purchase lines       | One line per occurrence with a pricing snapshot                           | Implemented and retained for the deferred cart                                                                                                                      | Apply and snapshot promo per line                                                                               |
| Free result          | Zero price skips voucher and issues a ticket immediately                  | Implemented only through the separate free-registration action                                                                                                      | Promo checkout must handle a paid session becoming zero                                                         |
| Audit                | Financial decisions must remain explainable                               | Eligibility/price snapshots and purchase events exist                                                                                                               | Add immutable redemption snapshots and promo administration events                                              |
| Operations           | Occurrence metrics, waitlist, support, cancellation, refunds, check-in    | Roster/seat metrics, waitlist, review, resend, and admin cancellation are partial Phase 5; check-in, buyer cancellation, refunds, and full operations are not built | Promo work must not depend on unfinished Phase 5 work                                                           |
| Promo/referral codes | Not present in PRD, architecture, or roadmap                              | No program promo support                                                                                                                                            | Add contracts to all three documents before enabling publicly                                                   |

Documentation drift identified in that baseline:

- Architecture header still says Phases 0–2 are built; paid checkout (Phase 3) is built.
- Roadmap correctly calls Phase 5 in progress, but should list its delivered subset.
- Price documentation says all rounding is half-up to cents. Promo rounding needs a named,
  separate rule so participant-price behavior does not change accidentally.

## 3. Why the existing `discount_codes` table should not be reused

The existing feature is for festival stand-reservation invoices:

- It is linked to `invoices`, `festivals`, and optionally one signed-in `user`.
- Program checkout supports guests and creates its price before any invoice exists.
- It stores a mutable `currentUses` counter, while program purchase status already provides a more
  reliable source for pending, approved, expired, rejected, and cancelled uses.
- It applies a discount after an invoice exists; program pricing must be settled before the seat
  hold and bank QR amount are created.
- Its `real` discount value and current rounding behavior do not meet the whole-boliviano rule.

Reuse UI primitives and normalization conventions only. A generic migration would enlarge the
scope and risk the working reservation-payment flow.

## 4. Proposed contracts

### 4.1 Scope and lifecycle

- One promo code belongs to one program.
- Codes are case-insensitive and stored normalized (recommended alphabet: `A-Z`, `0-9`, `_`, `-`).
- One code per purchase. No code changes after checkout starts.
- Required: code, referral partner name, integer discount percentage, active state.
- Optional: validity start/end, maximum consuming uses, internal notes. Confirmed purchases and
  live in-progress purchases consume this limit; released attempts do not.
- Codes are deactivated, not deleted, once referenced by a purchase.
- Code, program, partner, and discount become immutable after the first redemption. A changed
  campaign gets a new code; this prevents one dashboard row from mixing unlike offers.

### 4.2 Pricing and rounding

Recommended formula for each line:

```text
basePrice = session public price
existingPrice = existing eligibility-resolved price
rawFinal = basePrice × (100 - discountPercent) / 100
promoPrice = floor(rawFinal)                 # whole Bs, always down
finalPrice = promoPrice                      # when the code is accepted
discountAmount = basePrice - promoPrice
purchase.subtotalAmount = sum(basePrice)
purchase.totalAmount = sum(finalPrice)
```

`subtotalAmount` always means the sum of undiscounted public `basePrice` values. `unitPrice` is each
line's selected final price, and `totalAmount = sum(unitPrice)`. Reporting and redemption
reconciliation use the same meanings. Multi-line example: bases Bs 70 + Bs 101, existing prices
Bs 56 + Bs 80.80, and promo prices Bs 35 + Bs 50 produce `subtotalAmount = Bs 171`, line
`unitPrice` values Bs 35 and Bs 50, and `totalAmount = Bs 85`.

Use integer cents internally in the helper before flooring. Do not use a floating-point-only
calculation for the financial result.

The promo always uses `publicPrice`, even when `existingPrice` came from `participantPrice`, a
program participant discount, or the global participant discount. The two discounts are
alternatives, never sequential calculations.

The rounding applies only to `promoPrice`. Existing public and participant prices keep their
current half-up-to-cents behavior.

When `promoPrice > existingPrice`, preview must show both prices in a drawer dialog and a clear
warning. The code must not be silently applied. The buyer chooses either to keep the lower existing
price without the code or explicitly apply the code and pay the higher promo price.

Suggested copy: “Este código deja el precio en Bs 63, mayor al precio actual de Bs 56.”

Apply per line, not once to the combined purchase. The MVP UI buys one session, but the server
already supports several lines and the deferred cart must retain explainable line totals.

If the result is zero, create an immediately approved zero-total purchase, issue the ticket, and
send the registration email. Do not create a bank-QR hold or ask for a voucher.

### 4.3 What counts as a use

Use purchase state instead of a mutable counter:

- **Confirmed use:** `approvedAt` is set. It remains a confirmed use if the ticket is later
  cancelled, because the financial approval occurred.
- **In progress:** live `pending_upload`, `under_verification`, or `changes_requested` purchase.
- **Released attempt:** expired, rejected, or cancelled before approval.

If a maximum-consuming-uses limit is enabled, confirmed purchases and live in-progress purchases
consume the limit. Expired, rejected, and pre-approval-cancelled attempts are released and do not
consume it. The code row is locked while this count is checked, preventing two concurrent
checkouts from exceeding the limit.

## 5. Data model

### `program_promo_codes`

- `id`
- `programId` → `programs.id`, not null
- `code`, normalized text, not null
- `partnerName`, not null
- `discountPercent`, integer, `1..100`
- `startsAt`, nullable
- `expiresAt`, nullable
- `maxUses`, nullable positive integer; maximum consuming uses as defined in §4.3
- `isActive`, default false
- `internalNotes`, nullable
- `createdByUserId`, nullable FK to `users`
- timestamps

Constraints/indexes:

- unique `(programId, lower(code))`
- check nonblank code and partner
- check percentage and date range
- index `(programId, isActive)`

### `program_promo_code_redemptions`

One immutable row per purchase to preserve referral attribution:

- `promoCodeId` → `program_promo_codes.id`, `ON DELETE RESTRICT`
- `purchaseId` → `session_purchases.id`, unique, `ON DELETE RESTRICT`
- `codeSnapshot`, `partnerNameSnapshot`, `discountPercentSnapshot`
- `baseAmountSnapshot`, `existingPriceAmountSnapshot`, `discountAmountSnapshot`,
  `totalAmountSnapshot`
- `higherPriceAcceptedAt`, nullable; set when the buyer explicitly applies a worse promo
- `createdAt`

The joined purchase supplies current state and `approvedAt`; no copied redemption status can drift.

### `program_promo_code_events`

Insert-only admin audit rows: code, actor, `created | updated | activated | deactivated`, field diff,
optional reason, timestamp.

### `session_purchase_lines` additions

- `basePrice`: session public price before any discount
- `existingPrice`: resolved public/participant price shown before the code
- `discountAmount`: total reduction from public base to final price, not null; it has no schema
  default
- Existing `unitPrice` remains the final line price so current roster/email presentation stays
  correct.

For new version 2 lines without a promo, `unitPrice = existingPrice`. With a promo,
`unitPrice = promoPrice`. Backfill existing lines with `basePrice = existingPrice = unitPrice` and
`discountAmount = 0` during the migration backfill; this is not a database default. Their existing
version 1 snapshot remains the authoritative historic detail.
Add checks for nonnegative amounts, `existingPrice <= basePrice`, `unitPrice <= basePrice`, and
`discountAmount = basePrice - unitPrice`.

Version the JSON price snapshot rather than silently changing its meaning:

```json
{
  "version": 2,
  "eligibilityPrice": { "rule": "program_discount", "amount": 56 },
  "promo": {
    "promoCodeId": 12,
    "code": "ARTISTA50",
    "partnerName": "Artist name",
    "discountPercent": 50,
    "rounding": "floor_whole_bob"
  },
  "basePrice": 70,
  "existingPrice": 56,
  "promoPrice": 35,
  "discountAmount": 35,
  "finalPrice": 35
}
```

Existing snapshots remain valid implicit version 1 records.

## 6. Checkout flow

### Buyer preview

- Add an optional code field and “Aplicar” action to the paid registration dialog.
- Preview returns code validity, public base, existing price, promo price, savings, and final amount
  for that occurrence and current viewer. It is display-only and reserves neither a seat nor a
  promo use.
- If the promo price is higher than the existing price, open the existing responsive
  `DrawerDialog` pattern containing both amounts and leave the code unapplied until the buyer
  chooses.
- Drawer actions:
  - **Mantener precio actual — Bs 56:** close the drawer and do not apply the code.
  - **Aplicar código — Bs 63:** apply the code, store explicit acceptance in form state, and use the
    higher promo price.
- Use one generic invalid/unavailable response for inactive, unknown, out-of-window, wrong-program,
  and exhausted codes.
- The client sends only the entered code. It never sends percentage or authoritative totals.

### Authoritative checkout transaction

Extend `startPaidCheckout`:

1. Lock occurrences in existing deterministic order.
2. Re-read program, session, settings, buyer eligibility, and availability as today.
3. Resolve the public base and existing eligibility price for each line.
4. When a code is present, resolve it within the purchase's program and lock its row.
5. Revalidate active state, time window, and maximum-consuming-uses availability.
6. Calculate the independent promo price from public base and compare it with the existing price.
7. If the promo is worse, require `acceptsHigherPromoPrice: true`; otherwise reject checkout and
   require the drawer decision again. Client preview alone is not sufficient.
8. Insert purchase, lines, redemption, and the existing `created` purchase event atomically.
9. For a positive total, continue to the current hold/voucher flow.
10. For a zero total, insert the approved purchase and ticket atomically, then send the existing
    free-registration email after commit.

Keep lock order consistent everywhere: occurrences ascending, then promo code. No promo mutation
may lock these in the reverse order.

Idempotency remains purchase-key based. A replay must return the existing outcome and must not
create a second redemption or consume another limited use.

## 7. Admin dashboard

Add `/dashboard/programs/promo-codes`, with a link from the programs dashboard and program detail.

List view:

- Code, program, partner, percentage, active/date status.
- Confirmed uses, in-progress uses, released attempts, and max-use availability.
- Gross public-base amount, discount granted, and net approved amount.
- Create, edit allowed fields, and activate/deactivate. Filters and one-click copying are follow-up
  usability refinements, not required for attribution correctness.

Detail/drill-down:

- Purchaser name/email, session, occurrence, purchase id, purchase status.
- Base, discount, final amount, checkout date, approval date.
- Admin change history.

Use confirmed uses as the headline “uses” number. Show in-progress separately so operations can
explain why a limited code temporarily appears full.

All reads and mutations require `admin` or `festival_admin` on the server. Route visibility alone
is not authorization.

## 8. Buyer and operations presentation

Update every financial surface to show a consistent breakdown:

- Registration dialog: public base, existing price, promo price, warning when worse, and total.
- Purchase/voucher page: same breakdown and exact payable amount.
- Voucher review card and admin roster: final amount plus promo attribution.
- Buyer profile purchase card and emails: code and savings where money is shown.
- Analytics: promo applied boolean and promo id; avoid the raw code as a high-cardinality property.

The exact-amount payment QR lookup already uses `purchase.totalAmount`; no QR service change is
needed once the transaction persists the rounded total.

## 9. Delivery sequence

### Increment 1 — contracts and migration

- Apply the §11 defaults.
- Update PRD, architecture, roadmap, and snapshot definitions.
- Add tables/relations/constraints and safe line backfill migration.
- Add pure promo normalization, validity, usage, and integer-rounding helpers with tests.

### Increment 2 — server checkout

- Add promo preview query/action.
- Extend checkout schema and transaction.
- Refactor shared zero-total purchase/ticket issuance so promo-zero and catalog-free paths cannot
  drift.
- Add transaction tests for code revalidation, idempotency, usage limits, and zero totals.

### Increment 3 — buyer experience

- Add code entry/preview and price breakdown.
- Update purchase page, voucher view, profile cards, email inputs/templates, and analytics.
- Test signed-in participant, ineligible signed-in user, and guest journeys.

### Increment 4 — admin and reporting

- Add authenticated code management and audit actions.
- Add aggregate list and redemption drill-down.
- Add filters, empty/error states, and mobile table behavior.

### Increment 5 — hardening and rollout

- Concurrency test final promo use and final seat together.
- Verify expired holds release limited-code capacity without waiting for the sweep.
- Add reconciliation query for purchase/redemption/amount mismatches.
- Roll out behind `paid_programs`; codes start inactive and are activated after a rehearsal.

## 10. Acceptance criteria

- Code lookup is case-insensitive and scoped to the current program.
- Invalid, inactive, early, expired, wrong-program, or exhausted code never changes the price.
- Public, active-participant, and guest buyers receive the promo calculated independently from the
  public base price.
- A participant price of Bs 56 from a Bs 70 base plus a 50% promo produces Bs 35, never Bs 28.
- A promo price above the existing price opens a drawer comparing both amounts.
- Choosing “Mantener precio actual” leaves the code unapplied and charges the lower existing price.
- Choosing “Aplicar código” records explicit acceptance and charges the higher promo price.
- A direct checkout request cannot bypass the explicit higher-price acceptance.
- A computed amount with cents rounds down to a whole boliviano.
- Client-supplied price or percentage cannot affect the charged amount.
- Purchase subtotal, discount, total, line amounts, and redemption snapshot reconcile.
- Two checkouts competing for the last allowed use cannot both receive it.
- A failed/expired pre-approval purchase releases a limited use; an approved purchase keeps it.
- Retry creates one purchase and one redemption.
- A zero total creates no hold or voucher and issues exactly one ticket.
- Admin counts match purchase states and can drill into every use.
- Editing/deactivating a code never changes historical purchase attribution or amounts.
- Existing purchases and existing reservation discount codes behave unchanged after migration.

## 11. Adopted MVP decisions

Resolved requirement:

- **Worse promo:** open a drawer. The buyer either keeps the lower existing price without applying
  the code or explicitly applies the code and accepts its higher price. Persist the acceptance.

Implemented defaults:

1. **Rounding:** floor the promo price per session line. Alternative: floor only the
   calculated discount amount.
2. **Limits:** include optional overall max uses; no per-buyer limit in MVP.
3. **Discount type:** percentage only in MVP. Fixed-amount program promos can be added later.
4. **Scope:** one whole program. Session-specific codes and cross-program codes are out of MVP.
5. **Attribution:** referral partner is required free text; no payout/commission accounting.

## 12. Out of scope

- Influencer accounts or a partner self-service portal.
- Commissions, balances, or payouts.
- Applying/removing a code after purchase creation.
- Multiple stacked promo codes.
- Automatic referral cookies or cross-device attribution.
- Reworking the existing festival/reservation discount-code system.
- Completing the remaining Phase 5 program operations.
