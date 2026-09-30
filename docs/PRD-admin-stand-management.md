# PRD: Admin Stand Switch, Exchange, Full-Table Assignment, and Full-Table Upgrade

**Status:** implemented 2026-09-07, rebased onto `develop` at #510. Migration
`0282_stand_change_support` is generated and applied to a disposable test
database only — applying it to production is a separate decision. It must run
after `0281_reapply_skipped_full_table_and_credit_ddl`, which rebuilds the
registry operation CHECK without `changeReservationStand`.
Feature D (full-table upgrade, §7) was added 2026-09-29 on
`claude/full-table-upgrade`. Its migration `0293_upgrade_full_table_operation`
only adds `upgradeFullTableReservation` to the registry operation CHECK. It is
generated and applied to a disposable test database only; applying it anywhere
else is a separate decision.
**Depends on:** [PRD-stand-reservations.md](PRD-stand-reservations.md),
[PRD-paid-reservation-addons-and-change-fees.md](PRD-paid-reservation-addons-and-change-fees.md)
(§7 full table, §9 release, §11 multi-stand foundation, §14 lock order).

---

## 1. Summary

Four admin capabilities, all reached from the dashboard:

- **Stand switch** — move a reservation from one stand to a free one, from the
  reservation edit page.
- **Stand exchange** — the same control aimed at a stand somebody else already
  occupies, which swaps the two reservations rather than refusing.
- **Admin full-table assignment** — create a reservation covering both halves of
  a declared full table, for a participant, without credits.
- **Admin full-table upgrade** — widen an existing half-table reservation to the
  declared full table its stand belongs to, from the reservation edit page,
  without credits (§7).

The switch, the exchange and the upgrade are manual corrections. Participants have no free stand swap by
design: release is a paid change fee precisely so the map does not churn (§9).
Nothing here changes that. These are the admin's escape hatch for a mistake, a
sector reshuffle, or a negotiated move, and every one of them is audited.

---

## 2. Locked product decisions

| Decision | Value |
| --- | --- |
| Invoices | Repriced **in place**. Never cancelled and reissued. |
| Money already tendered | Resolved arithmetically, never refused: a shortfall reopens the reservation, a surplus comes back as credits (§4.6). |
| Price changes | Allowed across sectors and prices whatever has been paid, except while a voucher is under review. |
| Category compatibility | Not enforced, matching `createAdminReservation`. The admin's judgement, not the system's. |
| Full tables as a switch source | Out of scope for v1. The control is disabled with a reason, never hidden. |
| Notifications | None. Participants are told out of band. |
| Full-table assignment and upgrade | Only onto a `stand_groups` row already declared `full_table` with a price. Admins do not create pairs from these screens. |
| Credits | An admin full table costs no credits and creates no feature action. |

---

## 3. Scope

In scope:

- Switch and exchange for reservations holding exactly **one** live member stand.
- Full-table assignment on the admin reservation-creation form.
- Upgrading a reservation that holds exactly **one** live member to the
  declared, priced full table its stand belongs to (§7).

Out of scope for v1:

- Switching or exchanging a reservation that holds two live members. Both the
  origin and the destination reservation are checked; if either is a full table
  the action is refused.
- Moving a reservation between festivals. Both stands must share the
  reservation's `festival_id`.
- Changing the participant set. Partner edits stay on their own control.
- Cash refunds. A surplus comes back as credits (§4.6); there is no payout
  path, and this feature does not invent one.
- A participant self-service upgrade to a full table. Only an admin can widen an
  existing reservation
  ([PRD-paid-reservation-addons §18](PRD-paid-reservation-addons-and-change-fees.md)).

Operating constraint, agreed rather than enforced:

- **No moves while a best-stand vote is open.** `festival_activity_votes` stores
  `stand_id`, so votes follow the physical stand rather than the person: a move
  mid-vote would strand a participant's votes on the stand they left and hand
  them whatever was cast for the stand they arrive at. Moves belong to the
  period before the festival, and no mechanism enforces that. Activity
  *enrollment* needs no such care — `festival_activity_participants` stores no
  stand and derives it live through `stand_reservations.stand_id`, so it follows
  the participant on its own.

---

## 4. Feature A — Stand switch

### 4.1 Where it lives

On `/dashboard/reservations/[id]/edit`, alongside the existing partner and
full-table-downgrade controls. Global admin only, the same gate
`canMutateAdminReservations` applies to the downgrade.

The control is rendered for every reservation and **disabled with a reason**
when it cannot run:

| Condition | Reason shown |
| --- | --- |
| Actor is a festival admin | Only a global admin may move a reservation. |
| Reservation holds two live members | A full table cannot be moved. Reduce it to half a table first. |
| Reservation is not in a live status | A closed reservation no longer occupies a stand. |

### 4.2 Choosing the destination

The picker lists every stand in the festival, grouped by sector, each labelled
with its number, sector, price, and current status. Occupied stands stay
**selectable**: selecting one is how an admin reaches the exchange (§5), and
hiding them would make the exchange undiscoverable.

Stands that can never be the destination are disabled with their reason:

- the origin stand itself,
- a stand in another festival,
- a stand occupied by a full-table reservation,
- a stand under a live capacity hold — somebody is mid-checkout on it.

`disabled` stand status is **not** a reason. Admins disable a stand precisely to
allocate it by hand, exactly as `createAdminReservation` already reasons about
it.

Category is not a reason either (§4.3). Each entry's label carries the stand's
category alongside its sector, price and status, the same way the create form
already labels status — informational, so a mismatch is visible without being
prevented.

### 4.3 Compatibility

**Not enforced.** The switch follows `createAdminReservation`, which never calls
`denyIfStandNotEligibleForProfile`: an admin may move a participant onto any
stand in the festival, whatever its category, participation type, or
subcategories.

The reason is consistency rather than permissiveness. An admin can already place
anyone on any stand at creation time, so a switch that refused the same
placement would mean the only way to achieve it is to delete the reservation and
recreate it — losing the invoice, the audit trail, and the payment state, to
enforce a rule the create path does not have.

Sector and price are not inputs either. A cross-sector move to a differently
priced stand is a normal, supported move (§4.5 governs the money).

`standMatchesParticipant` still governs the participant-facing map. Nothing here
changes what a participant may book for themselves.

### 4.4 Write set

One transaction, under the aggregate lock:

1. `stand_reservations.stand_id` → destination. The column is still the join
   target for rental eligibility, festival activity votes, and discount-code
   pricing, so it stays in step with membership.
2. The live `stand_reservation_stands` row is **updated in place** — same row,
   same `position`, `stand_id` rewritten. It is not released and re-inserted:
   `stand_reservation_stands_reservation_stand_unique` is on
   `(reservation_id, stand_id)` and counts released history, so a
   release-and-insert would make a round trip back to a previously held stand
   fail on a collision with its own past.
3. Destination `stands.status` takes the origin's status; the origin runs
   through `releaseStandIfVacant`, which returns it to `available` only if
   nothing else holds it.
4. Price snapshots are re-taken from the destination stand:
   `individual_price_snapshot`, `shared_price_snapshot`, and
   `price_amount_snapshot` (individual or shared by `booked_participant_count`,
   the §6.1 rule). Leaving them at the origin's values would make every later
   operation — adding a partner, a late partner, a downgrade — reprice from a
   stand the reservation no longer occupies.
5. The invoice is repriced (§4.5).
6. A `stand_reservation_events` row records the move.

The reservation's **status never changes**. A paid reservation stays paid on its
new stand, and its new stand is `confirmed`. `reveal_at` is untouched, so a
reservation still under embargo stays under it and the destination keeps showing
as available to participants until the reveal moment.

Moving onto a `disabled` stand consumes the disabled marking — the stand takes
the origin's status, exactly as `createAdminReservation` already flips a disabled
stand to `reserved`. Nothing restores it if the reservation later moves away.

### 4.5 Invoice handling

The invoice is repriced in place — `original_amount` to the new price,
`discount_amount` clamped to it, `amount` recomputed — exactly as
`downgradeFullTableReservation` already does. It is never cancelled and
reissued, for three reasons:

- Three call sites resolve "the reservation's invoice" with `.limit(1)`, no
  ordering and no status filter (`adminConfirmReservationByReservationIdAction`,
  the full-table downgrade, `updateReservationPartner`). A second row makes
  admin confirmation pick nondeterministically.
- `invoices.discount_code_id` points at a code carrying `current_uses` against
  `max_uses`. Reissuing either drops the participant's discount or burns a
  second redemption of a code they used once.
- Repricing preserves `amount = original_amount - discount_amount`, which
  reissuing has to reconstruct by hand. A percentage discount then follows the
  new price for free, and a fixed one clamps.

**The one refusal left.** A settlement submission still `submitted` blocks a
price change. A comprobante was uploaded for the old total, and repricing under
it would leave the reviewer comparing it against a number that moved after it
was sent. Approved payments and confirmed credit allocations are different —
they are settled facts, and §4.6 resolves them.

Only `cancelled` invoices are skipped. A `paid` one is repriced like any other,
because a paid invoice whose stand got more expensive is exactly the case that
has a balance to carry — skipping it would leave the reservation owing nothing
on paper.

**The invariant this protects.** Only two writers create invoices —
`createAdminReservation` and hold confirmation — and each creates exactly one per
reservation. Every reservation therefore has at most one live invoice today, and
the `.limit(1)` readers above are correct because of it. Repricing keeps that
true; reissuing would have made this PRD the first thing to break it.

### 4.6 Resolving a price change against money already paid

The move never argues about money in the abstract. It reprices the invoice, then
resolves exactly one comparison: **what the new stand costs, against what has
already been covered.**

`covered` is approved cash plus confirmed credits — the figure
`getInvoiceTenderTotalsInTx` already computes, and the same one the payments
dashboard shows. Deliberately measured against what was *covered* rather than
against the old price: a participant who paid half of an expensive stand and
moves to a cheaper one has not overpaid anything, and comparing prices instead
of payments would hand them credits they never funded.

| Comparison | Outcome |
| --- | --- |
| `covered == new` | Nothing to resolve. |
| `covered == 0` | Nothing to resolve — the reservation was already unpaid. |
| `covered < new` | **Balance due.** |
| `covered > new` | **Overpaid.** |

**Balance due.** The invoice already carries the balance on its own —
`outstanding` is `amount - covered`, so repricing upward is all it takes for the
right number to appear everywhere. What has to change is the reservation:

- status back to `pending`, because `accepted` means paid and this one is not;
- the stand from `confirmed` to `reserved`, because a stand left `confirmed`
  under a pending reservation reads as paid on every map and report that trusts
  `stands.status`;
- a **fresh payment deadline measured from the move** — five days, the same
  window a booking gets — on the invoice's `due_at` and a new `scheduled_tasks`
  row.

The deadline restarts rather than being inherited because the participant is
being asked for money they did not owe when the first clock started, and the
acceptance already completed the original task: reviving its dates would make
the balance overdue the instant it exists. A new row is created rather than the
completed one revived, because that row's `completed_at` told the truth.

If the balance is never paid it becomes an ordinary overdue pending
reservation. Nothing new happens to it; the existing deadline machinery already
governs that case.

**Overpaid.** The surplus is granted back as credits — an ordinary `admin_grant`
ledger entry carrying its reason, visible in the wallet and reversible from the
credit screen like any other. Credits rather than cash because they are the only
refund instrument this product has; inventing a payout path from a stand change
would be a far larger decision than the move itself. The reservation stays
`accepted` and its stand `confirmed`: it is more than covered.

The grant inherits the command's idempotency key. The ledger is append-only, so
a retry that reached the grant twice would hand over the difference twice.

**Lock order.** Handing credits back needs the owner's credit account locked,
and the canonical order places credit accounts *before* stands — earlier than
prices are known. The preview pass therefore takes the lock whenever any money
sits against the invoices at all, and a surplus discovered under the locks
without that lock held returns `CONFLICT_RETRY` rather than locking out of
order. Most moves have no money against them and skip it.

**Both sides.** An exchange runs this per side, independently. One participant
can owe a balance while the other receives credits, from the same command.

---

## 5. Feature B — Stand exchange

### 5.1 How the admin gets there

The admin picks an occupied stand in the same switch picker. They are not
refused: the confirmation dialog changes shape instead, naming both
participants, both stands, both current prices, and both resulting prices, and
saying plainly that this moves two reservations. Confirming runs an exchange.

The exchange is refused, before the dialog, when:

- either reservation holds two live members,
- the two reservations belong to different festivals,
- the destination is held rather than reserved (a live capacity hold has no
  participant to exchange with).

### 5.2 The uniqueness problem

Two partial unique indexes stand in the way of a direct swap:

```text
stand_reservations_capacity_stand_unique
  UNIQUE (stand_id) WHERE status IN ('pending','verification_payment','accepted')

stand_reservation_stands_active_stand_unique
  UNIQUE (stand_id) WHERE released_at IS NULL AND reservation_status IN (...)
```

Postgres evaluates a unique **index** per row as the statement runs, and a
partial unique constraint cannot be declared `DEFERRABLE` — constraints take no
`WHERE` clause. So `UPDATE ... SET stand_id = B` on the reservation sitting at A
fails immediately against the reservation still sitting at B, and rewriting it
as one multi-row `UPDATE ... CASE` fails for the same reason.

**The member table has a parking spot.** `released_at` is already the mechanism
for taking a member off a stand without deleting it:

1. Release B's member — `released_at = now()`. Stand B leaves the index.
2. Move A's member to B — `stand_id = B`. Stand A leaves the index; B is free.
3. Restore B's member onto A — `stand_id = A`, `released_at = NULL`.

The same row comes back, so `position` survives and no history row accumulates.
The `stand_reservation_stands_status_default` trigger fires only on `INSERT OR
UPDATE OF reservation_id`, so none of these three statements disturbs the
denormalised `reservation_status` the occupancy index reads.

**The parent column has none.** `stand_reservations.stand_id` is `NOT NULL`, is
a foreign key, and has no released state, so there is no legal intermediate
value to park at.

### 5.3 Required schema change

Drop `stand_reservations_capacity_stand_unique`.

This is the step [PRD §11](PRD-paid-reservation-addons-and-change-fees.md) already
sanctions — *"Establish member-level occupancy protection ... before dropping
`stand_reservations_capacity_stand_unique` or the legacy adapter"* — and that
migration `0264` deferred only *"until the member protection has been verified in
production."* `stand_reservation_stands_active_stand_unique` has been the live
guarantee since 0264 and is treated as verified.

After the drop, occupancy is guaranteed at member level only. The parent
`stand_id` column stays: it is still the join target for rentals, activity
votes, and discount-code pricing, and every writer keeps it in step with
membership.

Generate the migration from `db/schema.ts`; applying it to production is a
separate, one-way decision.

### 5.4 Write set

One transaction. Locks taken in the canonical §14 order over the **union** of
both reservations: participant advisory keys, festival, users, both stands
ascending by id, both reservations ascending by id, then both invoices and their
payments.

Per side, the §4.4 write set runs unchanged, with the member updates ordered as
§5.2. Both `stands.status` values swap with their reservations, so a paid
reservation carries `confirmed` onto its new stand while the other carries
`reserved` onto the old one.

### 5.5 Pricing

Each side is repriced independently against the stand it receives, and each
resolves its own settlement under §4.6. A cross-sector exchange between
differently priced stands is the expected case, whatever either side has paid:
the participant moving up owes a balance and reopens, the one moving down gets
credits back, and both happen in the one transaction.

The single refusal is shared: a voucher under review on **either** side stops
the whole exchange, because a partial exchange is not a thing that can exist.

---

## 6. Feature C — Admin full-table assignment

### 6.1 Form shape

`/dashboard/festivals/[id]/reservations/new` gains a toggle in user mode:
**Un espacio** / **Mesa completa**. The toggle rewrites what the stand picker
offers; it does not filter the list down.

| Mode | List contents | Disabled entries and their reasons |
| --- | --- | --- |
| Un espacio | Every stand in the festival | Occupied; under a live hold |
| Mesa completa | Every stand belonging to a `full_table` group | Companion occupied or held; group has no `full_table_price`; group is malformed (not exactly two stands) |

In full-table mode, selecting a half names the companion and shows the table
price, so the admin sees both stands and the one total before submitting. The
selected half is `position = 0` — it is the half a later downgrade keeps.

Admins do not pair stands here. A table that has not been declared and priced in
the stand editor is not inventory, and this form does not make it into any.

### 6.2 Write set

`createAdminReservation` gains a full-table mode. Relative to the single-stand
path, it differs in exactly four places:

1. `resolveFullTableCompanion` resolves the pair; a null return (unpriced or
   malformed) refuses the request.
2. Occupancy is checked on both halves; both are flipped to `reserved`.
3. Two member rows are inserted, picked half first.
4. `full_table_price_snapshot` is set to the group price, and
   `price_amount_snapshot` and the invoice both take that price — the table's
   price replaces its halves', it does not add to them. `individual_price_snapshot`
   and `shared_price_snapshot` are still taken from the picked half, because a
   later downgrade prices the surviving half from them.

Everything else — reveal handling, participant rows, invoice, scheduled task,
idempotency claim, notifications, audit event — is the existing admin path
unchanged. A partner may be added, and does not change the price.

That inheritance is the requirement, not an accident of reuse. In particular the
admin path does not run `denySelfServiceMutation`, so it does not apply the
"already holds a live reservation" block, and no database constraint imposes one
either — `stand_reservations` indexes `owner_user_id` without a unique predicate.
An admin can therefore assign a full table to a participant who already has a
reservation, exactly as they can already assign a second single stand.

### 6.3 What it deliberately does not do

- **No `reservation_feature_actions` row and no credit hold.** That is what "no
  credits needed" means. The participant-facing feature exists to charge for
  access to a scarce table; an admin placing someone on one is an allocation, not
  a purchase.
- **No festival feature-config check.** Full-table access being disabled or
  unpriced for participants does not stop an admin assigning a table that is
  itself declared and priced.
- **No `isFullTableCategory` check.** The category restriction shapes what
  participants may buy. Admins already override `disabled` stands on this form;
  this is the same kind of override.
- `downgradeFullTableReservation` works on the result unchanged: it reads only
  `full_table_price_snapshot` and membership, neither of which knows how the
  reservation was created.

---

## 7. Feature D — Admin full-table upgrade

The inverse of `downgradeFullTableReservation`. It takes a reservation holding
one live member stand whose stand is half of a declared, priced `full_table`
group, and adds the other half as a second live member. The result has exactly
the shape the §6 full-table assignment builds, so the downgrade keeps working
on it.

### 7.1 Where it lives

On `/dashboard/reservations/[id]/edit`, a **Mesa completa** card between the
**Espacio** card and the **Zona de riesgo** card. The card appears only when the
reservation holds one live stand and that stand belongs to a `full_table`
group. A stand outside any table has no full table to offer, so the card is not
rendered. Every other blocker keeps the card, with the button disabled and the
reason shown:

| Condition | Reason shown |
| --- | --- |
| Actor is a festival admin | Solo un administrador general puede ampliar una reserva. |
| Reservation is not `pending`, `verification_payment` or `accepted` | Esta reserva ya no ocupa un espacio. |
| Group does not have exactly two stands | La mesa no tiene exactamente dos espacios. |
| Group has no `full_table_price` | La mesa no tiene precio configurado. |
| Companion is a live member of another reservation | La otra mitad ya está ocupada por otra reserva. |
| Companion is under a live hold | Alguien está reservando la otra mitad en este momento. |
| A settlement submission is `submitted` and the price changes | Hay un comprobante o una solicitud en revisión. Resolvelo antes de ampliar la reserva. |
| A surplus would come back but the reservation has no owner | Lo ya pagado supera el precio de la mesa y la reserva no tiene titular a quien devolverle la diferencia. |

A companion whose status is `disabled` is not blocked, for the same reason as
§4.2. A stale status alone, such as `reserved` with no live member or hold, does
not block either. Both halves' statuses are overwritten by the upgrade.

### 7.2 The confirmation

Unlike the switch, the dialog shows the actual amounts.
`fetchFullTableUpgradePreview` computes them with the service's own helpers and
the pure planner `planFullTableUpgrade`, inside a read-only transaction. The
dialog says:

- which half joins, and that the reservation then holds both;
- the cobro before and after, both net of discount, and the discount it keeps;
- that an amount an admin earlier wrote off ("confirmar con saldo pendiente")
  does not survive, because repricing recomputes `amount` from the price and
  the discount;
- what happens to money already paid (§7.4), in the reservation's own terms:
  it stays pending or goes back to pending, credits come back, or only the
  amount changes;
- that the upgrade cannot be undone once any payment or credit allocation row
  exists, because the downgrade refuses those;
- that no credits are charged and nobody is notified now. On a balance, the
  payment reminder task is moved to one day before the new deadline.

The action sends back the preview's `expected` (`tablePrice`, `settlementKind`,
`settlementAmount`). The service recomputes the plan under its locks and
refuses with `FULL_TABLE_UPGRADE_STALE` if the numbers moved, for example
because a payment was approved or the table was repriced after the page
rendered. The admin never confirms one amount and gets another. On any refusal
the dialog closes, the page refreshes, and the next attempt gets a new
idempotency key.

### 7.3 Write set

One transaction. It takes the canonical lock order (§8) over the
reservation's participants, owner and invoice payers, the owner's credit
account when money has been tendered, both halves, the reservation and its
invoices. Invoices, membership,
the companion and the table price are re-read under the locks, and any drift
returns `CONFLICT_RETRY`.

1. The companion becomes a live member. If the reservation has a released row
   for it from an earlier downgrade, that row is revived. Otherwise a row is
   inserted after every position the reservation has ever used. The kept half
   stays the lowest live position, which is the half a later downgrade keeps.
2. `price_amount_snapshot` and `full_table_price_snapshot` take the table price.
   `individual_price_snapshot` and `shared_price_snapshot` stay the kept half's,
   because the downgrade prices the surviving half from them. The one exception
   is a legacy row with no individual snapshot, which gets the kept stand's
   individual price so a later downgrade does not price the half at zero.
3. When the price changes, every non-cancelled invoice is repriced in place
   (§4.5).
4. Money already tendered is resolved as in §4.6 (see §7.4).
5. Both halves' `stands.status` follow the resulting reservation status:
   `confirmed` when it is `accepted`, otherwise `reserved`.
6. A `status_changed` event records the upgrade (§9).

The participant set, `booked_participant_count`, the parent `stand_id` and
`reveal_at` are untouched. The table price does not depend on headcount.

### 7.4 Money

This is the §4.6 comparison, unchanged. `covered` is approved cash plus
unreversed credit allocations, less any earlier refund grants tagged
`standChangeRefundReservationId`. A surplus is granted back with that same
tag, so a later switch or upgrade nets it out instead of paying it twice.
Some behaviours carry over from the switch, and tests pin them:

- `covered == 0` resolves nothing. An `accepted` reservation that was accepted
  at no cost stays `accepted`, and its cobro stays settled at the new amount.
- An earlier write-off does not carry over. The reservation reopens for the full
  difference against what was actually covered.
- Once any payment or allocation row exists, the downgrade refuses. A paid
  upgraded table cannot go back to half a table.

### 7.5 Errors

| Code | When |
| --- | --- |
| `UNAUTHORIZED` | Not a global admin. |
| `FULL_TABLE_NOT_UPGRADABLE` | Status not movable, or not exactly one live member. |
| `FULL_TABLE_UPGRADE_NO_TABLE` | The stand is not half of a priced, two-stand `full_table` group. |
| `FULL_TABLE_COMPANION_TAKEN` | The companion is a live member of another reservation. |
| `FULL_TABLE_COMPANION_HELD` | The companion is under a live hold. |
| `FULL_TABLE_UPGRADE_PROOF_UNDER_REVIEW` | A submission is `submitted` and the price changes. |
| `FULL_TABLE_UPGRADE_STALE` | The locked plan differs from what the admin confirmed. |
| `FULL_TABLE_UPGRADE_REFUND_NO_OWNER` | A surplus with no owner to credit. |
| `CONFLICT_RETRY` | Concurrent change detected under the locks. |

The command is claimed in `request_registry` as `upgradeFullTableReservation`.
A replay rebuilds the same success message, including a reopened balance or the
credits returned.

### 7.6 What it deliberately does not do

- **No credits, no `reservation_feature_actions` row, no credit hold**, as in
  §6.3. A participant's own `full_table_access` action or hold is left alone.
- **No festival feature-config or category check**, as in §6.3.
- **No notification.** On a balance, the reservation's `stand_reservation`
  task is moved to the new deadline, or created for the owner.
- **No participant self-service path.**

### 7.7 Partner edits on a full table

`synchronizeReservationParticipantPricing` now leaves a full table's price
alone. When `full_table_price_snapshot` is set, adding or removing a partner
updates only `booked_participant_count`. Before this change, the first partner
edit after an upgrade repriced the invoice back down to one half's price.

### 7.8 Open questions

- A late partner who already paid the shared-price difference in credits: that
  amount is not counted in `covered`, so the upgrade ignores it, as the switch
  does. Count it, or refuse the upgrade?
- `addLatePartner` does not check `full_table_price_snapshot`. On a full table
  it still charges the shared-price difference, although the table price does
  not depend on headcount.
- A `pending` reservation whose table amount is at or below `covered` stays
  `pending` with nothing outstanding, as the switch leaves it.

---

## 8. Authorization, transactions, races

- Global admin only, for all four. `canMutateAdminReservations`.
- Every command takes an idempotency key and claims it through
  `request_registry`, like every other admin command.
- Lock order is the §14 order, extended over both reservations for an exchange.
  No class is reordered; unused classes are skipped.
- Every precondition previewed before the locks — membership, occupancy,
  invoice state, prices — is re-read under them, and a set that moved returns
  `CONFLICT_RETRY` rather than proceeding.
- After the §5.3 drop, `stand_reservation_stands_active_stand_unique` is the
  final protection against double occupancy. It must stay non-deferrable.

Race outcomes:

- Two admins moving the same reservation: one wins, the other retries.
- A participant confirming a hold on the destination while the dialog is open:
  the destination is occupied under the lock and the move is refused.
- A payment landing on either invoice mid-move: re-read under the invoice lock,
  and a price-changing move is refused.

---

## 9. Audit

No new `stand_reservation_event_type` value. The full-table downgrade already
establishes the pattern for a manual correction that changes no status:
`status_changed` with `from_status = to_status` and the action in the payload.

```text
{ action: "stand_switched",  fromStandId, toStandId, fromPrice, toPrice }
{ action: "stand_exchanged", fromStandId, toStandId, counterpartReservationId,
                             fromPrice, toPrice }
{ action: "full_table_manually_upgraded", keptStandId, addedStandId,
                             fromPrice, toPrice, settlement, settlementAmount }
```

The upgrade records the real resulting status: `to_status` is `pending` when a
balance reopened the reservation, not a copy of `from_status`. The reservation
console labels it "Amplió la reserva a mesa completa", with the table price and
any balance or credits returned.

An exchange writes one event on each reservation, each naming the other. No
notification is sent in v1.

---

## 10. Delivery sequence

1. Switch, single member, destination free. No schema change.
2. Full-table assignment. No schema change.
3. Drop `stand_reservations_capacity_stand_unique`; verify member-level
   occupancy holds in the integration suite.
4. Exchange.

Steps 1 and 2 are independent and can land in either order.

5. Full-table upgrade (§7). Needs migration `0293` for the registry operation.

---

## 11. Test plan

Integration (real Postgres, per the docker test database):

- Switch across sectors at a different price reprices the invoice and
  re-snapshots all three price columns.
- Switch with a percentage discount keeps the discount proportional; with a
  fixed discount exceeding the new price, clamps it and leaves `amount` at zero,
  never negative.
- A paid reservation moved to a pricier stand reopens: status `pending`, stand
  `reserved`, invoice repriced and `pending`, and a new scheduled task whose
  due date is measured from the move rather than the booking.
- A paid reservation moved to a cheaper stand keeps `accepted` and receives the
  surplus as one `admin_grant` ledger entry; a retry grants it once.
- A partial payer moving somewhere cheaper receives nothing.
- Any price change is refused while a settlement submission is `submitted`.
- Round trip A → C → A succeeds — the regression the in-place member update
  exists to prevent.
- Exchange between two `pending` reservations at different prices reprices both.
- One exchange resolves both sides at once: the side moving up reopens with a
  balance, the side moving down receives credits.
- Exchange refused while a voucher is under review on either side.
- Exchange leaves exactly two live member rows, one per reservation, positions
  intact, and no orphaned released row.
- Concurrent exchange and hold confirmation on the same stand: one winner.
- Full-table assignment creates two members, one invoice at the table price, no
  feature action, and no credit ledger entry.
- Full-table assignment refused on an unpriced or malformed group.
- Downgrade of an admin-created full table behaves as it does for a
  participant-created one.
- Upgrade of an unpaid half adds the companion above the kept half and
  reprices the invoice to the table price, with no ledger entry.
- Upgrade of a paid half reopens it for the balance (both halves `reserved`, one
  open task, a fresh deadline). Paying that balance confirms both halves.
- Upgrade with a surplus keeps `accepted` and grants the difference once, tagged
  for netting. A retry replays.
- Upgrade refused while a submission is under review, on an occupied or held
  companion, on a missing, unpriced or malformed table, on a full table, and for a
  festival admin. Nothing changes, and the key can be retried later.
- Downgrade → upgrade revives the released row. Downgrade → switch → upgrade
  inserts the companion above every earlier position.
- A partner edit after an upgrade keeps the table price.
