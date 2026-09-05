# PRD: Reservation Credits and Optional Features

**Product:** Glitter

**Feature area:** Credits, stand reservations, full tables, illustration partners, reservation release

**Status:** Phases 0–5 delivered. Phase 6 (rollout) is what remains; see §16 for per-phase status and open items.

**Last updated:** 2026-09-04

**Depends on:** [PLAN-stand-reservation-hardening.md](./PLAN-stand-reservation-hardening.md)

**Related:** [PRD-stand-reservations.md](./PRD-stand-reservations.md), [PRD-multi-payment-access.md](./PRD-multi-payment-access.md)

---

## 1. Summary

After reservation hardening, Glitter will introduce a credit wallet and three optional reservation features:

1. **Full table:** an illustration or entrepreneurship participant can attempt to reserve the two half-stands that form one physical table. _(Delivered.)_
2. **Late partner addition:** the owner of a live illustration reservation can add one illustration partner after booking and before a configurable deadline. _(Delivered.)_
3. **Reservation release:** the owner of an unpaid reservation can pay to give it up, freeing the stand and themselves to book something else. _(Delivered.)_

These are optional features, not penalties or sanctions. Each feature is paid only with Glitter credits. Participants buy credits before starting an action; purchasing credits does not start, reserve, or complete the action.

Participant-facing copy is Spanish and uses voseo.

---

## 2. Locked product decisions

| Topic                       | Decision                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credit value                | `1 credit = Bs 1`, represented with two decimal places.                                                                                                         |
| Credit ownership            | Global user balance; owner-only, non-transferable, non-cashable, non-expiring.                                                                                  |
| Initial spending scope      | Reservation invoices and the three features in this PRD. Other Glitter purchases are future scope.                                                              |
| Credit purchase             | Separate prerequisite. Credits are sold only for the optional features and for settling debt — never for a reservation invoice.                                 |
| Purchase window             | User has 10 minutes to upload a voucher. No credits if the window expires without upload.                                                                       |
| Availability after upload   | Uploaded voucher immediately creates provisional credits, spendable on everything credits can buy — feature actions and positive reservation invoices alike.    |
| Rejected voucher            | Append a credit reversal. Provisional credits already spent can produce a negative balance. Never reverse a completed feature action automatically.             |
| Feature payment             | Feature actions debit credits. No direct voucher or payment-review wait exists inside a feature action.                                                         |
| Reservation invoice credits | User chooses whether to apply credits. MVP applies the maximum usable amount, not a custom amount.                                                              |
| Discounts                   | Credits are payment tender, not discounts. Apply discounts first, then credits.                                                                                 |
| Full-table eligibility      | Illustration and entrepreneurship only.                                                                                                                         |
| Full-table meaning          | One stand is half a table: `120 cm × 60 cm`. Two paired stands are a full table: `240 cm × 60 cm`.                                                              |
| Full-table identity         | An admin-declared `stand_groups` row with `type = full_table` canonically pairs exactly two stands. Never infer pairing from geometry.                          |
| Full-table guarantee        | Credits grant permission to try while availability lasts. They do not guarantee any full table or location.                                                     |
| Full-table purchase timing  | Buying credits happens before the map. Activation may also happen at stand selection, for somebody whose balance already covers the fee.                        |
| Full-table fallback         | If the companion half is unavailable, the selected half remains reservable. Repeated confirmation must state that only one half will be booked.                 |
| Full-table charge           | Earmark credits at activation; debit only when a two-stand reservation is confirmed. Release the earmark when the user confirms one half or deactivates access. |
| Full-table stand price      | A declared pair carries its own `stand_groups.full_table_price`. It replaces both halves' prices on the reservation invoice; the access fee is separate.        |
| Full-table payment failure  | No automatic downgrade or second-stand release if the source credit voucher is later rejected. Admin resolves manually.                                         |
| Illustration pricing        | Every illustration stand has an individual price and a shared price. Shared price is the total for both participants and remains owner-paid.                    |
| Late partner price          | `shared price snapshot - individual price snapshot + feature access price`, all paid in credits.                                                                |
| Existing payment            | Adding a partner never rewrites the original individual reservation invoice or payment.                                                                         |
| Existing discount           | Never applies to the shared-price difference or late-partner feature price.                                                                                     |
| Late partner eligibility    | Illustration only, owner only, one partner maximum, any live reservation.                                                                                       |
| Late partner deadline       | Admin-configurable; default is 21 days before the earliest festival start. At/after the deadline the feature is hidden and unavailable.                         |
| Release scope               | One festival-configured credit price releases a `pending` reservation and all registered participants on it. Owner only, unlimited, credits only.               |
| Blocking statuses           | Every terminal reservation is `rejected` and blocks permanently, whatever ended it. Only `released` is non-blocking, and only `pending` can reach it.           |
| Fulfillment                 | Partner addition and release execute immediately with credits. A later credit reversal creates debt but does not undo the action.                               |
| Release eligibility         | `pending` only. Never from `verification_payment`, `accepted`, or any terminal status — those are refund questions, not stand choices.                          |

There are no remaining product questions blocking implementation. Two decisions above were revised during implementation and are recorded here as they now stand: provisional credits are spendable on reservation invoices as well as features, and a declared pair carries its own table price.

---

## 3. Domain language

- **Credit top-up:** purchase of credits by voucher.
- **Provisional credits:** credits created immediately after voucher upload, spendable on anything credits buy while their voucher waits for review.
- **Confirmed credits:** credits whose voucher was approved, or credits granted through another final admin operation. Approval changes what the wallet reports, not what the participant may spend.
- **Credit hold:** an earmark. It reduces spendable balance without removing credits from the ledger.
- **Credit spend:** an immutable debit assigned to an invoice or feature action.
- **Credit reversal:** an immutable debit created after a top-up rejection.
- **Credit debt:** a negative balance caused by reversing provisional credits that were already spent.
- **Feature configuration:** festival-specific availability, price, and optional deadline.
- **Live reservation:** a reservation still in its active lifecycle — `pending`, `verification_payment`, or `accepted`; excludes `rejected` and `released`.
- **Released reservation:** an unpaid reservation whose owner paid a fee to give it up. Retained as history, occupies no stand, and blocks nobody.

Do not use `penalización`, `multa`, or refund language in participant UX. Credit top-ups are non-refundable purchases; unused credits remain in the wallet.

---

## 4. Credit wallet

### 4.1 Balance rules

The ledger is canonical and append-only.

```text
ledger balance = sum(posted ledger entry amounts)
spendable balance = ledger balance - sum(active holds)
under-review issuance = sum(under-review top-up issuance amounts)   # reported, not withheld
```

Rules:

- Positive amounts issue credits; negative amounts spend or reverse them.
- Posted entries are never edited or deleted. Corrections use compensating entries.
- Holds are separate from ledger entries because they do not spend credits.
- Negative ledger balance is allowed only as the result of a reversal/admin correction.
- A user with negative balance cannot apply credits, activate a feature, or start a credit-funded action.
- Top-ups first settle negative balance. Only the remainder becomes spendable.
- There is no confirmed-only tier. The spendable balance funds feature actions and positive reservation invoices alike, whether or not its top-up has been reviewed. `under-review issuance` is shown to the participant and the admin so both know how much of the balance is still unverified; it is not deducted.
- The reason is that both paths already share one recovery: a bad voucher is reversed, the wallet goes into debt, and an admin resolves it. Withholding credits from invoices only added a second waiting state — a participant with money in the wallet and an unpaid reservation — without removing that machinery.
- Server transactions calculate all balances and amounts; the browser never supplies an authoritative price.

### 4.2 Credit top-up flow

Credit purchase is a separate operation performed before the user starts a feature action.

1. Resolve the selected feature or invoice and its current server-authoritative shortfall.
2. Create one exact-amount top-up session with a 10-minute upload deadline.
3. Do not reserve a stand, partner, feature deadline, or other domain resource.
4. User uploads the voucher before the deadline.
5. In the authoritative UploadThing `onUploadComplete` callback, persist the voucher submission and append a provisional credit issuance in one transaction, using `fileKey` as an idempotency key.
6. Make the credits immediately spendable, on features and on positive reservation invoices alike. Show the top-up as under review wherever the balance is reported, so nobody mistakes an unverified voucher for a settled one.
7. A top-up opened from a full-table screen activates that feature on issuance rather than asking the participant to press `Activar` afterwards. Best-effort: a refusal there leaves the credits spendable and the panel offering activation the ordinary way.
8. Admin reviews the top-up asynchronously through an explicit credit-top-up review command.

If the upload deadline expires, the top-up session expires and issues no credits. Creating a top-up before a feature deadline does not extend that feature deadline.

MVP top-up amounts:

- Feature: exact difference between required credits and the current spendable balance. For a late partner that difference is the whole action — the shared-price difference plus the fee — not the festival's configured price alone.
- Negative balance: exact amount required to restore the balance needed for the intended operation.
- No arbitrary wallet top-up amount.
- **Not a reservation invoice.** A participant short of the invoice total pays it the ordinary way, by QR. Offering to sell them credits on the payment screen puts a second purchase in front of the one they came to make, and it buys nothing the QR does not. Credits pay an invoice only when the participant already has them.

### 4.3 Admin review

Approval settles the top-up's own status and does not change the ledger balance a second time. It grants no new spending power, because provisional credits were already spendable.

Rejection:

1. Mark the top-up rejected with reviewer, time, and reason.
2. Append one idempotent reversal equal to the issued amount.
3. If credits remain unused, the reversal simply removes them.
4. If credits were spent, allow the wallet to become negative.
5. Keep every completed credit-funded action unchanged — a feature action, and equally a reservation invoice those credits already fulfilled. The debt is the only consequence; the domain does not move.
6. Block future credit use until the debt is resolved.

Admin resolution options are explicit and audited:

- Approve a replacement voucher.
- Mark the amount paid.
- Waive all or part of the debt.
- Perform a safe manual domain correction where policy permits it.

There are no automatic downgrades, partner removals, reservation cancellations, or release reversals.

### 4.4 Applying credits to reservation invoices

- Only the invoice owner can apply credits.
- The participant explicitly chooses `Usar mis créditos`. The option appears only when they hold a usable balance; the payment screen never offers to sell them one.
- MVP applies `min(spendable balance, invoice outstanding amount)`.
- The allocation transaction locks and rechecks the account, refuses a negative balance, debits the spendable balance, and records the exact invoice allocation.
- Outstanding amount is derived canonically as `invoice amount - approved cash payments - posted credit allocations`.
- A partial allocation reduces the outstanding amount; normal voucher payment remains available for the remainder. Admin approval of that voucher fulfills the invoice only when the full canonical amount is covered.
- A full credit allocation of a positive-value invoice marks it credit-paid and immediately runs its normal fulfillment effect.
- A genuine zero-value invoice created by a discount/free entitlement still follows the hardening plan's `zero_value_entitlement` admin-review flow. Credits do not bypass it.
- The invoice, discounts, payments, and credit allocations remain separate immutable records.
- Rejection still appends the full top-up reversal. Credits already spent — on a feature or on an invoice — become wallet debt. Neither the feature action nor the invoice is reopened or reversed.

The current invoice model assumes one settlement path. Phase 1B extends the hardened settlement service after the Phase 1A credit foundation exists, supporting mixed tender and calculating fulfillment from canonical approved payments plus posted credit allocations.

### 4.5 Persistence

```text
credit_accounts
  user_id primary key
  cached_balance numeric(12,2)
  version
  updated_at

credit_ledger_entries
  id
  user_id
  amount numeric(12,2)
  type: top_up | spend | reversal | admin_grant | admin_adjustment
  status: posted
  top_up_id nullable
  feature_action_id nullable
  reverses_entry_id nullable (self FK)
  idempotency_key unique
  metadata jsonb
  created_at

credit_holds
  id
  user_id
  festival_id
  amount numeric(12,2)
  purpose: full_table_access
  status: active | captured | released | expired
  feature_action_id unique FK reservation_feature_actions
  expires_at nullable
  idempotency_key unique
  created_at
  updated_at

credit_top_ups
  id
  user_id
  amount numeric(12,2)
  status: awaiting_voucher | under_review | approved | rejected | expired
  intended_use_type: feature | debt   # `invoice` is historical; nothing writes it
  intended_use_id nullable
  intended_feature_type nullable      # which feature a `feature` top-up funds
  upload_deadline_at
  voucher_url nullable
  file_key nullable
  submitted_at nullable
  reviewed_by_user_id nullable
  reviewed_at nullable
  rejection_reason nullable
  idempotency_key unique
  created_at
  updated_at

invoice_credit_allocations
  id
  invoice_id
  user_id
  amount numeric(12,2)
  ledger_entry_id unique
  idempotency_key unique
  created_at
```

`cached_balance` is a locked projection for efficient writes, not a replacement for the ledger. Add reconciliation that compares it with posted entries and active holds.

`credit_holds.feature_action_id` is the unique foreign key to `reservation_feature_actions`. It enforces the one-to-one full-table access relationship: one action owns at most one hold. Capture and release always resolve the hold through that action identifier.

Every link between a ledger entry and what it paid for is owned by the entry or by the allocation, never duplicated on both sides: `credit_ledger_entries.top_up_id` and `reverses_entry_id` carry the top-up lifecycle, and `invoice_credit_allocations.ledger_entry_id` carries the invoice side. Partial unique indexes on the entry side enforce one issuance and one reversal per top-up, and one spend per feature action, so a duplicate is a constraint violation rather than a reconciliation finding.

---

## 5. Festival feature configuration

Admins configure prices as credits, numerically equal to bolivianos.

| Feature               | Scope               | Required configuration                                                |
| --------------------- | ------------------- | --------------------------------------------------------------------- |
| Full-table access     | Festival + category | Enabled and price; only illustration/entrepreneurship                 |
| Late partner addition | Festival            | Enabled, feature price, optional deadline override; illustration only |
| Reservation release   | Festival            | Enabled and price                                                     |

Rules:

- Amounts are `numeric(12,2)`, non-negative.
- A feature is unavailable until enabled with valid configuration.
- Configuration changes affect future activations/actions only. Active access and submitted actions use snapshots.
- The late-partner panel always shows the effective deadline.
- Default deadline: earliest `festival_dates.start_date` minus 21 days.
- If the festival has no start date and no override, late partner addition is unavailable.
- At/after the deadline, hide the participant feature entirely and reject direct server calls. Do not advertise an action that can no longer finish.
- Full-table access is not offered when no configured full table currently has both halves available.

Recommended table:

```text
festival_reservation_features
  id
  festival_id
  type: full_table | late_partner | reservation_release
  category nullable
  enabled
  credit_price numeric(12,2)
  deadline_override_at nullable
  updated_by_user_id
  created_at
  updated_at
```

Unique key: `(festival_id, type, category)` with nulls treated as equal. Database checks restrict category/deadline combinations by type.

---

## 6. Illustration individual and shared prices

### 6.1 Configuration

Illustration stands require two total reservation prices:

- **Individual price:** one registered participant.
- **Shared price:** owner plus one illustration partner.

The shared price is the total price for the reservation, not a per-person price. The owner remains the only payer.

Rules:

- Illustration: `shared price >= individual price >= 0`.
- Admin can edit prices individually and in bulk.
- Full-table pair pricing is category-specific:
  - Illustration: both halves must have the same individual price and the same shared price.
  - Entrepreneurship: both halves must have the same individual price. Ignore `shared_price`, or explicitly disallow it.
- Entrepreneurship and other categories continue using one price unless expanded later.
- Hold/reservation creation snapshots both applicable illustration prices, even if booking individually.
- Initial invoice uses the price matching the number of participants confirmed during booking — **unless the reservation is a full table**, which is priced as its own product. See §7.1.
- The server derives all prices from stand/festival data.

Stand additions:

```text
stands
  individual_price numeric(12,2)
  shared_price numeric(12,2) nullable

stand_holds / stand_reservations
  individual_price_snapshot numeric(12,2)
  shared_price_snapshot numeric(12,2) nullable
  full_table_price_snapshot numeric(12,2) nullable   # set only for a two-stand aggregate
  booked_participant_count
```

`individual_price` is the single source of truth, backfilled from `stands.price`. `price` survives as a migration adapter that every writer keeps equal to `individual_price`; removing it is still outstanding. Before enabling late partner addition, admins must configure valid illustration shared prices.

### 6.2 Adding a partner to an already-paid individual reservation

The original invoice/payment remains immutable. Create a new credit-paid reservation adjustment containing:

```text
shared price difference = shared price snapshot - individual price snapshot
amount due = shared price difference + late-partner feature price snapshot
```

- Both components are charged in credits in one atomic action.
- Original discounts apply only to the original invoice.
- No discount is copied to either adjustment component.
- The adjustment is owner-paid and visible to the added partner under the existing `owner pays, partner sees` policy.
- Store both components separately for audit/reporting even if one credit spend covers the total.

---

## 7. Feature A — Full table

### 7.1 Physical model and admin setup

One stand represents half a physical table (`120 cm × 60 cm`). A full table contains exactly two explicitly paired stands (`240 cm × 60 cm`). Never infer a pair from map coordinates.

Extend the existing `stand_groups` model with `type: visual_group | full_table`, defaulting existing rows to `visual_group`. The current `stands.stand_group_id` relation remains canonical membership. A `full_table` group requires:

- Exactly two stands.
- Same festival, sector, category, participation type, and subcategory eligibility.
- Category is illustration or entrepreneurship.
- Matching prices by category: illustration pairs share identical individual and shared prices; entrepreneurship pairs share identical individual prices only (`shared_price` ignored or disallowed).
- Valid group membership and map placement, including alignment on the map.
- A `full_table_price`. A pair without one is not reservable as a table: the companion cannot be billed, so either half books on its own as if it were never paired.
- No conflicting live occupancy when changing the pair configuration.

Admin UI creates/edits the group and identifies malformed pairs and their exact mismatch. The server transaction locks the group and both stands, validates exactly two members, then changes the type. Direct writes cannot make an invalid group reservable.

Addition:

```text
stand_groups
  type: visual_group | full_table
  full_table_price numeric(12,2) nullable   # required to declare a full_table
```

**A full table is a priced product, not the sum of its halves.** `full_table_price` replaces both halves' individual/shared prices on the reservation invoice — the aggregate occupies two stands and is billed once, for the table. Only a half-table booking falls through to §6.1's participant-count rule. This is separate from, and additional to, the credit access fee in §7.3: the fee buys permission to try, the table price is what the reservation costs. Turning a group back into a `visual_group` clears the price.

Two consequences worth stating: a two-person full table is billed the table price, not the shared price; and an admin downgrade (§7.7) has to reprice the invoice down to a single half, because the reservation is no longer the product it was billed for.

Exactly-two membership is a cross-row invariant enforced by the canonical admin service and checked by the reservation health report. Each stand can belong to only one group through its existing `stand_group_id`, so resolving either half's companion is unambiguous.

### 7.2 Participant entry before reservation

The full-table decision happens before the high-friction map flow.

Primary entry:

1. Participant accepts festival terms.
2. Show a dedicated optional full-table screen when category/configuration/availability permit it.
3. Explain dimensions, price, and that payment grants only permission to try while availability lasts.
4. `Ahora no` continues to normal reservation without changing eligibility.

Persistent entry:

- Before booking, show a `Preparar mesa completa` action in the festival participant portal/reservation entry page.
- A participant who initially declined can return and activate it later.
- Do not show voucher upload, top-up checkout, or an upsell inside the stand map.

If credits are insufficient, the participant leaves the feature flow, buys the exact shortfall, uploads the voucher, and returns after credits are issued. No stand is protected during this purchase.

### 7.3 Activation and credit hold

Activation is owner-only, festival-specific, and non-transferable.

1. Require eligible category, enabled configuration, at least one currently complete table, no negative balance, and sufficient spendable credits.
2. Snapshot the configured access price.
3. Create a full-table `reservation_feature_actions` row and an equal active credit hold atomically, linking the hold with unique `feature_action_id`.
4. The held credits remain in the wallet but cannot be spent elsewhere.
5. Allow the user to enter the reservation map immediately.

The hold prevents a participant from activating the feature and spending those credits on another invoice before confirming a table. It is not a charge.

This credit hold is independent from the hardening plan's configurable stand-capacity hold (default five minutes):

- Credit hold protects money allocated to the feature.
- Stand hold temporarily protects physical capacity.
- Expiration or replacement of one must not accidentally release/capture the other.

Hold outcomes (always resolve the hold by the linked `feature_action_id`):

- Confirm two paired stands: capture the hold as a credit spend.
- Confirm only one stand: release the hold; credits become spendable and may be applied to the stand invoice if the owner chooses.
- User deactivates before booking: release the hold.
- Reservation window/festival access ends without booking: expire/release the hold.
- Temporary stand-capacity hold expires while the user is still trying: keep full-table access/credit hold active so they can try another available table.

Credit purchase remains non-refundable. Failure to obtain a full table does not return fiat; the unspent credits remain available in the wallet.

### 7.4 Map behavior

With active full-table access:

- Selecting either member resolves its companion server-side.
- If both halves are available, offer **both**: taking the whole table and taking just this stand. Access means the participant may take the pair, not that they must — §7.3 lists confirming one stand as a normal outcome, so the map has to let them say which they meant. The table is the primary choice, since it is what they paid for.
- If the companion is unavailable, still allow the selected half.
- Never make the participant return to credit purchase from the map.

Somebody who has **not** activated, but whose balance already covers the fee, is offered activation here too, beside the plain stand. This is not the financial setup §7.2 keeps out of the map: no voucher, no checkout, no upsell to somebody who would have to buy. It spends credits already held, in one click, instead of sending a funded participant back out to the panel and in again. Anyone short of the fee is not offered it — they go to the panel, where the purchase lives.

The half-table fallback must be explicit at multiple stages:

1. Stand detail/selection state.
2. First confirmation modal.
3. Final reservation summary before commit.

Suggested copy:

> Esta mesa ya no está disponible completa. Podés reservar solo el espacio {stand} o elegir otra mesa.
> Vas a reservar un solo stand (media mesa, 120 × 60 cm), no la mesa completa. Tus créditos no se usarán y podrás aplicarlos al pago de tu reserva.

Never phrase the fallback as `medio stand`. §2 defines one stand as half a table, so `medio stand` names half of a 120 × 60 space — a quarter table, which does not exist. The unit is `un stand`, equivalently `media mesa`.

The server rechecks current availability at each capacity mutation. UI availability is informational.

### 7.5 Table graphics

Use [stand-table-half-60x120.svg](../public/img/stand-table-half-60x120.svg) as the visual reference. Preserve its isometric angle and visual language.

Required accessible variants:

- Half table: `120 × 60 cm`.
- Full table: `240 × 60 cm`, both halves highlighted.
- Full table unavailable: selected half highlighted; unavailable companion muted/hatched.
- Full table selected: visible center boundary so users understand it contains two stands.

SVG is supplementary. Every state also needs text, stand labels, dimensions, and non-color cues.

### 7.6 Atomic capacity and reservation

Full-table capacity must be one aggregate, not two unrelated reservations.

1. Resolve pair from the selected stand.
2. Lock both stands in ascending ID order.
3. Reconcile expired capacity holds.
4. Revalidate pairing, eligibility, status, and both-stand availability.
5. Create one capacity hold with two member stands.
6. At reservation confirmation, create one reservation with two stand members.
7. Capture the full-table credit hold for the linked `feature_action_id` in the same transaction.
8. Create one normal reservation invoice at the pair's `full_table_price` snapshot (§7.1), not at the halves' individual/shared price. A hold that reaches confirmation with no full-table price snapshot is a conflict, not a table sold at half price.

Extend `confirmStandHold` rather than creating a parallel confirmation path. It must keep the hardening plan's owner, festival, enrollment, current terms, sanctions, price snapshot, idempotency, outbox, and post-commit behavior for every member stand.

The second half does not create a second reservation or second invoice. One aggregate, one invoice, priced for the table.

If either stand loses availability before the two-stand hold is created, return a normal availability conflict and offer the selected half if it remains free. Never persist a partial two-stand hold.

### 7.7 Rejected provisional credits

If the voucher that funded consumed full-table credits is later rejected:

- Reverse the credits, potentially creating debt.
- Keep the two-stand reservation unchanged.
- Do not automatically downgrade, release the companion half, or cancel the reservation.
- Admin may request replacement payment, mark paid, waive debt, or manually downgrade when safe.
- A manual downgrade retains the originally selected half — member position 0 — and releases only the companion half; it must lock/revalidate occupancy and record an audit event.

The downgrade also reprices, because the reservation was billed for a table it no longer is (§7.1):

- The invoice drops to the price of what remains — the shared price when the reservation was booked for two, otherwise the individual price — and keeps honouring any discount already agreed, clamped to the new total so `amount = original_amount - discount_amount` still holds.
- It refuses outright when the invoice already has a payment row or a posted credit allocation. Money against the table's price would have to be refunded or re-applied, and that decision is not this command's to make.
- The released half's membership row is retained with `released_at` stamped, so the reservation's original shape stays queryable.
- The access fee is not returned. The participant had the permission to try and used it.

There is a matching correction for access that was never spent: an admin can release somebody else's abandoned full-table activation, dropping the earmark. An activation only the participant can undo is unreachable once they stop coming back — and the one whose voucher was rejected has the least reason to. Releasing posts no ledger entry; it frees only credit that is still there.

---

## 8. Feature B — Late illustration partner

### 8.1 Availability

Show `Agregar compañero` only when all are true:

- Current user is the canonical reservation owner.
- Reservation category is illustration.
- Reservation is live.
- Reservation currently has exactly one registered participant.
- Feature is enabled/configured.
- Current time is before the effective deadline.

At or after the deadline:

- Hide the feature and any credit-purchase prompt for it.
- Reject direct server action calls.
- Credits purchased earlier do not extend the deadline.
- Existing credits remain usable elsewhere.

### 8.2 Partner eligibility

The partner must:

- Be a different verified illustration participant.
- Meet the current festival enrollment, terms, category, and sanction rules.
- Have no conflicting blocking reservation/participation in the festival.
- Not already be the partner on another live reservation.

Reuse the canonical partner-search and transactional eligibility rules created by reservation hardening. Adding a partner late changes timing only; it does not weaken partner eligibility.

### 8.3 Credit prerequisite and execution

The owner must have sufficient spendable credits before starting the partner action. If not, they buy the exact shortfall first; no partner is selected or claimed during the top-up.

Once funded:

1. Start the partner flow and select an eligible participant.
2. Show the shared-price difference and feature price separately.
3. Confirm the total credit debit and owner-payment responsibility.
4. In one transaction, acquire every applicable lock class in the §14 canonical total order for the owner and selected partner; skip unused classes without reordering the remaining classes.
5. Revalidate live status, deadline, one-participant state, partner eligibility, price snapshots, and balance.
6. Debit `shared difference + feature price`.
7. Create a credit-paid reservation adjustment with both components.
8. Insert the partner exactly once and append audit/notification events.

There is no long-lived partner claim and no payment-review waiting state. A race can occur only between selection and final confirmation. If the partner becomes unavailable, perform no debit and no participant mutation; ask the owner to choose another eligible partner.

### 8.4 Immutability

- The original individual invoice/payment remains unchanged.
- Partner fulfillment is immediate and idempotent.
- Owner cannot replace or remove the partner through self-service.
- Neither participant can change the stand, price snapshots, full-table mode, or ownership.
- Reversal of provisional source credits creates owner debt but does not remove the partner automatically.

---

## 9. Feature C — Reservation release

Release is a **change fee**, not a way back from a block. It lets the owner of
a reservation they have not paid for yet give it up, for a price in credits,
so they can do something else with their participation.

The cases it exists for:

- The stand is in the wrong sector, or is simply not the one they wanted.
- They picked the wrong stand by mistake.
- An illustrator would rather join another illustrator's stand as their
  partner than hold one of their own.

Without a fee, any of these would be a free stand swap, and participants would
churn the map hunting for a better spot while genuinely decided people wait.
The credits are the friction. There is no other way to release a reservation —
credits are the only tender, and an admin does not do it on request.

### 9.1 Status meaning

| Status     | Meaning                                                  | Occupies stand | Blocks later participation |
| ---------- | -------------------------------------------------------- | -------------: | -------------------------: |
| `pending`  | Booked, not yet paid. The only releasable state.         |            Yes |           n/a — it is live |
| `rejected` | The reservation ended, for any reason at all             |             No |                    **Yes** |
| `released` | The owner paid to give it up before paying for the stand |             No |                         No |

**Every terminal reservation blocks its participants permanently, whatever
ended it** — a deadline that passed, a terms violation, a participant who
wrote in asking to cancel, an administrative decision. All of them are
`rejected`, and none of them can be bought back. Only an admin lifts one, by
hand, as an exception. There is no self-service path out of a terminal
reservation, and release must never become one.

`released` is the single non-blocking historical status, and it is reachable
only from `pending`. That is what makes it safe: a released reservation was
never paid for and never terminated, so letting its owner book again returns
them to exactly where they started.

The `cancelled` value exists in the `reservation_status` enum from the Phase 0B
migration and is unused. Nothing writes it. It is not a synonym for `released`
and must not become one.

### 9.2 Why only `pending`

Release is refused in every other live state, and the reason in each case is
money:

- `verification_payment` — a voucher is in flight. Releasing would mean
  deciding what happens to a payment under review, which is a refund question.
- `accepted` — they paid and the stand is theirs. Releasing would be a refund.
- `rejected` — terminal; see §9.1.
- `released` — already released.

Confining release to `pending` keeps it a decision about a stand rather than a
decision about money, which is the whole reason it can be self-service.

### 9.3 Availability

Show `Liberar reserva` only when:

- The current user is the canonical reservation owner.
- Reservation status is `pending`.
- The release feature is enabled and priced for the festival.

One release price covers the reservation and frees every registered
participant on it — a full table's two stands and an illustration pair's two
people alike. A partner sees the result but cannot pay for or start a release;
it is the owner's reservation to give up.

There is **no limit** on how many times a participant may reserve and release
within a festival. Each pass costs credits, and buying credits is the only way
to fund one, so the loop pays for itself.

Releasing a stand and immediately re-booking the same one is allowed. It costs
the fee and changes nothing, which is the participant's business — the flow is
identical to releasing and picking a different stand, and special-casing it
would only add a rule to explain.

### 9.4 Execution

The owner must buy any missing credits before starting. Buying credits does not
start or reserve a release.

In one transaction, using the §14 canonical total lock order for the owner and
every registered participant, skipping unused classes without reordering the
rest:

1. Acquire the applicable participant advisory, festival, user/enrollment,
   credit-account, feature-configuration, stand, reservation, invoice/payment,
   and credit-domain locks in canonical order.
2. Revalidate ownership, `pending` status, configuration, and sufficient
   balance with no debt. The status recheck under lock is what makes the race
   safe: a participant who submits a payment proof while the confirmation
   dialog is open must find the release refused, not applied to a reservation
   that is now awaiting verification.
3. Debit the snapshotted release price.
4. Record a credit-paid release action.
5. Transition `pending -> released` exactly once.
6. Release every member stand back to the map, atomically with the transition.
7. Cancel the reservation's invoice. A `pending` reservation has no approved
   payment against it by definition, so the shared invoice rule in §9.5 cancels
   it outright; if a payment row somehow exists, the release is refused rather
   than guessing at a refund.
8. Append a `reservation_released` event and notify the owner and every
   registered participant.

Release is a soft delete: the reservation, its participants, stands, invoice
and events all stay queryable. Participant flows never hard-delete reservation
history.

After release the owner and any partner are free to reserve again in that
festival — that is the point of the feature. They must still pass every normal
rule: profile completeness, enrollment, current terms, category eligibility,
sanctions, the reservation window, and whatever is actually still available.
Release buys a clean slate, not a stand.

If the credits that funded a release are later reversed, the reservation stays
released and the owner goes into debt for an admin to resolve. Never
re-block a participant automatically, and never restore a released stand.

### 9.5 Invoice handling across every closing path

Independent of which status a reservation ends in, and shared by every path
that closes one:

- The admin reservation delete/cancel action, the admin rejection action, and
  the payment-dashboard fallback cancellation all use the same shared
  transition.
- Lock the linked invoices and payments before the reservation transition.
- If an invoice has no payment row, cancel that invoice with the reservation.
- If any payment row exists, do not automatically change the invoice status,
  delete evidence, infer a refund, or infer forfeiture. Preserve the payment
  and leave the invoice for explicit admin resolution, because each paid case
  may have a different refund outcome.
- The payment-dashboard path with a submitted proof uses the admin
  settlement-rejection command. When the admin explicitly chooses
  `cancel_reservation`, that command is itself the resolution: reject the
  submitted proof, cancel the selected invoice, retain the payment and
  submission history, and close the reservation atomically.
- Self-service release is not one of these paths. It reaches only `pending`
  reservations, which carry no approved payment, and it never touches a
  payment, a settlement submission, or a refund decision.

---

## 10. Shared feature-action model

Recommended persistence:

```text
reservation_feature_actions
  id
  festival_id
  reservation_id nullable
  owner_user_id
  type: full_table_access | late_partner | reservation_release
  status: active | fulfilled | cancelled | failed
  feature_config_id
  feature_price_snapshot numeric(12,2)
  target_partner_user_id nullable
  individual_price_snapshot nullable
  shared_price_snapshot nullable
  credit_hold_id nullable
  credit_spend_entry_id nullable
  idempotency_key unique
  failure_code nullable
  fulfilled_at nullable
  created_at
  updated_at

reservation_feature_action_items
  id
  feature_action_id
  kind: feature_access | shared_price_difference
  amount numeric(12,2)
  description_snapshot
  created_at
```

Full-table access begins active before a reservation exists; attach `reservation_id` when fulfilled. The matching credit hold is linked by unique `credit_holds.feature_action_id`; capture and release use that identifier, not a separate access id. Partner/release actions are created and fulfilled in one transaction unless a business validation fails.

Use explicit amount columns for accounting. JSON metadata is limited to display snapshots and reason codes—never copied user profiles, vouchers, or secrets.

---

## 11. Multi-stand reservation foundation

Full tables require one reservation aggregate containing one or more stands.

```text
stand_holds
  id, owner, festival, expiration, price snapshots, idempotency

stand_hold_members
  hold_id
  stand_id
  position
  unique active stand membership per stand (delete-before-reuse)

stand_reservations
  id, owner, festival, status, source, price snapshots, idempotency

stand_reservation_stands
  reservation_id
  stand_id
  position
  released_at nullable
```

Rules:

- Backfill current holds/reservations with one member.
- Full-table holds/reservations have exactly two members from one valid pair.
- `stand_hold_members` is an active-capacity table, not membership history. It retains no inactive rows or lifecycle states.
- Before reusing a stand, expiration reconciliation must delete its expired hold aggregate and cascade-delete every member row. Cancellation, replacement, and successful confirmation perform the same aggregate/member deletion atomically before capacity can be reused.
- Enforce one active hold membership per stand with a unique `stand_id` constraint only under that delete-before-reuse invariant; never preserve an expired/replaced member row that could block a later hold.
- Enforce active reservation occupancy per member stand only when `released_at IS NULL` and the parent reservation status is `pending`, `verification_payment`, or `accepted`. Availability and audit queries use this exact predicate.
- Lock member stand IDs ascending.
- Capacity expiry/cancellation/rejection releases every active member atomically.
- DTOs expose `stands[]`; a temporary `primaryStand` adapter may support migration.
- Participants, invoices, activities, and feature actions attach to the one reservation aggregate.

The reservation-status occupancy predicate and participation-blocking predicate must be separate. `rejected` releases capacity while still blocking its registered participants; `released` releases both.

Required changes to the hardened single-stand baseline:

- Replace canonical `stand_holds.stand_id` with `stand_hold_members`; retain a temporary primary-stand adapter only during migration.
- Replace `stand_holds_stand_idx` with unique active membership per stand.
- Keep one hold aggregate per `(user_id, festival_id)`.
- Replace canonical `stand_reservations.stand_id` with `stand_reservation_stands`.
- Phase 0B's physical `stand_reservation_members` table is a single-member adapter. Before Phase 3, create `stand_reservation_stands`, backfill every adapter row with `position = 0` and `released_at = NULL`, validate the copied membership, then switch readers and writers. Remove the adapter's sync trigger and exactly-one-member constraint only after the switch.
- Establish member-level occupancy protection using `released_at IS NULL` plus the parent live-status predicate before dropping `stand_reservations_capacity_stand_unique` or the legacy adapter. Migrate availability and audit queries in the same release; keep the parent protection until the member protection is verified.
- Update the planned owner uniqueness predicate to the same live statuses. `rejected` and `released` are historical rows; policy determines whether the person remains blocked.
- Update effective-status reads, expiration reconciliation, health checks, DTOs, and admin commands to operate on every member.
- Add the `released` reservation enum state. (`cancelled` was added by the same migration and is unused; see §9.1.)
- Backfill every existing hold/reservation with exactly one member before dropping singular constraints/reads.

The existing hardening rule remains: any reservation history blocks participant self-service. Eligibility adds exactly one exception: a `released` reservation no longer blocks its registered participants, because it was given up before it was ever paid for. Admin-created reservations remain governed by their separate audited policy.

---

## 12. Participant UX

### Credit wallet

- Display total, held, spendable, and debt clearly.
- Report how much of the balance is still under review, as information rather than a restriction: those credits are spendable, and the participant should know which of them a rejection could take back.
- Distinguish an earmark that still has credits behind it from one whose credits were reversed. Releasing the first hands credits back; releasing the second hands back nothing, and offering both under the same words misreads as a refund.
- Explain that rejection may create an amount owed if credits are used.
- Show immutable history: purchase, use, hold/release, reversal, adjustment.
- Do not expose arbitrary top-up in MVP.

### Full-table preparation

- Offer on a dedicated screen right after terms acceptance, and from a persistent dismissible banner above the map and the pre-open countdown.
- Show half/full SVG comparison, dimensions, credit price, current balance, and availability disclaimer.
- State that buying/holding credits does not guarantee a full table.
- Map contains only space selection and confirmation—no financial setup.

### Reservation detail

Use `Acciones disponibles`, without suggesting the reservation is generally editable:

- `Agregar compañero`: illustration owner, live one-person reservation, before deadline only.
- `Liberar reserva`: owner of a `pending` reservation only, to give up the stand before paying for it.
- Show credit requirement and link to purchase missing credits before the action can start.
- Show completed feature actions and credit-funded adjustments.

Suggested copy:

> Tu reserva no se puede editar. Si olvidaste agregar a tu compañero, podés hacerlo hasta el {fecha} usando créditos.
> Liberar tu reserva te permite elegir otro espacio o sumarte como compañero de otra persona. El espacio vuelve al mapa y no se te cobra la reserva, pero los créditos de la liberación no se devuelven.

---

## 13. Admin UX

### Credit operations

- Queue of provisional top-ups awaiting review.
- Voucher details, issued/spent amount, current user balance, and affected actions/invoices.
- Approve, reject, accept replacement, mark paid, or waive debt with reason.
- Debt and ledger reconciliation report.
- No editable balance field; all changes append ledger entries.

### Festival reservation configuration

- Enable and price full-table access separately for illustration and entrepreneurship.
- Enable and price late partner addition; show/edit effective deadline.
- Enable and price reservation release.
- Audit actor/time and retain previous values through action snapshots.

### Stand editor

- Individual/shared price inputs for illustration, including bulk editing.
- Pair exactly two compatible stands as a reservable full table.
- Validate category-specific pair prices and configuration.
- Display pair identity and malformed-pair warnings.

### Reservation detail

- All member stands and original selected half, including any half a downgrade retired. _(Built.)_
- Manual full-table downgrade retaining the original half and releasing the companion, restricted to global admins and behind a confirmation that states what moves and what does not. _(Built.)_
- Explicit warnings before any manual domain correction. _(Built.)_
- Original invoice plus credit allocations/adjustments. _(Not built: allocations are visible in the wallet and the payments dashboard, not on reservation detail.)_
- Full-table, partner, and release action history. _(Not built.)_

---

## 14. Authorization, transactions, and races

- Owner-only: credit account, top-up, invoice application, feature activation/action.
- Full-table access cannot be transferred to another user or festival.
- Partner visibility follows `owner pays, partner sees`; partner gets no payment authority.
- Admin alone configures features, reviews top-ups, adjusts debt, and performs manual corrections.
- Festival admin remains read-only unless separately expanded.
- Every mutation accepts an idempotency key and is safe to retry.
- Extend—not replace—the hardening plan's canonical lock order. The total order for combined reservation/credit work is: participant advisory keys; festivals; terms; users/enrollment; credit accounts; feature configuration/table pairs; stands; capacity holds/reservations; invoices/payments; credit ledger entries; credit top-ups; credit holds; reservation feature actions. A workflow may skip unused classes but must never reorder the classes it uses. Lock IDs ascending within every class.
- Lock the credit account before checking spendable balance and posting a debit/hold.
- Credit-only top-up/review operations use the applicable subsequence from that same order: users; credit accounts; credit ledger entries; credit top-ups; credit holds; reservation feature actions.
- Database constraints remain the final protection against double occupancy, duplicate partner membership, duplicate credit reversal, and duplicate fulfillment.

Key race outcomes:

- Full table vs either half: one capacity winner; never a partial full-table hold.
- Same credit balance spent concurrently: one or both succeed only if locked balance covers both.
- Partner selected by two owners: one final transaction succeeds; loser is not charged.
- Deadline crosses during partner form: final server check fails with no charge/mutation.
- Duplicate top-up upload/review/action submission: one issuance, reversal, debit, and fulfillment.

---

## 15. Audit and notifications

Suggested events:

```text
credit_top_up_created
credit_voucher_submitted
credits_issued_provisionally
credit_top_up_approved
credit_top_up_rejected
credits_reversed
credit_debt_resolved
credit_hold_created
credit_hold_released
credits_spent
invoice_credits_applied
full_table_access_activated
full_table_reserved
full_table_fallback_confirmed
full_table_manually_downgraded
late_partner_added
reservation_released
```

Two of these are emitted as `stand_reservation_events` rows today: `full_table_manually_downgraded` and `invoice_credits_applied`. The rest of the credit and full-table lifecycle leaves no reservation event, because the append-only ledger, `credit_top_ups`, `credit_holds`, and `reservation_feature_actions` already record it with stronger guarantees than an event row would. Treat the list above as the vocabulary for anything that does need a reservation-scoped event, not as a second copy of the ledger.

Notifications:

- Owner: **top-up rejection only.** _(Built.)_
- All released participants: release completion. _(Built.)_ The owner chose the
  release and paid for it, so their copy confirms what they did and states the
  cost; a partner did not choose it, so theirs names who released it and quotes
  no price. Both say the space went back on the map rather than being held.
- Added partner and the owner who paid: after a successful addition. _(Built.)_ The partner did not ask for this, so their copy is an invitation that says they owe nothing; the owner's confirms the debit.

Buying credits notifies nobody, and neither does approving a voucher. The
purchase is synchronous — the participant watches the balance change and the
wallet shows the top-up as under review — so a receipt would restate what they
just saw. Approval grants no new spending power either, because the credits
were already spendable (§4.1); mailing about it would imply they had been
frozen. A rejection is the one outcome that arrives later, out of sight, and
the only one that can leave somebody owing money, so it is the one that gets an
email. It has to carry both halves of the news: the debt, and the fact that
whatever the credits already paid for still stands.

Admins are not mailed about the review queue either. They work from the queue
itself, which is the screen the decision is made on.

The rejection mail is deduplicated on the top-up rather than on a reservation:
credit jobs carry no `reservation_id`, so the outbox's default key would
collide across every purchase one person ever had rejected. A replayed
rejection reverses nothing and sends nothing.

Use canonical IDs and reason codes in audit metadata. Do not copy full profiles, voucher URLs, or sensitive payment data into event JSON.

---

## 16. Migration and delivery sequence

The hardening plan is the baseline, not parallel work. Phase 0 closed and verified the two remaining hardening gates below, then extended those services while preserving their authorization/idempotency contracts.

**Status as of 2026-09-04: phases 0 through 3 are delivered. Phases 4 and 5 have their schema and configuration in place and no behaviour behind them** — `IMPLEMENTED_FEATURE_TYPES` in `app/lib/festivals/feature-config.ts` names only `full_table`, so an admin cannot enable and price a feature no code implements. Each phase below carries its own status; open items are listed under the phase that owns them rather than removed from the spec.

### Prerequisite — Implemented reservation-hardening baseline

- Explicit reservation and settlement commands are canonical.
- Advisory/global lock order is active.
- UploadThing callbacks and notification outbox are the intended authoritative/durable paths; Phase 0A removes the remaining public proof-action bypass.
- The invariant report and required PostgreSQL race suite exist; Phase 0A runs them against safe targets and records clean results.
- Participant UI no longer uses legacy payment or generic reservation mutation paths.

Primary extension seams:

- `app/lib/reservations/hold-service.ts`: multi-member stand holds and confirmation.
- `app/lib/reservations/policy.ts` and `tx-eligibility.ts`: `released` as the only non-blocking historical status.
- Hardened payment/settlement service: mixed voucher/credit settlement and credit-paid fulfillment.
- `app/api/uploadthing/core.ts`: authoritative credit-voucher callback with distinct top-up semantics.
- Reservation notification outbox: credit and feature notifications.
- `scripts/audit-reservation-invariants.ts`: multi-stand, wallet, mixed-tender, and release invariants.

### Phase 0 — Reservation extension schema

#### Phase 0A — Final hardening closure

Complete these items before changing the reservation schema:

- Remove `app/lib/reservations/payment-actions.ts#submitPaymentProofAction`. No public Server Action or route may accept participant-supplied `voucherUrl`, `fileKey`, or an asserted `source`. `submitPaymentProof` remains server-only and is invoked for participant uploads only by the authoritative UploadThing `onUploadComplete` callback using callback-provided file metadata.
- Add an action export-surface regression test proving `submitPaymentProofAction` is absent. Keep tests proving `POST /api/payments` returns `410` and legacy payment mutation exports remain absent.
- Configure and migrate an isolated PostgreSQL database whose name contains `test` or `ci`; never point destructive integration tests at `railway`, development, or production.
- Run every race in `app/lib/reservations/prd-unblockers.integration.test.ts` without skips and require all to pass within their bounded deadlock timeout.
- Run `scripts/audit-reservation-invariants.ts` against the migrated test fixture and the authorized deployment target. Both runs must exit successfully with zero findings.

Phase 0A is a short preflight, not a parallel feature track. It adds no credits, pricing, full-table, partner, or release behavior.

#### Phase 0B — Reservation extension schema

- Multi-stand hold/reservation member tables with cardinality one initially.
- Separate capacity and participation-blocking predicates.
- Add `released`; every terminal status keeps blocking participation.
- Persist both illustration price snapshots.

Phase 0 is complete only when Phase 0A remains green after the Phase 0B migration and every existing hold/reservation has exactly one member row.

**Delivered.** The public proof-submission bypass is gone, `POST /api/payments` returns `410`, and the member tables, the separated capacity/participation predicates, and both illustration price snapshots are in place. The Phase 0B `stand_reservation_members` adapter has been dropped.

### Phase 1 — Credit foundation

#### Phase 1A — Credit accounting foundation

- Credit account, append-only ledger, holds, top-ups, invoice allocations.
- Ten-minute voucher upload and immediate provisional issuance.
- Admin review, reversal, negative balance, debt resolution.
- Reconciliation, authorization, idempotency, and concurrency tests for every credit mutation.

#### Phase 1B — Mixed-tender settlement integration

- Extend the hardened settlement service to derive outstanding amount from invoice amount minus approved cash payments and posted credit allocations.
- A full credit allocation fulfills immediately through the normal reservation fulfillment effect; a partial allocation leaves the voucher path open for the remainder.
- Never mark an invoice paid or its reservation accepted until canonical tender covers the invoice amount.
- Reject over-allocation and make credit application plus fulfillment idempotent under concurrent credit/voucher settlement.
- Add full-credit, partial-credit-plus-voucher, insufficient-tender, double-fulfillment, concurrency, reconciliation, and invariant-audit coverage.

Phase 1 is complete only when both the accounting foundation and mixed-tender settlement integration are green. Phase 1A persistence alone must not change invoice fulfillment behavior.

**Delivered.** Credit notification is deliberately one email — a rejected voucher — for the reasons in §15. It rides the existing outbox, whose write half now lives in `notification-queue.ts` so a service can enqueue a job without importing every email template and the server env schema.

### Phase 2 — Pricing and feature administration

- Individual/shared stand prices and bulk editor.
- Festival feature configuration and late-partner deadline.
- Full-table pair configuration/validation, including the pair's own `full_table_price`.

**Delivered.** The stands admin table declares and dissolves pairs, validates them by category, and reports malformed ones; the festival panel configures every feature scope and refuses to enable one no code implements.

### Phase 3 — Full table

- Pre-reservation activation and persistent entry.
- SVG variants and accessible fallback states.
- Credit hold/capture/release.
- Atomic two-stand capacity and reservation.
- Admin manual correction: downgrade to the original half, and release of an abandoned activation.

**Delivered.** Open items, none of them blocking:

- No automatic expiry of a full-table credit hold when the reservation window or festival access ends (§7.3, last outcome). The earmark persists until the participant deactivates or an admin releases it on their behalf. There is no cron for it alongside `standHoldExpiration`.
- The full-table integration suite has no case for §17's "capacity-hold expiry preserves access".
- The `stand_holds.stand_id` and `stand_reservations.stand_id` adapters, and `stand_reservations_capacity_stand_unique`, are still in place beside the verified member-level protection. §11 allows dropping them once membership is proven; that has not been done. `stands.price` is the same kind of leftover (§6.1).

### Phase 4 — Late partner

- Deadline-aware visibility.
- Credit-paid shared-price adjustment and partner insertion.
- Transactional eligibility/race handling.

**Delivered.** The command, its funding, and the participant surface on the reservation-detail page.

Two things about it are worth knowing before changing it. The price is the only one that is not the festival's configured figure alone — it also carries this reservation's own shared-price difference — so its purchase has a dedicated entry point that derives the total from the reservation id rather than accepting an amount. And the eligibility gate's `ALREADY_RESERVED` rule is exempted here, as it is for release: you cannot share a reservation you do not hold, so holding one is the precondition rather than the disqualification.

### Phase 5 — Reservation release

- `pending -> released` owner action, self-service and credit-funded.
- Refuse every other status, and recheck it under lock so a payment submitted mid-flow cannot be released out from under review.
- Free every member stand and cancel the reservation's invoice atomically with the transition.
- Retained history: the released reservation, its participants, stands and events stay queryable.
- Released participants become free to book again; every other eligibility rule still applies.

**Delivered.** No schema work was needed: `released` was already in the enum, `policy.ts` already treated it as non-blocking and kept that separate from stand occupancy, and the shared invoice rule was already implemented at all three admin closing paths.

The command refuses anything but `pending` and rechecks that under lock, so a payment submitted while the confirmation dialog is open cannot be released out from under review.

### Phase 6 — Rollout

- Reconcile data and verify pair/price invariants.
- Enable for admin/demo users first.
- Exercise voucher rejection after every type of completed credit action.
- Enable per festival and monitor debt, occupancy, and duplicate-action reports.

---

## 17. Test plan

### Phase 0 hardening closure

1. Reservation payment proof cannot be submitted through a public Server Action or `POST /api/payments`.
2. UploadThing completion persists callback-provided `voucherUrl` and `fileKey` exactly once.
3. All unblocker PostgreSQL races execute without skips or deadlocks and assert final rows.
4. The reservation invariant audit reports zero findings on the migrated test fixture and authorized deployment target.

### Credits

1. Voucher uploaded before 10 minutes issues provisional credits exactly once.
2. Expired top-up issues nothing.
3. Approval does not double-credit.
4. Rejection reverses once; unused balance decreases correctly.
5. Rejection after a provisional spend creates debt without reversing the feature action or the invoice it settled.
6. Negative balance blocks credit use and feature actions.
7. Concurrent spends cannot exceed spendable balance.
8. Hold affects spendable, not ledger, balance.
9. A full credit invoice allocation fulfills immediately; a partial allocation preserves the remainder; an under-review top-up can fund either, and is reported as under review while it does.
10. Credits apply after discounts and never modify discount history.

### Full table

1. Only illustration/entrepreneurship can activate.
2. No complete availability means no activation offer.
3. Declined offer remains accessible before booking.
4. Activation creates one owner/festival hold without debit.
5. Full table vs half stand race has one winner.
6. Full table created as one reservation with two members.
7. Half fallback remains bookable and releases credit hold.
8. Every fallback confirmation clearly says the participant is taking one stand — `un solo stand` / `media mesa` — and never `medio stand`.
9. Full confirmation captures feature credits exactly once.
10. Capacity-hold expiry preserves access; deactivation releases credit hold.
11. Rejected source credits do not auto-downgrade.
12. Manual downgrade retains the original half, safely releases the companion, and reprices the invoice to one half while honouring any discount.
13. Manual downgrade refuses a reservation whose invoice already has a payment or a credit allocation, and leaves both halves attached.
14. An admin can release somebody else's abandoned activation; a non-admin cannot.
15. The reservation invoice for a confirmed full table is the pair's `full_table_price`, not the sum or either half's price.

### Illustration pricing and late partner

1. Initial one-person/two-person invoices use individual/shared price respectively.
2. Paired halves reject unequal prices.
3. Feature hidden and direct action rejected at/after deadline.
4. Top-up started before deadline does not extend it.
5. Any live one-person illustration reservation is eligible; other categories are not.
6. Late total equals snapshotted difference plus feature price.
7. Original invoice/payment/discount remain unchanged.
8. Same partner race charges/adds only one winner.
9. Lost eligibility/deadline race produces no debit or mutation.
10. Rejected source credits do not remove the added partner.

### Release

1. Only the owner can release; a partner on the same reservation cannot.
2. Release is offered and accepted only from `pending`.
3. `verification_payment`, `accepted`, `rejected`, and `released` all refuse the action, and refuse a direct server call.
4. A payment proof submitted between opening the dialog and confirming makes the release fail under lock, with no debit and no transition.
5. Release debits once and transitions to `released` once, even on a retried submission.
6. Release frees every member stand, including both halves of a full table, and the stands become reservable again.
7. Release cancels the reservation's invoice and never touches a payment, settlement submission, or refund decision.
8. One release frees every registered participant on the reservation.
9. A released owner can immediately reserve again in the same festival; a `rejected` one still cannot.
10. Releasing and re-booking the same stand is allowed and charges the fee again.
11. There is no cap: a participant may reserve and release repeatedly as long as they fund each one.
12. Released history remains queryable, and a later occupant of the freed stand is unaffected.
13. Rejected source credits leave the reservation released and the owner in debt; the block is never restored.
14. A released participant still fails unrelated eligibility rules — sanctions, terms, enrollment, the reservation window — where applicable.
15. Admin rejection, dashboard cancellation, and settlement-rejection cancellation each apply their documented invoice/payment outcome; a payment-bearing closure preserves the evidence for admin resolution.

### UX/accessibility

- Keyboard, screen reader, mobile, and 200% zoom for all flows.
- SVG states have equivalent text and non-color indicators.
- Spanish voseo copy.
- Partner sees owner-paid adjustment but cannot act on it.
- Expired late-partner feature is absent, not advertised as disabled/purchasable.

---

## 18. Non-goals

- Arbitrary credit top-up amounts.
- Using credits for store, programs, sessions, or every Glitter purchase in MVP.
- Credit transfers, cash refunds, withdrawals, expiration, or promotional-credit rules.
- Guaranteed full-table inventory or waitlists.
- Full-table upgrades after a half-table reservation is created.
- Self-service partner replacement/removal.
- Partners outside illustration or more than one partner.
- Any self-service path out of a terminal reservation. Whatever ended it, only an admin lifts the block, by hand.
- Release of a reservation that has been paid for or has a payment under review; both are refund questions.
- Release as a way to undo a stand swap for free — the credits are the point.
- Automatic downgrade/cancellation/removal after credit voucher rejection.
- Geometry-based table pairing.
- Two unrelated reservations representing one full table.

---

## 19. Definition of done

- [x] Phase 0A removes the public proof-submission bypass and passes every PostgreSQL unblocker race and invariant audit.
- [x] Credit ledger, provisional issuance, holds, reversals, debt, and reconciliation are transactional and audited.
- [x] Credit purchase is separate from every feature action, limited to exact shortfalls, and offered only for features and debt.
- [x] Credits can optionally pay reservation invoices after discounts.
- [x] Mixed-tender settlement fulfills only when cash plus posted credit allocations cover the invoice, and partial/concurrent settlement remains safe and idempotent.
- [x] Illustration stands support validated individual/shared prices and immutable snapshots.
- [x] Full-table access occurs before the map and never guarantees inventory.
- [x] Two halves reserve atomically as one reservation, priced at the pair's own rate; half fallback remains available and explicit.
- [x] Full-table SVG variants derive from the existing half-table asset and carry text and non-colour cues for every state.
- [ ] Full-table variants pass a formal accessibility review (keyboard, screen reader, 200% zoom). Covered by unit tests, not yet reviewed end to end.
- [x] Late partner is illustration-only, deadline-safe, immediately credit-funded, and owner-paid.
- [x] Original individual invoices/payments/discounts remain unchanged after late partner addition.
- [ ] The owner of a `pending` reservation can pay credits to release it, freeing the stand and themselves to book again. _(Phase 5, not started.)_
- [x] Every terminal reservation blocks participation; only `released` is non-blocking. Predicates are in place and separated from stand occupancy.
- [x] Rejected provisional credits never trigger automatic domain reversals.
- [x] Admin can resolve debt and full-table exceptions manually with an audit trail — approve, mark paid, waive, downgrade a table to its original half, release an abandoned activation.
- [x] Owners are notified when a voucher is rejected, with the debt and the fact that what it paid for still stands. Submission and approval deliberately send nothing.
- [x] Everyone on a released reservation is told, in words that fit whether they chose it or not.
- [x] Both people are told when a partner is added, in words that fit whether they chose it or not.
- [x] Authorization, idempotency, concurrency, and migration tests pass for everything delivered.
