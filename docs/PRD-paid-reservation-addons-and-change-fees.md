# PRD: Reservation Credits and Optional Features

**Product:** Glitter

**Feature area:** Credits, stand reservations, full tables, illustration partners, reservation release

**Status:** Product decisions complete; implementation follows reservation hardening

**Last updated:** 2026-08-30

**Depends on:** [PLAN-stand-reservation-hardening.md](./PLAN-stand-reservation-hardening.md)

**Related:** [PRD-stand-reservations.md](./PRD-stand-reservations.md), [PRD-multi-payment-access.md](./PRD-multi-payment-access.md)

---

## 1. Summary

After reservation hardening, Glitter will introduce a credit wallet and three optional reservation features:

1. **Full table:** an illustration or entrepreneurship participant can attempt to reserve the two half-stands that form one physical table.
2. **Late partner addition:** the owner of a live illustration reservation can add one illustration partner after booking and before a configurable deadline.
3. **Reservation release:** the owner of a participant-cancelled reservation can soft-delete it, removing its participation block while retaining its history.

These are optional features, not penalties or sanctions. Each feature is paid only with Glitter credits. Participants buy credits before starting an action; purchasing credits does not start, reserve, or complete the action.

Participant-facing copy is Spanish and uses voseo.

---

## 2. Locked product decisions

| Topic                       | Decision                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credit value                | `1 credit = Bs 1`, represented with two decimal places.                                                                                                         |
| Credit ownership            | Global user balance; owner-only, non-transferable, non-cashable, non-expiring.                                                                                  |
| Initial spending scope      | Reservation invoices and the three features in this PRD. Other Glitter purchases are future scope.                                                              |
| Credit purchase             | Separate prerequisite. MVP sells only the exact shortfall for the selected invoice or feature.                                                                  |
| Purchase window             | User has 10 minutes to upload a voucher. No credits if the window expires without upload.                                                                       |
| Availability after upload   | Uploaded voucher immediately creates spendable provisional credits. Admin review never blocks the participant action.                                           |
| Rejected voucher            | Append a credit reversal. Spent provisional credits can produce a negative balance. Never reverse a completed reservation action automatically.                 |
| Feature payment             | Feature actions debit credits. No direct voucher or payment-review wait exists inside a feature action.                                                         |
| Reservation invoice credits | User chooses whether to apply credits. MVP applies the maximum usable amount, not a custom amount.                                                              |
| Discounts                   | Credits are payment tender, not discounts. Apply discounts first, then credits.                                                                                 |
| Full-table eligibility      | Illustration and entrepreneurship only.                                                                                                                         |
| Full-table meaning          | One stand is half a table: `120 cm × 60 cm`. Two paired stands are a full table: `240 cm × 60 cm`.                                                              |
| Full-table identity         | An admin-declared `stand_groups` row with `type = full_table` canonically pairs exactly two stands. Never infer pairing from geometry.                          |
| Full-table guarantee        | Credits grant permission to try while availability lasts. They do not guarantee any full table or location.                                                     |
| Full-table purchase timing  | Activated before entering the reservation map, never during stand selection.                                                                                    |
| Full-table fallback         | If the companion half is unavailable, the selected half remains reservable. Repeated confirmation must state that only one half will be booked.                 |
| Full-table charge           | Earmark credits at activation; debit only when a two-stand reservation is confirmed. Release the earmark when the user confirms one half or deactivates access. |
| Full-table payment failure  | No automatic downgrade or second-stand release if the source credit voucher is later rejected. Admin resolves manually.                                         |
| Illustration pricing        | Every illustration stand has an individual price and a shared price. Shared price is the total for both participants and remains owner-paid.                    |
| Late partner price          | `shared price snapshot - individual price snapshot + feature access price`, all paid in credits.                                                                |
| Existing payment            | Adding a partner never rewrites the original individual reservation invoice or payment.                                                                         |
| Existing discount           | Never applies to the shared-price difference or late-partner feature price.                                                                                     |
| Late partner eligibility    | Illustration only, owner only, one partner maximum, any live reservation.                                                                                       |
| Late partner deadline       | Admin-configurable; default is 21 days before the earliest festival start. At/after the deadline the feature is hidden and unavailable.                         |
| Release scope               | One festival-configured credit price releases a participant-cancelled reservation and all registered participants on it. Owner only.                            |
| Blocking statuses           | `rejected` and `cancelled` remain blocking. Only `released` is non-blocking.                                                                                    |
| Fulfillment                 | Partner addition and release execute immediately with credits. A later credit reversal creates debt but does not undo the action.                               |

There are no remaining product questions blocking implementation.

---

## 3. Domain language

- **Credit top-up:** purchase of credits by voucher.
- **Provisional credits:** spendable credits created immediately after voucher upload but still awaiting admin review.
- **Confirmed credits:** credits whose voucher was approved, or credits granted through another final admin operation.
- **Credit hold:** an earmark. It reduces spendable balance without removing credits from the ledger.
- **Credit spend:** an immutable debit assigned to an invoice or feature action.
- **Credit reversal:** an immutable debit created after a top-up rejection.
- **Credit debt:** a negative balance caused by reversing provisional credits that were already spent.
- **Feature configuration:** festival-specific availability, price, and optional deadline.
- **Live reservation:** a reservation still in its active lifecycle, including pending payment, payment verification, or accepted; excludes cancelled, rejected, and released.
- **Released reservation:** retained historical reservation that no longer blocks its participants.

Do not use `penalización`, `multa`, or refund language in participant UX. Credit top-ups are non-refundable purchases; unused credits remain in the wallet.

---

## 4. Credit wallet

### 4.1 Balance rules

The ledger is canonical and append-only.

```text
ledger balance = sum(posted ledger entry amounts)
spendable balance = ledger balance - sum(active holds)
```

Rules:

- Positive amounts issue credits; negative amounts spend or reverse them.
- Posted entries are never edited or deleted. Corrections use compensating entries.
- Holds are separate from ledger entries because they do not spend credits.
- Negative ledger balance is allowed only as the result of a reversal/admin correction.
- A user with negative balance cannot apply credits, activate a feature, or start a credit-funded action.
- Top-ups first settle negative balance. Only the remainder becomes spendable.
- Server transactions calculate all balances and amounts; the browser never supplies an authoritative price.

### 4.2 Credit top-up flow

Credit purchase is a separate operation performed before the user starts a feature action.

1. Resolve the selected feature or invoice and its current server-authoritative shortfall.
2. Create one exact-amount top-up session with a 10-minute upload deadline.
3. Do not reserve a stand, partner, feature deadline, or other domain resource.
4. User uploads the voucher before the deadline.
5. In the authoritative UploadThing `onUploadComplete` callback, persist the voucher submission and append a provisional credit issuance in one transaction, using `fileKey` as an idempotency key.
6. Make the credits spendable immediately and return the user to the feature entry point or invoice.
7. Admin reviews the top-up asynchronously through an explicit credit-top-up review command.

If the upload deadline expires, the top-up session expires and issues no credits. Creating a top-up before a feature deadline does not extend that feature deadline.

MVP top-up amounts:

- Feature: exact difference between required credits and current spendable balance.
- Reservation invoice: exact unpaid amount after the user chooses to use their existing credits.
- Negative balance: exact amount required to restore the balance needed for the intended operation.
- No arbitrary wallet top-up amount.

### 4.3 Admin review

Approval changes the top-up from provisional to confirmed and does not change the balance a second time.

Rejection:

1. Mark the top-up rejected with reviewer, time, and reason.
2. Append one idempotent reversal equal to the issued amount.
3. If credits remain unused, the reversal simply removes them.
4. If credits were spent, allow the wallet to become negative.
5. Keep every completed reservation, full-table allocation, partner addition, and release unchanged.
6. Block future credit use until the debt is resolved.

Admin resolution options are explicit and audited:

- Approve a replacement voucher.
- Mark the amount paid.
- Waive all or part of the debt.
- Perform a safe manual domain correction where policy permits it.

There are no automatic downgrades, partner removals, reservation cancellations, or release reversals.

### 4.4 Applying credits to reservation invoices

- Only the invoice owner can apply credits.
- The participant explicitly chooses `Usar mis créditos`.
- MVP applies `min(spendable balance, invoice outstanding amount)`.
- The allocation transaction debits credits and records the exact invoice allocation.
- Outstanding amount is derived canonically as `invoice amount - approved cash payments - posted credit allocations`.
- A partial allocation reduces the outstanding amount; normal voucher payment remains available for the remainder. Admin approval of that voucher fulfills the invoice only when the full canonical amount is covered.
- A full allocation of a positive-value invoice marks it credit-paid and immediately runs its normal fulfillment effect; no voucher review is required.
- A genuine zero-value invoice created by a discount/free entitlement still follows the hardening plan's `zero_value_entitlement` admin-review flow. Credits do not bypass it.
- The invoice, discounts, payments, and credit allocations remain separate immutable records.
- Rejected provisional source credits create wallet debt but do not reopen or automatically reverse an already fulfilled invoice.

The current invoice model assumes one settlement path. Before credits launch, extend the hardened settlement service to support mixed tender and calculate fulfillment from canonical approved payments plus posted credit allocations.

### 4.5 Recommended persistence

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
  invoice_allocation_id nullable
  reverses_entry_id nullable
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
  feature_access_id unique
  expires_at nullable
  idempotency_key unique
  created_at
  updated_at

credit_top_ups
  id
  user_id
  amount numeric(12,2)
  status: awaiting_voucher | under_review | approved | rejected | expired
  intended_use_type
  intended_use_id nullable
  upload_deadline_at
  voucher_url nullable
  file_key nullable
  submitted_at nullable
  reviewed_by_user_id nullable
  reviewed_at nullable
  rejection_reason nullable
  provisional_issue_entry_id unique nullable
  reversal_entry_id unique nullable
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

- `shared price >= individual price >= 0`.
- Admin can edit prices individually and in bulk.
- A full-table pair must have identical individual and shared prices.
- Entrepreneurship and other categories continue using one price unless expanded later.
- Hold/reservation creation snapshots both applicable illustration prices, even if booking individually.
- Initial invoice uses the price matching the number of participants confirmed during booking.
- The server derives all prices from stand/festival data.

Recommended stand additions:

```text
stands
  individual_price numeric(12,2)
  shared_price numeric(12,2) nullable

stand_holds / stand_reservations
  individual_price_snapshot numeric(12,2)
  shared_price_snapshot numeric(12,2) nullable
  booked_participant_count
```

Backfill existing `stands.price` into `individual_price`. Before enabling late partner addition, admins must configure valid illustration shared prices. Keep `price` only as a migration adapter, then remove it after consumers migrate.

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
- Identical individual/shared prices.
- Valid group membership and map placement.
- No conflicting live occupancy when changing the pair configuration.

Admin UI creates/edits the group and identifies malformed pairs and their exact mismatch. The server transaction locks the group and both stands, validates exactly two members, then changes the type. Direct writes cannot make an invalid group reservable.

Recommended addition:

```text
stand_groups
  type: visual_group | full_table
```

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
3. Create a full-table access record and an equal active credit hold atomically.
4. The held credits remain in the wallet but cannot be spent elsewhere.
5. Allow the user to enter the reservation map immediately.

The hold prevents a participant from activating the feature and spending those credits on another invoice before confirming a table. It is not a charge.

This credit hold is independent from the hardening plan's configurable stand-capacity hold (default five minutes):

- Credit hold protects money allocated to the feature.
- Stand hold temporarily protects physical capacity.
- Expiration or replacement of one must not accidentally release/capture the other.

Hold outcomes:

- Confirm two paired stands: capture the hold as a credit spend.
- Confirm only one stand: release the hold; credits become spendable and may be applied to the stand invoice if the owner chooses.
- User deactivates before booking: release the hold.
- Reservation window/festival access ends without booking: expire/release the hold.
- Temporary stand-capacity hold expires while the user is still trying: keep full-table access/credit hold active so they can try another available table.

Credit purchase remains non-refundable. Failure to obtain a full table does not return fiat; the unspent credits remain available in the wallet.

### 7.4 Map behavior

With active full-table access:

- Selecting either member resolves its companion server-side.
- If both halves are available, show the full-table selection as the default result.
- If the companion is unavailable, still allow the selected half.
- Never make the participant return to credit purchase from the map.

The half-table fallback must be explicit at multiple stages:

1. Stand detail/selection state.
2. First confirmation modal.
3. Final reservation summary before commit.

Suggested copy:

> Esta mesa ya no está disponible completa. Podés reservar solo el espacio {stand} o elegir otra mesa.

> Vas a reservar medio stand (120 × 60 cm), no la mesa completa. Tus créditos no se usarán y podrás aplicarlos al pago de tu reserva.

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
7. Capture the full-table credit hold in the same transaction.
8. Create one normal reservation invoice using the selected individual/shared price snapshot.

Extend `confirmStandHold` rather than creating a parallel confirmation path. It must keep the hardening plan's owner, festival, enrollment, current terms, sanctions, price snapshot, idempotency, outbox, and post-commit behavior for every member stand.

The second half does not create a second reservation or second base stand invoice. The full-table feature cost is the compensation for allocating the companion half.

If either stand loses availability before the two-stand hold is created, return a normal availability conflict and offer the selected half if it remains free. Never persist a partial two-stand hold.

### 7.7 Rejected provisional credits

If the voucher that funded consumed full-table credits is later rejected:

- Reverse the credits, potentially creating debt.
- Keep the two-stand reservation unchanged.
- Do not automatically downgrade, release the companion half, or cancel the reservation.
- Admin may request replacement payment, mark paid, waive debt, or manually downgrade when safe.
- A manual downgrade retains the originally selected half and releases only the companion half; it must lock/revalidate occupancy and record an audit event.

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

### 9.1 Status meaning

| Status      | Meaning                                   | Occupies stand | Blocks later participation |
| ----------- | ----------------------------------------- | -------------: | -------------------------: |
| `rejected`  | Admin rejected/terminated the reservation |             No |                    **Yes** |
| `cancelled` | Participant cancelled the reservation     |             No |                    **Yes** |
| `released`  | Owner completed the paid release action   |             No |                         No |

Only `released` is non-blocking. `Rejected` remains an administrative blocker and is not self-releasable. Admin handles exceptions manually.

Release is a soft delete: reservation, participants, stands, invoices, payments, and events remain queryable. Participant flows never hard-delete reservation history.

Use the hardening plan's explicit `cancelReservation` command to record `cancelled` plus actor, participant-request provenance, reason, and event. This PRD does not add a new general cancellation flow. Whether cancellation is recorded by an admin or a future owner-facing action, self-service release is allowed only for a canonical participant-requested cancellation—not an admin rejection/termination.

### 9.2 Availability

Show `Liberar reserva` only when:

- Current user is the canonical owner.
- Reservation status is `cancelled` with participant-request provenance.
- Release feature is enabled/configured for the festival.
- The reservation has not already been released.

One release price applies to the reservation and releases every registered participant on it. A partner can view the result but cannot pay or initiate release.

### 9.3 Execution

The owner must buy any missing credits before starting. Credit purchase does not reserve or start the release.

In one transaction, use the §14 canonical total lock order for the owner and every registered participant, skipping unused classes without reordering the remaining classes:

1. Acquire the applicable participant advisory, festival, terms, user/enrollment, credit-account, feature-configuration, stand, reservation, invoice/payment, and credit-domain locks in canonical order.
2. Revalidate owner, `cancelled` status, configuration, no prior release, and sufficient balance.
3. Debit the snapshotted release price.
4. Record a credit-paid release action.
5. Transition `cancelled -> released` exactly once.
6. Append an `eligibility_released` event and notifications.

Release does not restore the old stand, refund the original invoice, or guarantee a new reservation. The released participants must still pass normal profile, enrollment, terms, category, sanction, deadline, and availability rules.

If provisional source credits are later reversed, keep the reservation released and let admin resolve the resulting debt. Never automatically reactivate its participation block.

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

Full-table access begins active before a reservation exists; attach `reservation_id` when fulfilled. Partner/release actions are created and fulfilled in one transaction unless a business validation fails.

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
- Enforce active reservation occupancy per member stand using the reservation live-status predicate.
- Lock member stand IDs ascending.
- Capacity expiry/cancellation/rejection releases every active member atomically.
- DTOs expose `stands[]`; a temporary `primaryStand` adapter may support migration.
- Participants, invoices, activities, and feature actions attach to the one reservation aggregate.

The reservation-status occupancy predicate and participation-blocking predicate must be separate. `cancelled` and `rejected` release capacity while still blocking their registered participants.

Required changes to the hardened single-stand baseline:

- Replace canonical `stand_holds.stand_id` with `stand_hold_members`; retain a temporary primary-stand adapter only during migration.
- Replace `stand_holds_stand_idx` with unique active membership per stand.
- Keep one hold aggregate per `(user_id, festival_id)`.
- Replace canonical `stand_reservations.stand_id` with `stand_reservation_stands`.
- Move `stand_reservations_live_stand_unique` to the member table and define live occupancy as `pending`, `verification_payment`, or `accepted`.
- Update the planned owner uniqueness predicate to the same live statuses. `rejected`, `cancelled`, and `released` are historical rows; policy determines whether the person remains blocked.
- Update effective-status reads, expiration reconciliation, health checks, DTOs, and admin commands to operate on every member.
- Add `cancelled` and `released` reservation enum states before replacing the old cancellation-via-`rejected` behavior.
- Backfill every existing hold/reservation with exactly one member before dropping singular constraints/reads.

The existing hardening rule remains: any reservation history blocks participant self-service, including `rejected` and `cancelled`. Eligibility adds exactly one exception: a `released` reservation no longer blocks its registered participants. Admin-created reservations remain governed by their separate audited policy.

---

## 12. Participant UX

### Credit wallet

- Display total, held, spendable, and debt clearly.
- Label provisional credits as available while verification is pending.
- Explain that rejection may create an amount owed if credits are used.
- Show immutable history: purchase, use, hold/release, reversal, adjustment.
- Do not expose arbitrary top-up in MVP.

### Full-table preparation

- Offer after terms and from a persistent pre-booking portal action.
- Show half/full SVG comparison, dimensions, credit price, current balance, and availability disclaimer.
- State that buying/holding credits does not guarantee a full table.
- Map contains only space selection and confirmation—no financial setup.

### Reservation detail

Use `Acciones disponibles`, without suggesting the reservation is generally editable:

- `Agregar compañero`: illustration owner, live one-person reservation, before deadline only.
- `Liberar reserva`: owner of a participant-cancelled reservation only.
- Show credit requirement and link to purchase missing credits before the action can start.
- Show completed feature actions and credit-funded adjustments.

Suggested copy:

> Tu reserva no se puede editar. Si olvidaste agregar a tu compañero, podés hacerlo hasta el {fecha} usando créditos.

> Liberar esta reserva no devuelve pagos anteriores. Solo elimina el bloqueo generado por tu cancelación.

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
- Validate identical prices and configuration.
- Display pair identity and malformed-pair warnings.

### Reservation detail

- All member stands and original selected half.
- Original invoice plus credit allocations/adjustments.
- Full-table, partner, and release action history.
- Manual full-table downgrade retaining the original half and releasing the companion.
- Explicit warnings before any manual domain correction.

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
reservation_cancelled
reservation_released
```

Notifications:

- Owner: top-up submission, approval/rejection, debt, feature completion, manual correction.
- Added partner: only after successful addition.
- All released participants: release completion.
- Admin: new top-up review and unresolved negative balance.

Use canonical IDs and reason codes in audit metadata. Do not copy full profiles, voucher URLs, or sensitive payment data into event JSON.

---

## 16. Migration and delivery sequence

The hardening plan is the baseline, not parallel work. Its implementation is substantially complete. Phase 0 begins by closing and verifying the two remaining hardening gates below, then extends those services while preserving their authorization/idempotency contracts. Do not begin reservation-extension schema writes until Phase 0A passes.

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
- Add `released`; keep `rejected`/`cancelled` blocking participation.
- Persist both illustration price snapshots.
- Extend hardened settlement fulfillment with mixed tender and credit allocations.

Phase 0 is complete only when Phase 0A remains green after the Phase 0B migration and every existing hold/reservation has exactly one member row.

### Phase 1 — Credit foundation

- Credit account, append-only ledger, holds, top-ups, invoice allocations.
- Ten-minute voucher upload and immediate provisional issuance.
- Admin review, reversal, negative balance, debt resolution.
- Reconciliation, authorization, and concurrency tests.

### Phase 2 — Pricing and feature administration

- Individual/shared stand prices and bulk editor.
- Festival feature configuration and late-partner deadline.
- Full-table pair configuration/validation.

### Phase 3 — Full table

- Pre-reservation activation and persistent entry.
- SVG variants and accessible fallback states.
- Credit hold/capture/release.
- Atomic two-stand capacity and reservation.
- Admin manual correction.

### Phase 4 — Late partner

- Deadline-aware visibility.
- Credit-paid shared-price adjustment and partner insertion.
- Transactional eligibility/race handling.

### Phase 5 — Reservation release

- `cancelled -> released` owner action.
- Eligibility-query migration and retained history.
- Credit-funded immediate fulfillment.

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
5. Rejection after spend creates debt without reversing the domain action.
6. Negative balance blocks credit use and feature actions.
7. Concurrent spends cannot exceed spendable balance.
8. Hold affects spendable, not ledger, balance.
9. Full invoice credit allocation fulfills immediately; partial allocation preserves remainder.
10. Credits apply after discounts and never modify discount history.

### Full table

1. Only illustration/entrepreneurship can activate.
2. No complete availability means no activation offer.
3. Declined offer remains accessible before booking.
4. Activation creates one owner/festival hold without debit.
5. Full table vs half stand race has one winner.
6. Full table created as one reservation with two members.
7. Half fallback remains bookable and releases credit hold.
8. Every fallback confirmation clearly says `medio stand`.
9. Full confirmation captures feature credits exactly once.
10. Capacity-hold expiry preserves access; deactivation releases credit hold.
11. Rejected source credits do not auto-downgrade.
12. Manual downgrade retains original half and safely releases companion.

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

1. Cancelled/rejected reservations release capacity but block participants.
2. Only owner can release a participant-cancelled reservation.
3. Admin-rejected reservation cannot self-release.
4. Release debits once and transitions to `released` once.
5. One release frees every registered participant on the reservation.
6. Released history remains queryable.
7. Release does not alter the old stand or a newer occupant.
8. Rejected source credits do not restore the block.
9. Released participant still fails unrelated eligibility rules where applicable.

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
- Self-service release of an admin-rejected reservation.
- Automatic downgrade/cancellation/removal after credit voucher rejection.
- Geometry-based table pairing.
- Two unrelated reservations representing one full table.

---

## 19. Definition of done

- [ ] Phase 0A removes the public proof-submission bypass and passes every PostgreSQL unblocker race and invariant audit.
- [ ] Credit ledger, provisional issuance, holds, reversals, debt, and reconciliation are transactional and audited.
- [ ] Credit purchase is separate from every feature action and limited to exact MVP shortfalls.
- [ ] Credits can optionally pay reservation invoices after discounts.
- [ ] Illustration stands support validated individual/shared prices and immutable snapshots.
- [ ] Full-table access occurs before the map and never guarantees inventory.
- [ ] Two halves reserve atomically as one reservation; half fallback remains available and explicit.
- [ ] Full-table SVG variants derive from the existing half-table asset and pass accessibility review.
- [ ] Late partner is illustration-only, deadline-safe, immediately credit-funded, and owner-paid.
- [ ] Original individual invoices/payments/discounts remain unchanged after late partner addition.
- [ ] Participant-cancelled reservations can transition to retained, non-blocking `released` records.
- [ ] `rejected` and `cancelled` remain participation blockers; only `released` is non-blocking.
- [ ] Rejected provisional credits never trigger automatic domain reversals.
- [ ] Admin can resolve debt and full-table exceptions manually with an audit trail.
- [ ] Authorization, idempotency, concurrency, migration, and accessibility tests pass.
