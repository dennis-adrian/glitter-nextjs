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
The repricing fixes (2026-09-29, `claude/reservation-repricing-fixes`) unify
the money arithmetic of every repricing command (§4.6) and record Dennis's
decisions on the §7.8 questions. A follow-up (2026-09-30) moved the refund
netting into the invoice tender itself, so the cobro's own balance matches the
repricing model, and narrowed the "confirmed at no cost" rule to what Dennis
decided. They need no schema change or migration.
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
| Money already tendered | Resolved arithmetically, never refused — except a surplus with no owner to credit (`STAND_CHANGE_REFUND_NO_OWNER`, `FULL_TABLE_UPGRADE_REFUND_NO_OWNER`): a shortfall reopens the reservation, a surplus comes back as credits, a waiting reservation left fully paid is accepted (§4.6). |
| Late partner | The shared-price difference a late partner paid in credits counts as paid whenever the reservation is repriced. The late-partner fee never does (§4.6). |
| Write-offs | An amount waived with "Confirmar con saldo pendiente" is a fixed concession that survives repricing (§4.6). |
| Free-confirmed reservations | A reservation accepted at no cost (a Bs0 cobro or an approved zero-value entitlement) owes a dearer stand's difference like a paid one. A positive cobro marked paid with no payment rows is only repriced (§4.6). |
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
3. Destination `stands.status` takes the origin's status, unless the §4.6
   outcome changes the reservation's: a balance due makes it `reserved`, an
   acceptance `confirmed`. The origin runs through `releaseStandIfVacant`,
   which returns it to `available` only if nothing else holds it.
4. Price snapshots are re-taken from the destination stand:
   `individual_price_snapshot`, `shared_price_snapshot`, and
   `price_amount_snapshot` — the §4.6 gross: individual or shared by
   `booked_participant_count` (the §6.1 rule), less a late partner's paid
   difference. Leaving them at the origin's values would make every later
   operation — adding a partner, a late partner, a downgrade — reprice from a
   stand the reservation no longer occupies.
5. The invoice is repriced (§4.5).
6. A `stand_reservation_events` row records the move.

The reservation's status follows the §4.6 outcome. A balance due sends it back
to `pending` with its stand `reserved`; a move that leaves a waiting
reservation fully paid accepts it, with its stand `confirmed`; anything else
leaves it as it was, so a paid reservation stays paid on its new stand, and its
new stand is `confirmed`. `reveal_at` is untouched, so a
reservation still under embargo stays under it and the destination keeps showing
as available to participants until the reveal moment.

Moving onto a `disabled` stand consumes the disabled marking — the stand takes
the origin's status, exactly as `createAdminReservation` already flips a disabled
stand to `reserved`. Nothing restores it if the reservation later moves away.

### 4.5 Invoice handling

The invoice is repriced in place — `original_amount` to the new gross (the
price less a late partner's payment, §4.6), `discount_amount` clamped to it,
`amount` recomputed keeping any earlier write-off — exactly as
`downgradeFullTableReservation` does. It is never cancelled and
reissued, for three reasons:

- Call sites resolve "the reservation's invoice" with `.limit(1)`, no
  ordering and no status filter (`adminConfirmReservationByReservationIdAction`,
  `updateReservationPartner`; the full-table downgrade did too). A second row
  makes admin confirmation pick nondeterministically.
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

Every command that changes what a live reservation costs — the switch and the
exchange here, the full-table upgrade (§7), the full-table downgrade and the
admin partner edit — runs the same pure function,
`planReservationRepricing` (`app/lib/reservations/repricing.ts`). The switch,
the exchange and the upgrade then apply its money outcome with the shared
helper `applyReservationRepricing` (`reservation-repricing.ts`). The downgrade
and the partner edit use only its pricing. They never move money or status.

**Inputs.**

- `newStandPrice`: what the command prices. For the switch it is the
  destination's individual or shared price by headcount. For the upgrade it is
  the table price. For the downgrade and the partner edit it is the half's
  individual or shared price by headcount.
- `L`: the shared-price difference a late partner already paid in credits. It
  is the sum of the `shared_price_difference` items of the reservation's
  `fulfilled` `late_partner` actions whose spend has not been reversed
  (`latePartnerPrepaidAmount`), less what an earlier reprice already handed
  back of it (step 3). The late-partner **fee** never counts. It stays
  spent.
- The live invoice's `original_amount`, `discount_amount` and `amount`.
- `covered`: the live cobro's tender `coveredAmount` — approved cash plus
  unreversed credit allocations, less the reservation's outstanding repricing
  refunds, clamped at zero (`coveredAmountForInvoices`, which reads the
  tender). The refund is netted once, in the tender (see **Refunds and the
  cobro's own balance** below), never again by a command.
- The reservation's status, and whether the live cobro went through an
  approved zero-value entitlement.

**Arithmetic.**

1. `gross = max(0, newStandPrice − L)`. This is the new `original_amount` and
   the new `price_amount_snapshot`. The late-partner flow already leaves the
   invoice at the individual price and the difference on the feature action,
   so this keeps that shape. The upgrade still records the raw table price in
   `full_table_price_snapshot`.
2. The discount is clamped to `gross`. An earlier write-off ("Confirmar con
   saldo pendiente", which lowers `amount` below `original − discount`) is
   carried as a fixed amount:
   `writtenOff = max(0, original − discount − amount)` before, and
   `amount = max(0, gross − discount − writtenOff)` after. The row under-reads
   a write-off in one state: a reprice whose price the concession exceeded
   clamped the amount to Bs0 and stored the shrunken figure. On a Bs0 cobro the
   write-off is therefore the larger of the row's and the sum the cobro's own
   `invoice_shortfall_written_off` events recorded (`recordedWriteOffAmount`):
   Bs500 cobro, Bs300 paid, Bs200 waived, moved to a Bs150 stand (Bs300 back)
   and back to Bs500 owes Bs300, not Bs350. (A discount larger than a cheaper
   gross is still clamped and stored, and does not come back on the way up.)
3. `effective` is the new `amount`, except when `L` alone exceeds the new price.
   Then `effective = newStandPrice − L`, which is negative, so the excess comes
   back. A discount or write-off larger than the price never makes `effective`
   negative, because a concession is not money anybody paid. A refund therefore
   never exceeds `covered + L`. The excess part of such a refund is the late
   partner's money, not the cobro's: the grant records it
   (`latePartnerRefundAmount` in its metadata), it comes off `L` for every
   later reprice, and the cobro's tender never nets it. I500/S800 with the
   Bs500 cobro paid and a Bs300 late partner, moved to an S200 stand, gets
   Bs600 back (Bs100 of it the late partner's); moved back to S800 it owes
   Bs600 — `800 − (300 − 100)` on the cobro — and paying it leaves the cobro at
   Bs0.
4. `owed = effective − covered`.

**Outcome.** Nothing about money moves unless `gross` differs from the old
`price_amount_snapshot` (a null snapshot counts as a change). A late-partner
reservation moved to an identically priced stand is a no-op. A reservation
with no invoice (an external participant) settles nothing either.

| Comparison | Outcome |
| --- | --- |
| `owed > 0`, and `covered > 0` or confirmed at no cost | **Balance due.** |
| `owed > 0`, `covered == 0`, not confirmed at no cost | Reprice only. A pending reservation already owes; a cobro paid outside the system is not measured. |
| `owed == 0`, and `covered > 0` or `L > 0` | **Fully paid.** A waiting reservation is accepted. |
| `owed < 0` | **Overpaid.** A waiting reservation is also accepted. |
| `owed == 0`, `covered == 0`, `L == 0` | Nothing to resolve. |

**Confirmed at no cost** (`confirmedAtNoCost`) means `accepted` with nothing
covered, and either a live cobro of Bs0 before the reprice (a 100% discount, a
zero-price stand) or an approved `zero_value_entitlement` submission on it (a
command that moves no money, like the downgrade, can have raised the amount
since). A dearer stand reopens such a reservation for the difference exactly
as it would a paid one (Dennis, 2026-09-29).

A positive cobro marked paid with no payment rows is **not** that: the money
came in outside the system (legacy "paid without payment" rows), and nothing
here can measure it. It keeps the behaviour from before this batch — the cobro
is repriced and stays paid, the reservation stays `accepted`, and nothing is
reopened or refunded, in either direction. (The first cut of this batch
extended the reopen to these rows, which would have billed the whole new
amount for a stand already paid; it was narrowed on 2026-09-30.) A
`verification_payment` reservation with nothing covered is not confirmed
either, and is only repriced.

**Balance due.** The invoice already carries the balance on its own —
`outstanding` is `amount - covered`, with the same net `covered` the plan used,
so repricing upward is all it takes for the right number to appear everywhere:
the participant's payment screen, the proof amount, the credits they may
apply, the approval's exact match and the admin console. What has to change is the reservation:

- status back to `pending`, because `accepted` means paid and this one is not;
- the stand from `confirmed` to `reserved`, because a stand left `confirmed`
  under a pending reservation reads as paid on every map and report that trusts
  `stands.status`;
- a **fresh payment deadline measured from the move** — five days, the same
  window a booking gets — on the invoice's `due_at` and a new `scheduled_tasks`
  row. The task belongs to the owner. A legacy row with no owner gives it to
  the live invoice's holder, then to the first participant, as the admin
  deadline extension does. Only a reservation with neither gets no task.

The deadline restarts rather than being inherited because the participant is
being asked for money they did not owe when the first clock started, and the
acceptance already completed the original task: reviving its dates would make
the balance overdue the instant it exists. A new row is created rather than the
completed one revived, because that row's `completed_at` told the truth.

If the balance is never paid it becomes an ordinary overdue pending
reservation. Nothing new happens to it; the existing deadline machinery already
governs that case.

**Fully paid.** A `pending` reservation, or a `verification_payment` one with
no comprobante in review, is accepted in the same transaction. It gets the
same write set as every other acceptance (`applyAcceptedReservation`): the
reservation becomes `accepted`, the invoice `paid`, the `stand_reservation`
task is completed, every live member stand becomes `confirmed`, and a
`settlement_approved` event is written. Without this, it would sit at
`pending` with nothing to pay and no way to confirm it. No notification is
sent, as with every other admin repricing. An `accepted` reservation stays
`accepted`.

As a repair for rows an older build left in that state, "Confirmar reserva"
(`adminConfirmReservation`) accepts a reservation directly when nothing is in
review and `covered` is positive and equals the cobro's amount exactly — read
net of refunds, so a cobro reopened after a refund is never accepted for free.
The match is exact, as in every other acceptance: a cobro paid beyond its
amount (credits applied, then a partner removed or a lower amount set) is
refused with `PAYMENT_AMOUNT_MISMATCH`, so the surplus can still be handed back
with "Devolver créditos" instead of being locked in by a paid cobro.

**Overpaid.** The surplus is granted back as credits — an ordinary `admin_grant`
ledger entry carrying its reason, visible in the wallet and reversible from the
credit screen like any other. Credits rather than cash because they are the only
refund instrument this product has; inventing a payout path from a stand change
would be a far larger decision than the move itself. The reservation stays or
becomes `accepted`, and its stand `confirmed`: it is more than covered.

The grant inherits the command's idempotency key. The ledger is append-only, so
a retry that reached the grant twice would hand over the difference twice. A
reservation with no owner (a legacy row) has nobody to credit. The switch
refuses it with `STAND_CHANGE_REFUND_NO_OWNER`, as the upgrade refuses with
`FULL_TABLE_UPGRADE_REFUND_NO_OWNER`, and never with a retryable conflict.

**Lock order.** Handing credits back needs the owner's credit account locked,
and the canonical order places credit accounts *before* stands — earlier than
prices are known. The preview pass therefore takes the lock whenever any money
sits against the invoices, or the reservation has a late partner's payment
(`L` alone can exceed a cheaper stand's price). A surplus discovered under the
locks without that lock held returns `CONFLICT_RETRY` rather than locking out
of order. Most moves have neither and skip it. The switch previews the invoice
payers along with owners and participants, because the aggregate lock
discovers them. `L` is read under the reservation lock, which `addLatePartner`
takes too.

**Both sides.** An exchange runs this per side, independently. One participant
can owe a balance while the other receives credits, from the same command.

**Credits leaving the cobro later.** A refund is a grant; the allocation it
came out of stays standing. Every path that later hands the cobro's credits
back — cancelling the reservation, rejecting its voucher with a cancellation,
and "Devolver créditos" — goes through `releaseReservationInvoiceCreditsInTx`
(`repricing-refunds.ts`). It releases each allocation whole, then posts a
negative `admin_adjustment` tagged `standChangeRefundReservationId` for the
part of that wallet's outstanding refunds the release just returned again. In
effect the release is capped at allocations less refunds, never below zero:
Bs500 in credits, moved to a Bs300 stand (Bs200 back) and cancelled, returns
Bs300, not Bs500. The tagged offset counts negative in
`standChangeRefundedAmount`, so a refund netted once is not netted again, and a
partial release nets only what it released. It is netted per wallet: a refund
larger than the credits released (funded by cash) keeps the rest, and a refund
whose recipient released nothing on this cobro is left alone. The "Devolver
créditos" dialog states the net amount before the admin confirms
(`creditReleasePreview`, from the tender's `refundedAmount`), with a line
saying how much already came back and why; the toast repeats the final figure.

**Refunds and the cobro's own balance (2026-09-30).** A refund is a grant into
the wallet that leaves the payments and allocations standing, so the rows
alone overstate what still pays the cobro. Before this, the refund was
subtracted only inside the repricing plan (`netCoveredAmount`), and the
cobro's tender ignored it: Bs500 paid, moved to Bs300 (Bs200 back), moved back
to Bs500 reopened a Bs200 balance that the cobro showed as Bs0 outstanding, so
the participant could not pay it and "Confirmar reserva" accepted it for free;
500 → 300 → 600 asked the participant for Bs100 while the plan owed Bs300.

The tender now nets it. `loadInvoiceTenders` (`tender-queries.ts`) — the one
reader behind both `getInvoiceTenderTotalsInTx` (every locked settlement path)
and `fetchInvoiceTenders` (every list screen and the participant's summary) —
reads the reservation's outstanding repricing refunds (tagged grants less
release offsets, unreversed; `repricing-refund-ledger.ts`) and attributes them
to its live cobro, exposed as `InvoiceTender.refundedAmount`:
`coveredAmount = approvedCash + confirmedCredits − refundedAmount`, never
negative. `approvedCashAmount` and `confirmedCreditAmount` stay the gross row
facts. A cancelled cobro carries none.

Both creation paths insert exactly one invoice per reservation and repricing
keeps it that way, so in practice the whole refund lands on the one live
cobro. Nothing in the schema enforces it, so a second live cobro is handled
deterministically (`attributeRepricingRefunds`): in ascending id, each cobro
absorbs up to its own tender and passes the rest on, whichever cobros a reader
asked about. Nothing should be left over: the one refund larger than the
tender, a late partner's payment beyond a cheaper price, reaches the tender
without its late-partner part (step 3), and the clamp at zero is only a guard.
Netting that part here clamped it away on the cheap stand and brought it back
against the next payment, so a paid cobro showed a balance.

What still reads the raw rows, on purpose: the downgrade's money blocker and
the self-service release's "anything paid" check refuse on real money rows,
refunded or not. The participant's payment summary shows the refund as its own
line ("Devuelto en créditos por un cambio de espacio"), so paid, returned and
owed add up.

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
- when a late partner already paid the shared-price difference, that it counts
  as paid: the cobro is the table price less that amount, and the late-partner
  fee is not deducted;
- that an amount an admin earlier wrote off ("confirmar con saldo pendiente")
  is kept, and also comes off the new cobro;
- what happens to money already paid (§7.4), in the reservation's own terms.
  "Ya hay Bs X pagados" includes the late partner's payment. The reservation
  stays pending or goes back to pending (a reservation confirmed at no cost
  included), credits come back, it is confirmed because what was paid covers
  the table, or only the amount changes;
- that the upgrade cannot be undone once real money sits on the cobro
  (approved cash, unreversed credits, a proof in review or a legacy payment
  row), because the downgrade refuses those (§7.4);
- that no credits are charged and nobody is notified now. On a balance, the
  payment reminder task is moved to one day before the new deadline, or
  created for the owner. A legacy row with no owner gets it for the cobro's
  holder.

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
2. `full_table_price_snapshot` takes the table price. `price_amount_snapshot`
   takes the repricing gross: the table price less a late partner's payment
   (§4.6), which is the table price when there is none.
   `individual_price_snapshot` and `shared_price_snapshot` stay the kept half's,
   because the downgrade prices the surviving half from them. The one exception
   is a legacy row with no individual snapshot, which gets the kept stand's
   individual price so a later downgrade does not price the half at zero.
3. When the gross changes, every non-cancelled invoice is repriced in place
   (§4.5).
4. Money already paid is resolved as in §4.6 (see §7.4). That can mean
   reopening a balance, refunding credits, or accepting a waiting reservation.
   Acceptance runs after the companion joins, so it confirms both halves.
5. Both halves' `stands.status` follow the resulting reservation status:
   `confirmed` when it is `accepted`, otherwise `reserved`.
6. A `status_changed` event records the upgrade (§9).

The participant set, `booked_participant_count`, the parent `stand_id` and
`reveal_at` are untouched. The table price does not depend on headcount.

### 7.4 Money

This is the §4.6 model, unchanged, priced at the table (`planFullTableUpgrade`
wraps `planReservationRepricing`). `covered` is the live cobro's tender
coverage: approved cash plus unreversed credit allocations, less the earlier
refund grants tagged `standChangeRefundReservationId` that the tender nets. A
surplus is granted back with that same tag, so a later switch or upgrade nets
it out instead of paying it twice, and the reopened cobro shows the same
balance the plan asked for.
Tests pin these behaviours:

- A late partner's payment counts as paid. On an I500/S800 half with the Bs500
  cobro and a Bs300 difference paid, a Bs1200 table has a gross of 900 and a
  balance of 400.
- An `accepted` reservation confirmed at no cost (a zero-value entitlement)
  is reopened for the difference the discount does not reach. #551 left it
  `accepted` with its cobro marked paid. Dennis changed that on 2026-09-29.
  An accepted half whose positive cobro is marked paid with no payment rows is
  only repriced, as before (the dialog says so).
- An earlier write-off is carried. A Bs300 cobro with Bs100 written off and
  Bs200 paid, upgraded to a Bs450 table, becomes a Bs350 cobro with a Bs150
  balance. #551 priced it from scratch and asked for Bs250.
- A `pending` half that the table leaves exactly paid, or overpaid, is
  accepted in the same transaction, and both halves are `confirmed`. The
  success message says so, and so does a replay (the registry stores
  `accepted`).
- Once real money sits on the cobro, the downgrade refuses
  (`FULL_TABLE_NOT_DOWNGRADABLE`). A paid upgraded table cannot go back to
  half a table.

**The downgrade's money check (2026-09-29).** It used to refuse on any
`payments` or allocation row, so rows with no money behind them blocked a
table for good: the payment row a rejected comprobante leaves, and an
allocation whose credits were already handed back (the §7.7 cleanup in
PRD-paid-reservation-addons). It now refuses only on real money, judged per
cobro like the tender: a submission in review (comprobante or zero-value
request), unreversed credits, approved cash, or a payment row no submission
vouches for (legacy). The predicate is `fullTableDowngradeMoneyBlockerInTx`
(`full-table-downgrade-queries.ts`). The service runs it under the invoice
locks; the edit page runs it to disable "Reducir a media mesa" with the
reason; the upgrade dialog's one-way-door warning uses it too. A full table
from before table pricing (no `full_table_price_snapshot`) is never refused
for money, since its cobro already was one half's price. When the downgrade
runs, it reprices every live cobro, not one arbitrary invoice row.

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
A replay rebuilds the same success message, including a reopened balance, the
credits returned, or the acceptance.

### 7.6 What it deliberately does not do

- **No credits, no `reservation_feature_actions` row, no credit hold**, as in
  §6.3. A participant's own `full_table_access` action or hold is left alone.
- **No festival feature-config or category check**, as in §6.3.
- **No notification.** On a balance, the reservation's `stand_reservation`
  task is moved to the new deadline, or created for the owner (or, with no
  owner, for the cobro's holder). An acceptance completes it.
- **No participant self-service path.**

### 7.7 Partner edits on a full table

`synchronizeReservationParticipantPricing` now leaves a full table's price
alone. When `full_table_price_snapshot` is set, adding or removing a partner
updates only `booked_participant_count`. Before this change, the first partner
edit after an upgrade repriced the invoice back down to one half's price.

On a half, the partner edit prices with the §4.6 gross: the headcount's price
less a late partner's payment. It carries the write-off too. It still only
reprices `pending` invoices, and never reopens, refunds or accepts. Removing a
late partner therefore bills the individual price less the difference already
paid. Adding someone back returns the cobro to the shared price less that same
difference. The full-table downgrade prices the surviving half the same way.
It also never moves money or status.

### 7.8 Resolved questions (Dennis, 2026-09-29)

- **A late partner who already paid the shared-price difference in credits.**
  The difference counts as paid whenever the reservation is repriced: by the
  switch, the exchange, the upgrade, the downgrade and the partner edit. The
  late-partner fee does not count (§4.6).
- **`addLatePartner` on a full table.** When `full_table_price_snapshot` is
  set, a late partner costs the feature fee only, and the shared-price
  difference is 0, because the table price does not depend on headcount.
  (Implemented separately from the repricing model. A difference charged
  before that rule still counts as paid, so a later downgrade to a shared half
  nets it.)
- **A `pending` reservation repriced to at or below what is covered.** It is
  accepted in the same transaction, with the normal acceptance write set
  (§4.6). If the price went below what is covered, the surplus also comes back
  as credits.
- **A reservation confirmed at no cost.** It owes a dearer stand's or table's
  difference like a paid one: it goes back to `pending` with the balance due.
  "At no cost" means a Bs0 cobro (full discount, zero-price stand) or an
  approved zero-value entitlement. A positive cobro marked paid with no
  payment rows (money received outside the system) is not included: it is
  only repriced, never reopened or refunded (narrowed 2026-09-30).
- **A write-off.** It is a fixed concession that survives repricing. A move to
  a cheaper stand never reopens a settled reservation because the write-off
  was lost.

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
establishes the pattern for a manual correction: `status_changed` with the
action in the payload, and `from_status = to_status` when the status does not
move.

```text
{ action: "stand_switched",  fromStandId, toStandId, fromPrice, toPrice,
                             counterpartReservationId: null }
{ action: "stand_exchanged", fromStandId, toStandId, counterpartReservationId,
                             fromPrice, toPrice }
{ action: "full_table_manually_upgraded", keptStandId, addedStandId,
                             fromPrice, toPrice, settlement, settlementAmount,
                             latePartnerPrepaid? }
```

The switch, the exchange (each side) and the upgrade record the real resulting
status (§4.6): `to_status` is `pending` when a balance reopened the reservation
and `accepted` when the reprice left a waiting reservation fully paid, not a
copy of `from_status`. An acceptance also writes the normal acceptance's
`settlement_approved` event.

`fromPrice` is the `price_amount_snapshot` before. For the switch and the
exchange, `toPrice` is the new snapshot — the §4.6 gross, net of a late
partner's paid difference, so the two stay comparable. For the upgrade it is
the table price, and the payload carries `latePartnerPrepaid` when a late
partner's payment was netted out of it. The reservation console labels the
upgrade "Amplió la reserva a mesa completa", with the table price and any
balance or credits returned.

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
- The pure model (`repricing.test.ts`) covers Dennis's worked cases: an
  identical stand after a late partner is a no-op; I400/S600 gives a Bs300
  cobro and Bs200 back; a Bs1200 table gives a Bs900 gross and a Bs400
  balance; a zero-value reservation owes a price rise, while a positive cobro
  paid with no payment rows is only repriced; a write-off is kept (a
  Bs500 cobro with Bs200 waived and Bs300 paid, moved to Bs400, becomes a
  Bs200 cobro and Bs100 back, with no reopen); exact coverage accepts; a late
  partner's payment above the new price is refunded.
- `repricing.integration.test.ts` covers, end to end: a switch, an upgrade, a
  downgrade and partner edits with a late partner; acceptance by a switch and
  by an upgrade; moving to a pricier stand and back confirms again; a
  zero-value reservation reopened; a write-off carried; a refund with no owner
  refused with `STAND_CHANGE_REFUND_NO_OWNER`; a reopened balance with no owner
  gets its task for the cobro's holder; and "Confirmar reserva" repairing an
  older row left pending with nothing outstanding.
- `credit-release-and-downgrade.integration.test.ts` covers: a reservation
  refunded by a cheaper move and then cancelled returns only the rest of its
  credits, once; "Devolver créditos" after a refund returns the rest, and a
  later move refunds in full; a partial release nets only what it released; a
  cash-funded refund keeps what the released credits cannot cover; a refund
  an admin reverted is not netted. The downgrade runs after a rejected
  comprobante and after its credits were handed back, and refuses (with the
  same reason the edit page shows) on an approved payment, a comprobante in
  review and a legacy payment row; it reprices the live cobro only, and never
  blocks a full table from before table pricing.
- The same file covers the refund staying netted on the cobro: 500 → 300 →
  500 reopens with Bs200 outstanding on the cobro and in the participant's
  summary, and a Bs200 proof approved confirms it; 500 → 300 → 600 asks for
  Bs300; a credits-paid reservation pays the reopened difference with its
  refund and a later cancel returns exactly what was put in; "Confirmar
  reserva" refuses while the net balance is open, and the admin console shows
  it as "Parcial" with the net figures; a refund across two live cobros is
  attributed the same way from any reader, and a cancelled cobro nets none.
  `invoice-tender-summary.integration.test.ts` pins the participant summary
  to the canonical tender with a refund, a reverted refund and a reversed
  allocation.
- Review follow-ups (2026-09-30), in `repricing.integration.test.ts`: a late
  partner's excess refunded on an S200 stand is asked for again on the way
  back to S800 (Bs600, all on the cobro) and the approved proof leaves the
  cobro at Bs0; "Confirmar reserva" refuses a cobro a partner removal left
  paid beyond its amount (`PAYMENT_AMOUNT_MISMATCH`), writes nothing, and the
  credits can still be handed back; a Bs200 write-off made by the command
  survives a Bs150 stand and back (Bs300 owed, not Bs350); an exchange whose
  counterpart a late partner alone overpays refunds it and accepts it with
  its stand confirmed and a `stand_exchanged` event to `accepted`; an
  ownerless counterpart with a payer is refused with
  `STAND_CHANGE_REFUND_NO_OWNER`. In
  `credit-release-and-downgrade.integration.test.ts`: "Confirmar con saldo
  pendiente" on a cobro reopened after a refund waives the Bs200, and a later
  cheaper move carries it.
