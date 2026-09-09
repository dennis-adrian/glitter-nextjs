# Implementation: Admin Reservation & Settlement Console

**Product:** Glitter
**Date:** 2026-09-08
**Status:** Implemented (2026-09-08)
**Target:** Next.js 16 App Router, React 19, PostgreSQL/Drizzle

---

## 1. Decision

Merge `/dashboard/festivals/[id]/payments` into `/dashboard/festivals/[id]/reservations`, producing one
admin console over one row: a reservation and the single invoice attached to it.

The merge is not the point. The point is that "payment" currently means three different things in the
admin UI, and the reservation is the only object that can hold all three coherently. A reservation
invoice is now settled by up to three tenders — a QR voucher, a credit allocation, and a discount —
and no admin screen can show more than one of them.

Deliver in this order:

1. a canonical **tender projection** available to every read path;
2. a **coverage cell** that replaces both current payment-status columns;
3. the **missing admin operations** (un-apply credits, refund on cancel, write-off confirm);
4. the **merge** itself, which by then is deleting a route and a duplicate table.

Ship 1–3 first. They are worth doing even if the merge is rejected, and they make the merge a
column-visibility change rather than a rewrite.

## 2. Why this shape

### 2.1 The two pages are already the same query

| Page                                   | Root table           | Relation loaded              |
| -------------------------------------- | -------------------- | ---------------------------- |
| `festivals/[id]/reservations/page.tsx` | `stand_reservations` | `invoices → payments`        |
| `festivals/[id]/payments/page.tsx`     | `invoices`           | `reservation → participants` |

Same join, opposite root, same festival scope, same `canViewAdminReservationData` gate. One invoice
per reservation is the real invariant: both creation sites insert exactly one
(`hold-service.ts:978`, `admin-actions.ts:303`), and every read assumes it — `full-table-service.ts`
uses `.limit(1)` on `reservationId`, and `reservations/columns.tsx:308` reaches for `row.invoices[0]!`
with a non-null assertion no constraint backs.

Eight of roughly fifteen distinct columns overlap. The duplication has already drifted:

- `payments/payment-status.tsx` renders the raw four-value `InvoiceStatus`, admin-mutable via a popover.
- `reservations/cells/payment-status.tsx` renders `DisplayPaymentStatus`, read-only, with a sixth value
  (`Atrasado`) the other does not have.
- The two tables' status filter option lists therefore disagree about what states exist.

An admin comparing the two screens sees different answers about the same invoice.

### 2.2 `payments` is not a ledger

`submitPaymentProof` **updates the most recent payment row in place** rather than inserting
(`payment-service.ts:425-437`): `UPDATE payments SET amount = tender.outstandingAmount, voucher_url = …`.
There is one live `payments` row per invoice, forever, and re-uploading destroys the previous one.

The row is a _current voucher_, not a payment. Its `amount` is always overwritten to whatever credits
did not cover. So `payments.amount` is already the correct cash figure — the UI simply never shows it,
displaying `invoices.amount` in a column labelled "Monto" beside a column labelled "Comprobante".
An admin looking at `Bs200` and one voucher cannot tell it is `Bs120` credits plus `Bs80` QR.

### 2.3 Three tenders, one four-value status column

| Tender    | Table                        | Counts when                                                  |
| --------- | ---------------------------- | ------------------------------------------------------------ |
| Cash / QR | `payments`                   | an `invoice_settlement_submissions` row for it is `approved` |
| Credits   | `invoice_credit_allocations` | on insert — no review step                                   |
| Discount  | `invoices.discount_amount`   | not a tender; it lowers the bill                             |

`invoices.status` has no partial value. Credits covering 60% of an invoice leave it `pending`,
indistinguishable from an invoice nobody has touched.

### 2.4 The truth already exists server-side and no dashboard loads it

`getInvoiceTenderTotalsInTx` (`payment-service.ts:244`) returns exactly the needed shape —
`approvedCashAmount`, `confirmedCreditAmount`, `coveredAmount`, `outstandingAmount` — and
`fetchInvoiceTenderSummary` (`data/invoices/actions.ts:47`) exposes it for a single invoice.

Neither list query uses either. `fetchInvoicesByFestival` loads `payments + reservation + user`;
`fetchReservationsByFestivalId` loads `invoices → payments`. Neither loads
`invoice_credit_allocations` or `invoice_settlement_submissions`, and `InvoiceWithParticipants` has no
field for allocations. Both admin tables are structurally blind to credits.

## 3. Goals

- Show, per reservation, what is owed and what has covered it, broken down by tender.
- Give an admin an action for every state a reservation can reach, including the states credits created.
- Never destroy a participant's credits without returning them.
- Make every offered control either work or say why it will not.
- Preserve one vocabulary for payment state across admin and participant screens.
- Surface the reservation event history that is already recorded and never displayed.
- Leave `/dashboard/festivals/[id]/payments` links working.

## 4. Non-goals

- Multiple invoices per reservation.
- Multiple simultaneous cash vouchers against one invoice (see §16).
- Refunding cash. Only credits are returnable in this scope.
- Changing the participant-facing payment flow beyond shared helpers and wording.
- Selling credits from an admin screen (`adjustCreditAccount` already covers grants).
- Cross-festival reporting or exports.

## 5. Defects this replaces

These are live and each has a specific fix below.

### 5.1 Credits applied to a cancelled reservation are destroyed

`rejectInvoiceSettlement` with `correction: "cancel_reservation"` cancels the invoice and reservation
(`payment-service.ts:1196-1215`) and never touches `invoice_credit_allocations`. A participant who
applied `Bs120` of credits and had their voucher rejected loses the credits with no record and no route
to recovery.

`adjustCreditAccount` deliberately refuses to undo a spend, and says so in a comment
(`credits/service.ts:1174-1177`): _a spend is undone by whatever booked it — reversing it from this
screen would leave the thing it paid for standing with no matching money._ That is correct. The
operation it defers to does not exist.

### 5.2 `set_amount` can strand an invoice permanently

`rejectInvoiceSettlement` with `correction: { type: "set_amount", amount }` writes `invoices.amount`
without consulting existing allocations (`payment-service.ts:1237-1245`).

Invoice `Bs200`, credits `Bs120`, admin corrects the amount to `Bs50`:

- `outstandingAmount = max(0, 50 - 120) = 0`
- `submitPaymentProof` refuses — `outstandingAmount <= 0` → `INVOICE_NOT_PENDING`
- `applyInvoiceCredits` refuses — same guard
- `approveSubmissionInTx` refuses forever — `120 + 0 !== 50` → `PAYMENT_AMOUNT_MISMATCH`

The reservation is unreachable by every path. `applyInvoiceCredits` guards its own arithmetic with an
explicit `throw new Error("invoice_credit_overallocation")`; the admin correction has no equivalent.

### 5.3 An admin cannot confirm a partially covered reservation

`adminConfirmReservation` routes through `approveSubmissionInTx`, which requires
`covered + submittedCash === invoice.amount` exactly (`payment-service.ts:1027-1035`). "Confirmar
reserva" on an invoice with credits but no exact-remainder voucher fails with
`PAYMENT_AMOUNT_MISMATCH`, whose message — _"El importe del comprobante no coincide con el saldo
pendiente"_ — describes a voucher that in this case does not exist. There is no admin override.

### 5.4 Extended deadlines are ignored by the dashboard

`extendReservationPaymentDeadline` writes `invoices.due_at` (`admin-service.ts:739`).
`mapPaymentStatusToDisplayPaymentStatus` (`payments/helpers.ts:110`) recomputes overdue as
`createdAt + 5 days` and never reads `due_at`. An admin extends a deadline and the table still shows
`Atrasado`. `invoice-card.tsx` hardcodes the same five days; only `reservation-detail.tsx` reads
`due_at`. Three implementations of "when is this due", two wrong.

### 5.5 Festival admins are offered controls that always fail

`reservations/cells/actions.tsx` has no role gate, so a `festival_admin` sees Editar, Extender plazo,
Cancelar and Eliminar. Every corresponding server action checks `canMutateAdminReservations`, which is
global-admin-only, so all four fail. The payments table gates correctly on `isAdmin`; the reservations
table does not.

### 5.6 "Aplicar descuento" is enabled on invoices that will reject it

`payments/cells/actions.tsx` disables the item on `status !== "pending"` or an existing
`discountCodeId`. `applyDiscountCode` additionally refuses when any credit allocation exists
(`discount_codes/actions.ts:232-241`). The item is enabled and always fails on credited invoices.

### 5.7 Participant-voiced errors shown to admins

`reservations/errors.ts` messages address the participant — _"No tenés créditos confirmados
suficientes"_, _"Ya tenés una compra de créditos en revisión"_. Admin surfaces render these verbatim.

### 5.8 The event log is written and never read

`stand_reservation_events` records eleven event types with actor, transition and JSON payload, indexed
by `(reservation_id, created_at)`. No component reads it. An admin asking "who confirmed this and
when" has no answer in the product.

## 6. The tender projection

One shape, one rule, every consumer.

### 6.1 Type

```ts
// app/lib/payments/tender.ts
export type InvoiceTender = {
  /** invoices.amount — the bill after any discount. */
  totalAmount: number;
  /** Sum of payments backing an approved settlement submission. */
  approvedCashAmount: number;
  /** Sum of non-reversed invoice_credit_allocations. */
  confirmedCreditAmount: number;
  /** Cash on a submission still awaiting review. Informational; not covered. */
  submittedCashAmount: number;
  coveredAmount: number;
  outstandingAmount: number;
};

export type InvoiceTenderInput = {
  amount: number;
  allocations: { amount: number; reversed: boolean }[];
  payments: { id: number; amount: number }[];
  submissions: {
    paymentId: number | null;
    status: "submitted" | "approved" | "rejected";
  }[];
};

export function computeInvoiceTender(input: InvoiceTenderInput): InvoiceTender;
```

`computeInvoiceTender` is pure and synchronous. `getInvoiceTenderTotalsInTx` keeps its SQL form for the
locked write paths — the arithmetic and rounding move into `computeInvoiceTender`, which the SQL path
calls with the rows it selected. One rule, two access patterns, no second definition.

`submittedCashAmount` is new and deliberately excluded from `coveredAmount`. It is what the coverage
cell needs to distinguish "nobody has paid" from "a voucher is sitting in the queue" without pretending
an unreviewed voucher is money.

### 6.2 Reversed allocations

An allocation is reversed when a ledger entry points at its spend:

```sql
NOT EXISTS (
  SELECT 1 FROM credit_ledger_entries r
  WHERE r.reverses_entry_id = invoice_credit_allocations.ledger_entry_id
)
```

`credit_ledger_entries.reverses_entry_id` already exists with a self-FK, and `adjustCreditAccount`
already uses exactly this predicate to detect a double-undo (`credits/service.ts:1188-1193`). No
schema change is required to make allocations reversible.

### 6.3 Loading it in lists

Extend both festival queries with the two missing relations:

```ts
invoices: {
  with: {
    payments: true,
    creditAllocations: { with: { ledgerEntry: true } },
    settlementSubmissions: true,
  },
},
```

Both relations are already declared on `invoicesRelations` (`db/schema.ts:1611-1626`) and unused. For
the reversal predicate, select allocations through a `leftJoin` on the reversal entry rather than
relying on the relational builder, or expose it as a small SQL projection alongside the relational
query. A festival's reservation count is in the hundreds; a per-invoice N+1 is not acceptable, a
single extra query keyed by invoice id is.

## 7. Coverage: one status vocabulary

Delete `DisplayPaymentStatus` and `mapPaymentStatusToDisplayPaymentStatus`. Replace with a derivation
over `(invoice.status, tender, invoice.dueAt, reservation.status, now)`:

| State          | Condition                                                        | Label       |
| -------------- | ---------------------------------------------------------------- | ----------- |
| `unpaid`       | `covered = 0`, no submitted proof                                | Sin pagar   |
| `partial`      | `0 < covered < total`, no submitted proof                        | Parcial     |
| `under_review` | a `submitted` settlement exists                                  | En revisión |
| `overdue`      | `unpaid` or `partial`, `dueAt < now`, reservation not `accepted` | Atrasado    |
| `paid`         | `invoice.status = 'paid'`                                        | Pagado      |
| `cancelled`    | `invoice.status = 'cancelled'`                                   | Cancelado   |

`overdue` reads `invoices.due_at`, fixing §5.4 for every consumer at once. `invoice-card.tsx` drops its
`PAYMENT_DUE_DAYS` constant and calls the same derivation.

No new enum value and no new column: `invoices.status` stays a four-value settlement state, and
coverage is computed from rows that already exist. State the invoice does not need to remember is not
worth storing.

The cell renders the label, the split, and a coverage bar:

```
Bs200   ███████░░░   Bs120 créditos · Bs80 QR en revisión
Bs350   ██████████   Pagado
Bs150   ░░░░░░░░░░   Atrasado · venció el 03/09 14:00
```

## 8. Missing admin operations

### 8.1 `releaseInvoiceCredits` — un-apply credits

New export in `app/lib/reservations/payment-service.ts`. Global admin only.

```ts
releaseInvoiceCredits(input: {
  invoiceId: number;
  allocationId?: number;   // omit to release every active allocation
  reason: string;
  idempotencyKey: string;
})
```

Under `lockInvoiceClaimKeys` + `lockCreditAccount`, for each active allocation:

1. Post a `credit_ledger_entries` row: positive `amount`, `type: 'admin_adjustment'`,
   `reverses_entry_id` = the allocation's `ledger_entry_id`, `metadata` carrying
   `{ kind: 'invoice_credit_release', invoiceId, allocationId, reason }`.
2. Re-read the tender; assert `covered` dropped by exactly the released amount.
3. Insert a `stand_reservation_events` row, `status_changed`, payload
   `{ kind: 'invoice_credits_released', … }`.
4. Notify the owner.

`admin_adjustment` is the only ledger type the `credit_ledger_entries_type_amount_direction` check
permits to be positive-and-corrective (`top_up` and `admin_grant` mean something else, and `reversal`
is constrained negative because it exists to claw back a rejected top-up). No enum addition, no
migration.

Preconditions, each with a distinct admin-facing refusal:

- invoice is `pending` or `verification_payment` — a settled invoice is not unwound from here;
- no `submitted` settlement — reject or approve the voucher first;
- at least one non-reversed allocation.

### 8.2 Refund credits when a settlement rejection cancels

In `rejectInvoiceSettlement`, the `cancel_reservation` branch calls `releaseInvoiceCredits`' internal
`releaseInvoiceCreditsInTx` before cancelling the invoice. Same transaction, same lock, so a cancelled
reservation can never leave allocated credits stranded. Fixes §5.1.

Audit the other cancellation paths for the same hole — `cancelReservation`
(`admin-service.ts:331`) and `applyReservationCancellation` (`admin-service.ts:183`), which the
scheduled-expiry job also reaches. Every path that cancels an invoice must return its credits.

### 8.3 Guard `set_amount` and `restore_amount`

In `rejectInvoiceSettlement`, before writing `invoices.amount`, compute the tender and refuse when the
new amount would fall below `confirmedCreditAmount`:

```
if (newAmount < tender.confirmedCreditAmount) return reservationFailure("AMOUNT_BELOW_CREDITS");
```

New error code, admin-voiced: _"El monto no puede quedar por debajo de los Bs{n} en créditos ya
aplicados. Devolvé los créditos antes de bajar el monto."_ This is the memory-aligned fix — narrow the
precondition rather than add state to recover from the violation. `restore_amount` raises the amount so
it cannot trip the guard, but runs the same check for symmetry. Fixes §5.2.

### 8.4 `adminSettleInvoiceShortfall` — confirm with a write-off

The escape hatch §5.3 lacks. Global admin only, requires a typed reason.

In one transaction: set `invoices.amount = tender.coveredAmount`, insert a `stand_reservation_events`
row recording the written-off delta and the reason, then run the existing approval path. The exact-match
invariant in `approveSubmissionInTx` is preserved rather than weakened — the invoice is brought down to
what was actually tendered, and the difference is recorded as a deliberate admin act instead of a
silent tolerance.

Refuse when `coveredAmount = 0`; that is a free reservation, and `confirmFreeInvoice` already handles it.

### 8.5 Admin-voiced error messages

Split `reservations/errors.ts` into participant and admin message maps over the same code union, or add
an `audience` parameter. Fixes §5.7. Admin phrasings must name the object and the operator's next step,
not the participant's.

## 9. Routes and lenses

```
/dashboard/festivals/[id]/reservations?lens=reservas   (default)
/dashboard/festivals/[id]/reservations?lens=cobros
/dashboard/festivals/[id]/reservations?lens=creditos
/dashboard/festivals/[id]/payments                     → redirect to ?lens=cobros
```

`lens` lives in the URL so `payment-confirmation-for-admins.tsx:59` keeps working after the redirect and
so an admin can send a colleague the queue they are looking at. The page component reads `searchParams`,
maps `lens` to a `DataTableInitialState`, and passes it down — the same mechanism `PaymentsTable`
already uses to drive its tabs through `initialState.columnFilters`.

Within `cobros`, keep the existing status tabs (Todos / Pagados / En revisión / Pendientes /
Cancelados), with `Parcial` and `Atrasado` added now that coverage can express them.

Delete `app/dashboard/reservations/[id]/payments/page.tsx`. It renders the literal string `Payments`
and nothing links to it.

## 10. Columns

Nineteen defined, eight to eleven visible per lens. `DataTableViewOptions` already lets an admin
override any preset.

| id                    | Title                | reservas | cobros | créditos |
| --------------------- | -------------------- | :------: | :----: | :------: |
| `select`              | —                    |    ●     |   ●    |    ●     |
| `id`                  | ID                   |    ●     |   ●    |    ●     |
| `stand`               | Espacio              |    ●     |   ●    |    ●     |
| `artists`             | Participantes        |    ●     |        |          |
| `owner`               | Titular              |          |   ●    |    ●     |
| `participantCategory` | Categoría            |    ●     |   ●    |    ●     |
| `status`              | Estado de la reserva |    ●     |   ●    |    ●     |
| `coverage`            | Pago                 |    ●     |   ●    |    ●     |
| `totalAmount`         | Total                |          |   ●    |    ●     |
| `creditAmount`        | Créditos             |          |   ●    |    ●     |
| `cashAmount`          | QR                   |          |   ●    |          |
| `outstandingAmount`   | Saldo                |          |   ●    |    ●     |
| `proof`               | Comprobante          |          |   ●    |          |
| `reviewAge`           | En revisión desde    |          |   ●    |          |
| `dueAt`               | Vencimiento          |    ●     |   ●    |          |
| `features`            | Extras               |          |        |    ●     |
| `collaborators`       | Colaboradores        |    ●     |        |          |
| `createdAt`           | Creación             |    ●     |   ●    |    ●     |
| `actions`             | —                    |    ●     |   ●    |    ●     |

`owner` is the invoice holder — the person who owes and whose credits apply. `artists` is everyone on
the stand. They are different questions and the current pages each answer only one.

`features` summarises `reservation_feature_actions` (`full_table_access`, `late_partner`,
`reservation_release`) — the other way credits attach to a reservation, currently invisible on both
pages.

`reviewAge` is how long the oldest `submitted` settlement has waited. It is the queue's actual sort key.

## 11. Actions

One menu, grouped, with every item present in every state. A control that vanishes reads as a broken
feature; a disabled control with a reason teaches the state machine.

**Reserva** — Editar · Extender plazo de pago · Bajar a media mesa · Cancelar · Eliminar
**Cobro** — Aplicar descuento · Subir comprobante · Corregir comprobante · Aprobar · Rechazar · Confirmar con saldo pendiente
**Créditos** — Devolver créditos aplicados · Ver cuenta de créditos
**Historial** — Ver historial

Preconditions and refusals:

| Action                        | Enabled when                                     | Disabled reason                                             |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Aplicar descuento             | `pending`, no discount, **no credit allocation** | "No se puede aplicar un descuento después de usar créditos" |
| Subir comprobante             | `outstanding > 0`, no active proof               | "El saldo ya está cubierto"                                 |
| Corregir comprobante          | an active proof exists                           | "No hay comprobante que corregir"                           |
| Aprobar / Rechazar            | a `submitted` settlement exists                  | "No hay nada en revisión"                                   |
| Confirmar con saldo pendiente | `covered > 0`, `outstanding > 0`                 | "No hay saldo cubierto para confirmar"                      |
| Devolver créditos             | active allocation, no `submitted` settlement     | "Resolvé el comprobante en revisión primero"                |
| Bajar a media mesa            | full table, no payment and no allocation         | "La mesa ya tiene pagos o créditos aplicados"               |
| Extender plazo                | reservation `pending`                            | "Solo se extienden reservas pendientes de pago"             |
| every mutation                | actor is a global admin                          | "Solo un administrador global puede hacerlo"                |

The discount row encodes §5.6; the credits row is the precondition that keeps §8.1 safe; the last row
is §5.5, applied to both tables by passing `canMutate` from the page instead of leaving `ActionsCell`
ungated.

## 12. Detail drawer

Row expansion, or a sheet — not a route. An admin working a queue should not lose their filters.

1. **Resumen** — stand(s), owner, participants, reservation status, festival.
2. **Cobro** — the tender breakdown: original, discount, credits, approved cash, submitted cash,
   outstanding. Reuse `PaymentSummary`, which already renders exactly these lines.
3. **Créditos** — each allocation with amount, date, ledger entry, reversed state and, when reversed,
   who reversed it and why. Plus feature actions charged to this reservation. Link to the owner's
   `CreditAccountPanel` at `/dashboard/users/[profileId]`.
4. **Comprobantes** — every `invoice_settlement_submissions` row: kind, status, reviewer, timestamp,
   rejection reason, voucher thumbnail. This is the history `payments` cannot hold because it is
   overwritten in place (§2.2) — the submissions table is where the sequence actually survives.
5. **Historial** — `stand_reservation_events` ascending: actor, type, transition, rendered payload.
   Fixes §5.8.

## 13. Terminology

- Drop `factura` from every admin-visible string. It implies tax invoicing, which this is not. Use
  **cobro** for the object and **monto** for the figure. Current offenders: "Factura no encontrada",
  "No autorizado para esta factura", "Esta factura ya no admite un comprobante".
- **Comprobante** for the voucher image. Never "pago" — the participant sends proof, not money.
- **Pago** for the column that answers what has happened with the money, and
  **Saldo pendiente** for what is still owed. Not "Cobertura": it named the sum
  of the tenders accurately but had to be explained, which a column header
  cannot afford.
- Page title becomes **Reservas y cobros**.

## 14. Permissions

| Capability                          | admin |     festival_admin     |
| ----------------------------------- | :---: | :--------------------: |
| View console, all lenses            |   ●   |           ●            |
| View drawer, history, credit detail |   ●   |           ●            |
| Every mutation in §11               |   ●   | ○ disabled with reason |

Matches the server: `canViewAdminReservationData` allows both, `canMutateAdminReservations` allows only
global admins. The UI stops offering what the server will refuse.

## 15. Phasing

**Phase 1 — Tender projection.** `app/lib/payments/tender.ts` with `computeInvoiceTender`;
`getInvoiceTenderTotalsInTx` refactored onto it; both festival queries load allocations and
submissions; types extended. No UI change. Unit tests for the arithmetic, including the
reversed-allocation and over-allocation cases.

**Phase 2 — Coverage cell.** Coverage derivation replaces `DisplayPaymentStatus` in both existing
tables and in `invoice-card.tsx`. Both tables keep their routes. `due_at` replaces the hardcoded five
days everywhere. Ships §5.4 on its own.

**Phase 3 — Admin operations.** `releaseInvoiceCredits`, the cancel-path refund, the `set_amount`
guard, `adminSettleInvoiceShortfall`, admin-voiced errors, `canMutate` gating on
`reservations/cells/actions.tsx`. Integration tests. Ships §5.1, §5.2, §5.3, §5.5, §5.7.

**Phase 4 — Merge.** Merged column set, lenses, unified actions menu, detail drawer, `/payments`
redirect, delete the stub route and `payments/table.tsx` + `payments/columns.tsx`.

Phases 1–3 are independently shippable and each closes real defects. Phase 4 is reversible — the
redirect is one line.

### What shipped, and where it differs from the plan

All four phases landed, in four commits. Three deviations are worth recording, because each one is a
place the plan was wrong rather than a shortcut:

**The credit release lives in `credits/service.ts`, not the settlement service.** The plan put
`releaseInvoiceCreditsInTx` next to `rejectInvoiceSettlement`. That creates an import cycle:
`payment-service` already imports `applyReservationCancellation` from `admin-service`, and the
cancellation path is the one that most needs to refund. `releaseInvoiceCreditAllocationsInTx` sits in
the credits service, which neither reservation module imports back.

**The refund happens inside `applyReservationCancellation`, not in each caller.** The plan named
`rejectInvoiceSettlement` and said to "audit the other cancellation paths". Auditing them found the
same hole in `cancelReservation` and the expiry job, so the refund went into the one function they all
reach. A caller cannot forget it.

**`settleInvoiceShortfall` does not always route through `approveSubmissionInTx`.** §8.4 assumed it
could. It cannot when credits alone cover the invoice: the approval path requires either a
`payment_proof` submission with a payment id, or a `zero_value_entitlement` on an invoice of exactly
zero, and a credits-only write-off is neither. The command now settles the invoice to
`covered + submittedCash`, then approves the submission when there is one and applies the accepted
transition directly when there is not. The exact-match invariant is still never loosened.

Two smaller notes:

- `ViewPaymentProofCell` and `PaymentProofModal` were narrowed to the fields they actually read, so
  the reservation-rooted row can pass its own shape instead of being converted into an invoice-rooted
  one.
- The `expiration` column (createdAt + `RESERVATION_EXPIRATION_HOURS`) was replaced by `dueAt`, which
  is what an admin extends. It was the third implementation of "when is this due".

## 16. Deliberately unchanged

**One cash voucher per invoice.** Supporting several would mean making `payments` append-only,
un-mutating `submitPaymentProof`, and relaxing the exact-match invariant in `approveSubmissionInTx` to a
running sum with partial approvals. That is a settlement-engine change, not a dashboard change. Every
observed case is credits plus one closing voucher, which the current engine already models correctly.
The tender projection is built so that lifting this later changes `computeInvoiceTender`'s inputs, not
its consumers.

**`invoices.status` stays four values.** Coverage is derived. Adding `partially_paid` would put two
sources of truth on the same fact.

**No migration in this scope.** Every fix above works on the existing schema. One optional invariant is
worth considering separately: a unique index on `invoices.reservation_id` would retire the
`row.invoices[0]!` assertion in §2.1. It requires first counting reservations with more than one
invoice on each live database, and it is a schema change — so it belongs in its own change, generated
with `pnpm generate` from `db/schema.ts` and applied only on Dennis's call.

## 17. Test plan

**Unit — `app/lib/payments/tender.test.ts`**

- credits only, partial; credits only, exact; cash only; credits + cash
- allocation reversed → excluded from covered, outstanding rises
- submitted-but-unapproved cash → `submittedCashAmount` set, `coveredAmount` unchanged
- rejected submission's payment → excluded
- rounding at two decimals; over-allocation never yields negative outstanding

**Unit — coverage derivation**

- each of the six states; `overdue` honours an extended `due_at`; `overdue` suppressed once accepted

**Unit — actions menu**

- each precondition row in §11 renders disabled with its exact reason
- `festival_admin` sees every mutation disabled, no mutation hidden

**Integration — `app/lib/reservations/credit-settlement.integration.test.ts`**

- `releaseInvoiceCredits` restores balance, marks the allocation reversed, is idempotent under a
  repeated key, and refuses while a settlement is `submitted`
- `rejectInvoiceSettlement` + `cancel_reservation` on a credited invoice returns the credits
- `set_amount` below `confirmedCreditAmount` is refused and leaves the invoice reachable — the §5.2
  regression, asserted by then successfully submitting and approving a voucher
- `adminSettleInvoiceShortfall` lowers the amount to covered, approves, and records the write-off event
- a partial credit allocation still permits a voucher for exactly the remainder, end to end

New integration files must be added to the explicit list in `package.json`'s `test:integration` script;
it does not glob.

**E2E**

- credited-and-partially-paid reservation shows the split in the coverage cell
- lens switch changes columns without losing filters
- `/payments` redirects to `?lens=cobros`

## 18. Verification commands

Node 24. A test database is required; spin up the per-worktree container rather than pointing at a real
one — `.env.local`'s `POSTGRES_URL` has no fixed target and must be resolved and stated before any
command that touches a database.

```bash
pnpm db:test:up && pnpm migrate:test && pnpm test:integration
```

```bash
pnpm exec vitest run
pnpm exec eslint <changed files>
pnpm format:check
pnpm build
```

## 19. Acceptance criteria

- Every admin surface showing an invoice shows total, credits, cash, and outstanding.
- One payment-status vocabulary across admin and participant screens.
- Overdue is computed from `invoices.due_at` everywhere; extending a deadline clears `Atrasado`.
- No path cancels an invoice while leaving credits allocated to it.
- No admin correction can leave an invoice unreachable by every settlement path.
- An admin can resolve any reservation state without a database console.
- Every action is either enabled and functional, or disabled with a specific reason.
- `festival_admin` is never offered a mutation the server will refuse.
- The reservation event history is visible per reservation.
- `/dashboard/festivals/[id]/payments` still resolves.
- No admin-visible string says "factura".

## 20. Deferred follow-ups

- Multiple cash vouchers per invoice (§16).
- Unique index on `invoices.reservation_id`, after counting violations.
- Cash refunds.
- Bulk actions over the selection the table already supports.
- CSV export of the settlement queue.
- Per-festival tender totals on the festival detail page.
- A dedicated `refund` ledger entry type, if `admin_adjustment` proves too coarse in the history view.
