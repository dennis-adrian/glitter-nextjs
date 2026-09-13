# IMPLEMENTATION — Finanzas (internal finance management)

**Status:** design agreed, not started
**Branch:** `claude/finanzas-implementation`
**Route namespace:** `/dashboard/finanzas`
**Owner:** Dennis

---

## 1. What this is

An internal finance-management module for Glitter, embedded in this repo as a feature vertical. It replaces
the "Finanzas Glitter" Google Sheet and retires YNAB for Glitter purposes.

It answers four questions the Sheet cannot answer reliably:

1. **What does Glitter owe each person, right now?** (and what is owed to Glitter)
2. **Did this festival actually make money?**
3. **Can we afford the next edition?**
4. **Where did the money go?**

### What it is not

Management accounting only. Explicitly out of scope, permanently:

- No facturas, no SIAT, no IVA/IT/retenciones, no filings, no statutory reporting
- No financial statements anyone signs, no accountant deliverable, no trial balance, no period close
- No payroll tax, no depreciation
- The word **factura** appears in no display string. Use _cobro_ / _monto_.

### Why embedded rather than a separate app

- ~71% of the Sheet's money (Gastos 42%, Personal 27%, debt/fixed 2%) has zero schema representation today,
  but that new data only earns its keep through foreign keys into `festivals`, `users`, `stand_reservations`.
- The load-bearing invariant — _a staff payout settled as a free stand is one event with two legs_ — must
  commit atomically with the stand allocation. A network boundary cannot provide that.
- Stand income (17.5% of the Sheet's money cells) is already derivable in-process via `computeInvoiceTender`
  ([app/lib/payments/tender.ts](../app/lib/payments/tender.ts)).
- There is no authenticated machine API in this repo. The only `Authorization` handling is the cron bearer
  secret in [app/lib/cron/auth.ts](../app/lib/cron/auth.ts). A separate app means building auth before
  building any finance logic.

---

## 2. Decisions already taken

| #   | Decision                                                                    | Consequence                                                                                                                                 |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Embedded feature vertical at `/dashboard/finanzas`                          | Follows house pattern: `app/lib/finanzas/{definitions,queries,service,actions}.ts` → `app/components/finanzas/` → `app/dashboard/finanzas/` |
| D2  | Management scope only                                                       | See §1                                                                                                                                      |
| D3  | Real double-entry, presented as signed amounts                              | No "debe"/"haber" anywhere in any UI string                                                                                                 |
| D4  | Access: **`admin` only**, not `festival_admin`                              | Needs its own gate — the existing dashboard layout admits both (§9.1)                                                                       |
| D5  | Payees/payers are standalone records, **not** linked to `users`             | No FK to `users`; simpler seeding, no dependency on profile state                                                                           |
| D6  | Amounts must be editable by an admin                                        | Implemented as correction-by-reversal presented as an edit (§8)                                                                             |
| D7  | Import: debt ledger line-by-line; historical festival tabs **not** imported | Closed editions stay in the Sheet as archive                                                                                                |
| D8  | v1 includes automatic stand income **and** merch revenue                    | Pulls in gated prerequisites (§7) — the largest risk in the plan                                                                            |
| D9  | Hard cutover; Sheet becomes read-only on a named date                       | Date TBD — anchors all opening balances (§10)                                                                                               |
| D10 | FX display rate is user-selectable: BCB oficial _or_ paralelo               | Forces display-only revaluation (§6)                                                                                                        |
| D11 | YNAB retired for Glitter                                                    | App becomes the single home for Glitter money                                                                                               |

---

## 3. Core model

### 3.1 The rule

Every transaction is an **entry** made of two or more **lines**. Each line puts a signed amount on an
**account**. The lines of an entry sum to zero, per currency. That is the whole of double-entry that this
system needs.

Five account types with fixed signs (Beancount's model — no debit/credit column):

| Type        | Sign of a normal balance | Examples                                  |
| ----------- | ------------------------ | ----------------------------------------- |
| `asset`     | +                        | Efectivo, Cuenta Mercantil, Cuenta BCP    |
| `liability` | −                        | Préstamos de Dennis, sueldos por pagar    |
| `equity`    | −                        | Apertura, conversión                      |
| `income`    | −                        | Ingresos por stands, ingresos por tienda  |
| `expense`   | +                        | Alquiler de espacio, publicidad, personal |

A balance is `SUM(amount)`. Nothing stores a balance.

### 3.2 What double-entry buys, and what it does not

**Buys:**

- Errors cannot be saved. The Sheet has at least five confirmed arithmetic defects (a Bs 4,000 expense
  outside its SUM range; three Total rows skipping their first data row; a Bs 5,920 income error from
  discount rows entered with the wrong sign; four tabs whose stand counts disagree with their own rows;
  a hardcoded `Disponible = 0` copy-propagated across five editions). An unbalanced entry cannot COMMIT.
- Balance-sheet questions become answerable. "What does Glitter owe Dennis" is the accumulated other half
  of dozens of transactions — a stock, not a flow. No single-entry system can produce it.
- Multi-leg events are atomic. A staff stand, a split payment, a cross-currency settlement are 3–4 legs each.

**Does not buy — state this plainly so nobody over-trusts it:**

- Sum-to-zero would **not** have caught `Deudas` booked as a Gastos line (Bs 11,783.45 / 4,963.25 /
  2,497.49 / 1,688.16 across five tabs). A repayment mis-posted to an expense account still balances.
  What catches that is the **five-type taxonomy** plus the rule in §3.3.

### 3.3 The rule that catches the `Deudas` class of error

> A festival's result is the sum of its `income` and `expense` lines. Nothing else. And an entry whose
> template only moves balance-sheet accounts may not carry a `festival_id`.

Two parts, enforced in two places, because `festival_id` lives on the **entry**, not the line:

1. **The taxonomy is the guard.** The `festivales/[id]` query sums lines whose account `type` is `income` or
   `expense`, joined to entries with that `festival_id`. A loan repayment posts to a `liability` account, so
   it cannot enter a festival result no matter how it is tagged. This is what would have caught `Deudas`
   booked as Gastos — the Sheet had no account types, so the label was the only thing distinguishing a
   repayment from a cost.
2. **Balance-sheet templates are unattributable.** `traspaso`, `prestamo_recibido`, `pago_prestamo`,
   `adelanto_a_persona`, `ajuste_de_caja` and `apertura` touch no result account, so a `festival_id` on them
   is noise at best and a filter bug at worst. A plain CHECK on `finance_entries`
   (`finance_entries_balance_sheet_templates_unattributed`, §4.3) rejects it — both columns are on the same
   row, so no trigger is needed.

An earlier draft phrased this as "a line on a `liability` or `equity` account may not carry a
`festival_id`, as a CHECK". That cannot be implemented (a `CHECK` on `finance_lines` cannot see the entry) and
would be wrong if it could: `sueldo_devengado` and `pago_sueldo_con_stand` put a `pasivos:sueldos:<persona>`
leg in a festival-attributed entry on purpose. A liability leg **inside** a festival entry is fine; it is
simply not part of the result. Trigger 2 (§4.11) adds the converse: an entry that carries a `festival_id`
must have at least one `income` or `expense` line.

---

## 4. Schema

Nine tables. All additive — no existing table is restructured. Uses the existing `money()` helper
([db/schema.ts:22](../db/schema.ts), `numeric(12,2)` mode `number`).

### 4.1 `finance_accounts`

The chart of accounts. ~25 rows, **seeded in code**, no editor in the UI.

```ts
export const financeCurrencyEnum = pgEnum("finance_currency", ["BOB", "USD"]);

export const financeAccountTypeEnum = pgEnum("finance_account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);

export const financeAccountRoleEnum = pgEnum("finance_account_role", [
  "cash_rail", // a real place money sits
  "counterparty", // a person or vendor Glitter owes or is owed by
  "category", // an expense or income bucket
  "equity",
  "control",
]);

export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // 'pasivos:prestamos:dennis_usd'
    name: text("name").notNull(), // 'Préstamos de Dennis (USD)'
    type: financeAccountTypeEnum("type").notNull(),
    role: financeAccountRoleEnum("role").notNull(),
    currency: financeCurrencyEnum("currency").notNull(),
    counterpartyId: integer("counterparty_id").references(
      () => financeCounterparties.id,
      {
        onDelete: "restrict",
      },
    ),
    sortOrder: integer("sort_order").default(0).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("finance_accounts_code_unique").on(t.code),
    unique("finance_accounts_id_currency_key").on(t.id, t.currency),
    // Target of the (id, currency, role) FKs from budget lines and balance assertions (§4.6, §4.8).
    unique("finance_accounts_id_currency_role_key").on(
      t.id,
      t.currency,
      t.role,
    ),
    check(
      "finance_accounts_code_shape",
      sql`${t.code} ~ '^[a-z0-9]+(:[a-z0-9_-]+){1,2}$'`,
    ),
    check(
      "finance_accounts_counterparty_is_a_balance",
      sql`${t.role} <> 'counterparty' OR ${t.type} IN ('asset', 'liability')`,
    ),
    check(
      "finance_accounts_rail_is_an_asset",
      sql`${t.role} <> 'cash_rail' OR ${t.type} = 'asset'`,
    ),
    // IAS 21.23(b) as a constraint: a consumed expense is measured once, never retranslated.
    check(
      "finance_accounts_results_are_local",
      sql`${t.type} NOT IN ('expense', 'income') OR ${t.currency} = 'BOB'`,
    ),
  ],
);
```

`finance_accounts_results_are_local` is load-bearing: it means only monetary accounts (counterparty, cash
rail) are ever non-BOB, so the ~25-account chart does not double per currency.

**Per-currency accounts are deliberate.** "Dennis BOB" and "Dennis USD" are two accounts, because a
Bs-denominated loan handed over in dollars is a Bs 3,000 obligation forever and must never be revalued.
This is how the Sheet's _"aquí no se aplica el tipo de cambio"_ annotation becomes structural (§6.3).

### 4.1.1 Cash rails and the USD card rule

Glitter has exactly **three** cash rails, **all denominated in BOB**:

| Code                | Name             | Note                                          |
| ------------------- | ---------------- | --------------------------------------------- |
| `activos:mercantil` | Cuenta Mercantil | Receives QR payments. Glitter's main account. |
| `activos:bcp`       | Cuenta BCP       |                                               |
| `activos:efectivo`  | Efectivo         |                                               |

**Dennis's personal USD-settling account is never a Glitter rail.** It is used only when there is no other
option, and every charge on it is recorded as a **loan to Dennis** — a liability, not cash. This is already
Glitter's practice and the model must not "improve" on it.

Two consequences, and they settle a question that was open through most of the design:

1. **The SaaS/ads rows are genuinely USD-denominated.** Dennis is charged dollars, so Glitter owes dollars.
   The Bs figures in the Sheet (Bs 196.00, Bs 154.94, …) were **conversions Dennis computed himself**, not
   amounts anyone charged. They are memos, not obligations — which is exactly why those balances are
   understated as the rate moves (§6.10).
2. **Seed no `cash_rail` account with currency USD.** There is no way to pay a USD debt without a boliviano
   crossing, and buying dollars first merely relocates the exchange difference to the purchase entry.

The mirror case stays intact: where Dennis lent dollars specifically to cover a **boliviano** obligation
(_"lo prestado fue para cubrir 3000Bs"_), Glitter owes bolivianos and the balance is never revalued (§6.3).

### 4.2 `finance_counterparties` (D5)

Standalone payee/payer registry. **No FK to `users`** — deliberately decoupled.

```ts
export const financeCounterparties = pgTable(
  "finance_counterparties",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(), // 'Dennis', 'Enrique', 'Mamá de Andreíta', 'Resend'
    kind: financeCounterpartyKindEnum("kind").notNull(), // 'person' | 'vendor'
    notes: text("notes"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("finance_counterparties_name_unique").on(t.name)],
);
```

A counterparty gets one account per currency it transacts in, created on demand.

### 4.3 `finance_entries`

```ts
export const financeEntries = pgTable(
  "finance_entries",
  {
    id: serial("id").primaryKey(),
    occurredOn: date("occurred_on").notNull(), // when it happened
    recordedAt: timestamp("recorded_at").defaultNow().notNull(), // when it was typed
    description: text("description").notNull(),
    template: financeEntryTemplateEnum("template").notNull(),
    festivalId: integer("festival_id").references(() => festivals.id, {
      onDelete: "restrict",
    }),
    // Receipt photo via uploadthing. Same pair `payments` uses for vouchers
    // (`voucher_url` + `file_key`); the key is what storage cleanup deletes.
    receiptUrl: text("receipt_url"),
    receiptFileKey: text("receipt_file_key"),
    idempotencyKey: text("idempotency_key").notNull(),
    reversesEntryId: integer("reverses_entry_id"),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("finance_entries_idempotency_key_unique").on(t.idempotencyKey),
    uniqueIndex("finance_entries_receipt_file_key_unique")
      .on(t.receiptFileKey)
      .where(sql`${t.receiptFileKey} IS NOT NULL`),
    index("finance_entries_occurred_idx").on(t.occurredOn),
    index("finance_entries_festival_idx").on(t.festivalId),
    check(
      "finance_entries_occurred_on_sane",
      sql`${t.occurredOn} BETWEEN '2024-01-01' AND CURRENT_DATE + 365`,
    ),
    check(
      "finance_entries_receipt_pair",
      sql`(${t.receiptUrl} IS NULL) = (${t.receiptFileKey} IS NULL)`,
    ),
    // §3.3 part 2: templates that touch no income/expense account cannot be festival-attributed.
    check(
      "finance_entries_balance_sheet_templates_unattributed",
      sql`${t.template} NOT IN ('traspaso', 'prestamo_recibido', 'pago_prestamo', 'adelanto_a_persona', 'ajuste_de_caja', 'apertura')
        OR ${t.festivalId} IS NULL`,
    ),
    foreignKey({
      name: "finance_entries_reverses_entry_id_fk",
      columns: [t.reversesEntryId],
      foreignColumns: [t.id],
    }).onDelete("restrict"),
  ],
);
```

**Bi-temporal on purpose.** `occurred_on` vs `recorded_at` are separate because Dennis will enter things
late — the Sheet's "Anotado en YNAB" annotations stop at 26/02/2026 while the ledger runs to 06/09/2026.
Catching up three months of charges in one sitting must place each in its own month without rewriting
anything already reported.

The `occurred_on_sane` CHECK exists because the Sheet contains a row dated **`03/01/0206`**.

### 4.4 `finance_lines`

```ts
function fxRate(columnName: string) {
  return numeric(columnName, { precision: 16, scale: 8, mode: "number" });
}

export const financeLines = pgTable(
  "finance_lines",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => financeEntries.id, { onDelete: "restrict" }),
    accountId: integer("account_id").notNull(),
    currency: financeCurrencyEnum("currency").notNull(),
    amount: money("amount").notNull(), // signed
    // Envelope + commitment attribution (§4.6, §4.7). Plain integers here; the
    // composite FKs below pin currency and the budget-line/commitment pairing.
    budgetLineId: integer("budget_line_id"),
    commitmentId: integer("commitment_id"),

    fxRate: fxRate("fx_rate"), // Bs per 1 unit of fx_counter_currency
    fxRateSource: financeFxRateSourceEnum("fx_rate_source"),
    fxCounterAmount: money("fx_counter_amount"), // signed, same sign as amount
    fxCounterCurrency: financeCurrencyEnum("fx_counter_currency"),
    fxRateNote: text("fx_rate_note"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("finance_lines_entry_idx").on(t.entryId),
    index("finance_lines_account_idx").on(t.accountId),
    index("finance_lines_budget_line_idx")
      .on(t.budgetLineId)
      .where(sql`${t.budgetLineId} IS NOT NULL`),
    index("finance_lines_commitment_idx")
      .on(t.commitmentId)
      .where(sql`${t.commitmentId} IS NOT NULL`),
    check("finance_lines_amount_nonzero", sql`${t.amount} <> 0`),
    // A commitment is always inside an envelope; a line cannot name one without the other.
    check(
      "finance_lines_commitment_implies_budget_line",
      sql`${t.commitmentId} IS NULL OR ${t.budgetLineId} IS NOT NULL`,
    ),
    // full FX CHECK set in §6.2
    foreignKey({
      name: "finance_lines_account_currency_fk",
      columns: [t.accountId, t.currency],
      foreignColumns: [financeAccounts.id, financeAccounts.currency],
    }).onDelete("restrict"),
    // A line can never consume an envelope in another currency.
    foreignKey({
      name: "finance_lines_budget_line_currency_fk",
      columns: [t.budgetLineId, t.currency],
      foreignColumns: [financeBudgetLines.id, financeBudgetLines.currency],
    }).onDelete("restrict"),
    // ...and a commitment it names must belong to that same envelope, in that same currency.
    foreignKey({
      name: "finance_lines_commitment_budget_line_currency_fk",
      columns: [t.commitmentId, t.budgetLineId, t.currency],
      foreignColumns: [
        financeCommitments.id,
        financeCommitments.budgetLineId,
        financeCommitments.currency,
      ],
    }).onDelete("restrict"),
  ],
);
```

The composite FK to `(finance_accounts.id, currency)` means a line's currency **cannot** disagree with its
account's currency. That is what makes the "never revalue a Bs-denominated obligation" rule unfalsifiable
rather than a convention.

The same trick pins envelopes and commitments: `(budget_line_id, currency)` and
`(commitment_id, budget_line_id, currency)` are FKs onto matching UNIQUE constraints in §4.6 and §4.7, so a
line cannot point at a commitment from a different envelope, or at an envelope in a different currency, and
the service layer never has to check either.

### 4.5 Enums

```ts
export const financeCounterpartyKindEnum = pgEnum("finance_counterparty_kind", [
  "person",
  "vendor",
]);

export const financeFxRateSourceEnum = pgEnum("finance_fx_rate_source", [
  "manual",
  "statement_derived",
  "bcb_official",
  "parallel_market",
]);

// 15 values: the 13 named in §9.5 plus ingreso_stands_derivado, which the
// automatic stand-income generator posts under (§7.1), and cobro_participante,
// which settles the receivable that generator creates.
export const financeEntryTemplateEnum = pgEnum("finance_entry_template", [
  "gasto",
  "ingreso",
  "ingreso_stands_derivado",
  "cobro_participante",
  "prestamo_recibido",
  "pago_prestamo",
  "sueldo_devengado",
  "pago_sueldo",
  "pago_sueldo_con_stand",
  "adelanto_a_persona",
  "traspaso",
  "condonacion",
  "apertura",
  "ajuste_de_caja",
  "correccion",
]);

// Three values on purpose. No 'partially_settled': partial discharge is the signed
// Σ of the lines pointing at the commitment, and a stored copy is a second truth
// that drifts. No 'expired' either — a commitment past its due date is still owed;
// age is a display concern.
export const financeCommitmentStatusEnum = pgEnum("finance_commitment_status", [
  "open",
  "settled",
  "cancelled",
]);
```

### 4.6 `finance_budget_lines` — the envelope

```ts
export const financeBudgetLines = pgTable(
  "finance_budget_lines",
  {
    id: serial("id").primaryKey(),
    // Scope: exactly one of these. A NULL festival_id therefore cannot mean
    // "unknown" — the row cannot exist without period_month instead.
    festivalId: integer("festival_id").references(() => festivals.id, {
      onDelete: "restrict",
    }),
    periodMonth: date("period_month"), // first day of month, org-level only
    categoryAccountId: integer("category_account_id").notNull(),
    categoryAccountRole: financeAccountRoleEnum("category_account_role")
      .default("category")
      .notNull(),
    currency: financeCurrencyEnum("currency").notNull(),
    amount: money("amount").notNull(), // presupuestado, always positive
    rollsOver: boolean("rolls_over").default(false).notNull(), // sinking funds, §5.3
    targetAmount: money("target_amount"),
    targetOn: date("target_on"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at"),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("finance_budget_lines_id_currency_key").on(t.id, t.currency),
    uniqueIndex("finance_budget_lines_festival_category_unique")
      .on(t.festivalId, t.categoryAccountId, t.currency)
      .where(sql`${t.festivalId} IS NOT NULL AND ${t.archivedAt} IS NULL`),
    uniqueIndex("finance_budget_lines_period_category_unique")
      .on(t.periodMonth, t.categoryAccountId, t.currency)
      .where(sql`${t.periodMonth} IS NOT NULL AND ${t.archivedAt} IS NULL`),
    check(
      "finance_budget_lines_scope_exactly_one",
      sql`num_nonnulls(${t.festivalId}, ${t.periodMonth}) = 1`,
    ),
    check(
      "finance_budget_lines_period_is_a_month_start",
      sql`${t.periodMonth} IS NULL OR ${t.periodMonth} = date_trunc('month', ${t.periodMonth})::date`,
    ),
    check("finance_budget_lines_amount_positive", sql`${t.amount} > 0`),
    check(
      "finance_budget_lines_category_only",
      sql`${t.categoryAccountRole} = 'category'`,
    ),
    // A festival ends; its envelope has no next period to roll into.
    check(
      "finance_budget_lines_rollover_is_periodic",
      sql`${t.rollsOver} = false OR ${t.periodMonth} IS NOT NULL`,
    ),
    foreignKey({
      name: "finance_budget_lines_account_currency_role_fk",
      columns: [t.categoryAccountId, t.currency, t.categoryAccountRole],
      foreignColumns: [
        financeAccounts.id,
        financeAccounts.currency,
        financeAccounts.role,
      ],
    }).onDelete("restrict"),
  ],
);
```

The composite FK pins account + currency + role in one constraint. Because
`finance_accounts_results_are_local` forces category accounts to BOB, a USD envelope is structurally
impossible — correct, since only monetary accounts are ever non-BOB.

`finance_lines.budgetLineId` FKs here through `finance_budget_lines_id_currency_key`, paired on currency so
a line can never consume an envelope in another currency (§4.4).

### 4.7 `finance_commitments` — the encumbrance stage

```ts
export const financeCommitments = pgTable(
  "finance_commitments",
  {
    id: serial("id").primaryKey(),
    budgetLineId: integer("budget_line_id").notNull(),
    currency: financeCurrencyEnum("currency").notNull(),
    amount: money("amount").notNull(), // comprometido, positive
    status: financeCommitmentStatusEnum("status").default("open").notNull(),
    counterpartyId: integer("counterparty_id").references(
      () => financeCounterparties.id,
      { onDelete: "restrict" },
    ),
    payeeLabel: text("payee_label"), // when no counterparty record exists
    description: text("description").notNull(),
    dueOn: date("due_on"),
    cancelledReason: text("cancelled_reason"),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("finance_commitments_budget_line_idx").on(t.budgetLineId, t.status),
    // Target of finance_lines_commitment_budget_line_currency_fk (§4.4).
    unique("finance_commitments_id_budget_line_currency_key").on(
      t.id,
      t.budgetLineId,
      t.currency,
    ),
    check("finance_commitments_amount_positive", sql`${t.amount} > 0`),
    check(
      "finance_commitments_payee_named",
      sql`${t.counterpartyId} IS NOT NULL OR ${t.payeeLabel} IS NOT NULL`,
    ),
    check(
      "finance_commitments_cancel_has_reason",
      sql`${t.status} <> 'cancelled' OR ${t.cancelledReason} IS NOT NULL`,
    ),
    foreignKey({
      name: "finance_commitments_budget_line_currency_fk",
      columns: [t.budgetLineId, t.currency],
      foreignColumns: [financeBudgetLines.id, financeBudgetLines.currency],
    }).onDelete("restrict"),
  ],
);
```

`finance_lines` carries a nullable `commitment_id`. Discharge is **not** stored:

```sql
-- SIGNED sum. Never abs().
discharged = Σ finance_lines.amount WHERE commitment_id = c.id
comprometido = greatest(c.amount - discharged, 0)   -- for status = 'open'
```

> **Why signed matters.** Correction-by-reversal (§8) is the only way to edit an amount, and a reversal
> carries the same `commitment_id` with a negated amount. Under `Σ abs(amount)` a corrected Bs 300 payment
> against a Bs 1,000 commitment makes `comprometido` read Bs 400 instead of Bs 1,000 — every corrected
> payment silently halves its own encumbrance. Verified against PostgreSQL 16. Express it once as a view so
> no query re-derives it.

### 4.8 `finance_balance_assertions` — the arqueo

```ts
export const financeBalanceAssertions = pgTable(
  "finance_balance_assertions",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull(),
    accountRole: financeAccountRoleEnum("account_role")
      .default("cash_rail")
      .notNull(),
    currency: financeCurrencyEnum("currency").notNull(),
    countedOn: date("counted_on").notNull(),
    countedAt: timestamp("counted_at").defaultNow().notNull(),
    countedAmount: money("counted_amount").notNull(),
    ledgerAmount: money("ledger_amount").notNull(), // what the ledger said at that moment
    padEntryId: integer("pad_entry_id").references(() => financeEntries.id, {
      onDelete: "restrict",
    }),
    countedByUserId: integer("counted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
  },
  (t) => [
    index("finance_balance_assertions_account_idx").on(
      t.accountId,
      t.countedOn,
    ),
    check(
      "finance_balance_assertions_rail_only",
      sql`${t.accountRole} = 'cash_rail'`,
    ),
    // A discrepancy cannot be recorded and abandoned: it must carry its ajuste_de_caja.
    check(
      "finance_balance_assertions_discrepancy_is_reconciled",
      sql`${t.countedAmount} = ${t.ledgerAmount} OR ${t.padEntryId} IS NOT NULL`,
    ),
    foreignKey({
      name: "finance_balance_assertions_account_currency_role_fk",
      columns: [t.accountId, t.currency, t.accountRole],
      foreignColumns: [
        financeAccounts.id,
        financeAccounts.currency,
        financeAccounts.role,
      ],
    }).onDelete("restrict"),
  ],
);
```

No unique index on `(account_id, counted_on)` — event days need an opening and a closing count.

### 4.9 `finance_fx_rates` — observations, not authority

```ts
export const financeFxRates = pgTable(
  "finance_fx_rates",
  {
    id: serial("id").primaryKey(),
    asOfDate: date("as_of_date").notNull(),
    baseCurrency: financeCurrencyEnum("base_currency").notNull(), // USD
    quoteCurrency: financeCurrencyEnum("quote_currency").notNull(), // BOB
    rate: fxRate("rate").notNull(),
    source: financeFxRateSourceEnum("source").notNull(),
    isDayDefault: boolean("is_day_default").default(false).notNull(),
    isDisplayDefault: boolean("is_display_default").default(false).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("finance_fx_rates_lookup_idx").on(
      t.asOfDate,
      t.baseCurrency,
      t.quoteCurrency,
    ),
    check("finance_fx_rates_positive", sql`${t.rate} > 0`),
    check(
      "finance_fx_rates_distinct_currencies",
      sql`${t.baseCurrency} <> ${t.quoteCurrency}`,
    ),
    // Many rows per day allowed — the source ledger has two payments on 04/12/2025
    // at 9.2998 and 9.8000. Only the DEFAULTS are unique.
    uniqueIndex("finance_fx_rates_day_default_unique")
      .on(t.asOfDate, t.baseCurrency, t.quoteCurrency, t.source)
      .where(sql`${t.isDayDefault}`),
    uniqueIndex("finance_fx_rates_display_default_unique")
      .on(t.baseCurrency, t.quoteCurrency)
      .where(sql`${t.isDisplayDefault}`),
  ],
);
```

### 4.10 `finance_entry_amendments` — the audit row for narrative edits

§8 lets `occurred_on`, `description`, `fx_rate_note` and the receipt be edited in place. Every such edit
writes one row here, so the ledger stays append-only in substance even where a column is mutable.

```ts
export const financeAmendedFieldEnum = pgEnum("finance_amended_field", [
  "occurred_on",
  "description",
  "fx_rate_note",
  "receipt",
]);

export const financeEntryAmendments = pgTable(
  "finance_entry_amendments",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => financeEntries.id, { onDelete: "restrict" }),
    // fx_rate_note lives on a line; the other three live on the entry.
    lineId: integer("line_id").references(() => financeLines.id, {
      onDelete: "restrict",
    }),
    field: financeAmendedFieldEnum("field").notNull(),
    oldValue: text("old_value"), // as text; NULL when the field was empty
    newValue: text("new_value"),
    reason: text("reason"),
    amendedByUserId: integer("amended_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amendedAt: timestamp("amended_at").defaultNow().notNull(),
  },
  (t) => [
    index("finance_entry_amendments_entry_idx").on(t.entryId, t.amendedAt),
    check(
      "finance_entry_amendments_line_only_for_note",
      sql`(${t.field} = 'fx_rate_note') = (${t.lineId} IS NOT NULL)`,
    ),
    check(
      "finance_entry_amendments_changed_something",
      sql`${t.oldValue} IS DISTINCT FROM ${t.newValue}`,
    ),
  ],
);
```

Append-only like the ledger: the same `BEFORE UPDATE OR DELETE` raise as trigger 3 (§4.11), on this table.
Trigger 4 (`finance_entries_freeze_financials`) is what keeps the _editable_ set closed — anything not in this
enum is edited through `correccion`.

### 4.11 Enforcement — five triggers

`drizzle-kit` cannot emit `CREATE FUNCTION` / `CREATE TRIGGER`. House practice is to generate the table DDL
from `db/schema.ts`, then append hand-written SQL beneath it in a `--custom` migration — exactly as
[drizzle/0259_credit_ledger_integrity.sql](../drizzle/0259_credit_ledger_integrity.sql) does.

> The project rule "never hand-edit migrations" means never patch generated DDL. Appending custom SQL below
> the generated statements is the established exception, and 0259 is the precedent.

| #   | Trigger                                     | On                                          | Enforces                                                                                                                       |
| --- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `finance_lines_balanced`                    | AFTER INSERT ON `finance_lines`, deferred   | `SUM(amount) = 0` per `(entry_id, currency)`                                                                                   |
| 2   | `finance_entries_wellformed`                | AFTER INSERT ON `finance_entries`, deferred | Same aggregate, plus ≥2 legs, plus: `festival_id IS NOT NULL` ⇒ at least one line on an `income`/`expense` account (§3.3)      |
| 3   | `finance_lines_append_only`                 | BEFORE UPDATE OR DELETE ON `finance_lines`  | Raises unconditionally                                                                                                         |
| 4   | `finance_entries_freeze_financials`         | BEFORE UPDATE ON `finance_entries`          | Blocks `template`, `festival_id`, `idempotency_key`, `reverses_entry_id`; leaves `occurred_on` and `description` editable (§8) |
| 5   | `finance_lines_reject_self_cancelling_pair` | AFTER INSERT ON `finance_lines`, deferred   | No two legs on the same `(account_id, currency)` that are exact negatives                                                      |

**Triggers 1 and 2 are both required, and this is not belt-and-braces.** An earlier draft of this design put
the balance check only on `finance_entries`. A verification pass tested it against PostgreSQL 16 and broke
it: after committing a balanced two-leg entry, a second transaction inserted a lone `−99,999.00` line into
that same entry and committed successfully, leaving it summing to −99,999.00. `finance_lines_append_only`
blocks UPDATE and DELETE but **not INSERT**, and an entry-level AFTER INSERT trigger never fires again once
the header row exists. Factor the aggregate into one function taking an entry id and call it from both.

**Trigger 5 replaces a CHECK that cannot work.** An earlier draft said "add a CHECK rejecting any entry with
two lines on the same `(account_id, currency)` whose amounts are exact negatives". A Postgres `CHECK` is
per-row and cannot see sibling rows, so this must be a trigger. The pattern it catches is always either
noise or a modelling error — it is what would have caught the four-leg `pago_sueldo_con_stand` bug (§9.4).

All five are `AFTER ... FOR EACH ROW DEFERRABLE INITIALLY DEFERRED` where deferred; note a
`CONSTRAINT TRIGGER` cannot be `BEFORE`. Triggers 3 and 4 are plain `BEFORE` triggers, not constraint
triggers. Trigger 3's function is reused verbatim on `finance_entry_amendments` (§4.10).

**There is deliberately no `finance_lines_reversal_mirrors` trigger.** An earlier draft had one, requiring a
`correccion`'s lines to mirror the original's with `amount`, `fx_rate` and `fx_counter_amount` sign-flipped.
It is dropped from the database layer because the only writer of a `correccion` is `postEntry()`, which
derives the mirrored legs from the original rows rather than accepting them as input — there is no path by
which a non-mirroring reversal can reach the table. The rule lives in §9.5's preconditions and is pinned by
the §8 integration test (post, reverse, assert `saldo_fc = 0` **and** `base_bob = 0`). If a second writer
ever appears, promote it back to a trigger. An integration test asserts all five directly against `pg_trigger` / `pg_constraint`, copying
[credit-ledger-integrity.integration.test.ts](../app/lib/credits/credit-ledger-integrity.integration.test.ts),
and **must be registered in `package.json`'s `test:integration` list** — that list is hand-enumerated, not a
glob, so an unregistered test silently never runs.

### 4.12 Use one `roundMoney`, and it is the reservations one

Two implementations exist and **they diverge on negative halves**:

- [app/lib/reservations/money.ts:6](../app/lib/reservations/money.ts) extracts the sign first, so it rounds
  half away from zero in both directions.
- [app/lib/programs/pricing.ts:99](../app/lib/programs/pricing.ts) does not, and JS `Math.round(-0.5)` is
  `-0`.

So `roundMoney(-0.005)` returns `-0.01` from the first and `-0.00` from the second. In a ledger where every
entry has negative legs by construction, that is a correctness difference, not a duplication smell.

**The finanzas module uses the reservations implementation exclusively.** Consolidating the two is worth
doing but is not a prerequisite — it touches the programs vertical and belongs in its own change.

---

## 5. Budgets, envelopes and commitments

The Sheet's `Precio | Gastado | Disponible` triple is the one part that genuinely works. It is
**encumbrance accounting**: appropriation → commitment → expenditure. The missing middle stage is what
would have flagged six editions planned at a loss while there was still time to act.

```
Disponible = presupuestado − comprometido − gastado
```

### 5.1 Envelopes are claims on money, not containers of money

Allocating Bs 3,000 to "depósito del local" moves nothing. The cash stays where it is; part of it is now
spoken for. The invariant:

```
Σ(envelope balances) + sin asignar = Σ(cash rails)
```

`sin asignar` is YNAB's _Ready to Assign_ — the number that answers "can I spend this".

### 5.2 Budgets live in a sibling table, not in the ledger

Beancount models envelopes as equity subaccounts. This design does **not**, deliberately: budget rows inside
`finance_lines` pollute every balance query unless every single query remembers to filter them out, and one
forgotten filter is a wrong number on the screen Dennis trusts most. Budgets are a sibling table (Actual
Budget's shape). The invariant above is computed, not enforced by the balance trigger.

This is a real trade and it is recorded here so nobody re-derives it later.

### 5.3 Sinking funds

Recurring USD costs (Resend, Vercel, Railway, Supabase, GSuite, the domain, Meta ads) currently land on a
personal card because nothing is set aside. An envelope with a monthly target makes the renewal a non-event.

### 5.4 Overspend is visible, never silent

An envelope goes negative on screen rather than quietly consuming another envelope's money. This is the
direct fix for the defect in Andreíta's October line — budgeted Bs 7,120, spent Bs 8,902.70 — where the
overspend was then recorded as though she owed Glitter money (§10.3).

---

## 6. Multi-currency

### 6.1 The rule

An obligation denominated in USD stays a USD obligation. Its boliviano value is a translation that moves
with the rate. This is IAS 21 / ASC 830 remeasurement of monetary items — applied for management purposes
only, with no statutory consumer.

**Store `then`, display `now`, post only when bolivianos actually move.**

|                                         |                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stored, immutable**                   | `amount` + `currency` (the denomination), `fx_rate` as typed/edited, `fx_counter_amount` (the Bs actually charged), `fx_rate_source`, `fx_rate_note` |
| **Computed at read time, never stored** | today's Bs value, the weighted-average historical rate, the unrealised difference                                                                    |
| **Posted exactly once**                 | the realised difference, at settlement, when cash moves                                                                                              |

There is **no "Revaluar deudas" action** and there must never be one. Any control that writes a new Bs
figure onto an open USD obligation destroys the invariant.

> **Why display-only, not periodic revaluation.** D10 (selectable oficial/paralelo) makes posting
> revaluation entries unsafe: rows would be written at whichever rate was selected that day, and flipping
> the toggle would then contradict the system's own posted history. A reversible display parameter cannot
> corrupt the ledger; a posted revaluation at the wrong source silently becomes the number of record.

### 6.2 `finance_lines` FX constraints

```ts
// 1. a rate must be positive and name the currency it converts to
check("finance_lines_fx_rate_shape",
  sql`${t.fxRate} IS NULL OR (
    ${t.fxRate} > 0 AND ${t.fxCounterCurrency} IS NOT NULL
    AND ${t.fxCounterCurrency} <> ${t.currency})`),

// 2. a counter amount must name its currency, be non-zero, and point the same way
check("finance_lines_fx_counter_shape",
  sql`(${t.fxCounterAmount} IS NULL AND ${t.fxCounterCurrency} IS NULL)
    OR (${t.fxCounterCurrency} IS NOT NULL
        AND ${t.fxCounterCurrency} <> ${t.currency}
        AND (${t.fxCounterAmount} IS NULL
             OR (${t.fxCounterAmount} <> 0
                 AND sign(${t.fxCounterAmount}) = sign(${t.amount}))))`),

// 3. BOB is the reporting currency: one side of any pair is always BOB
check("finance_lines_fx_pair_includes_local",
  sql`${t.fxCounterCurrency} IS NULL OR ${t.currency} = 'BOB'
    OR ${t.fxCounterCurrency} = 'BOB'`),

// 4. a typed rate and an observed counter amount must agree
check("finance_lines_fx_rate_agrees",
  sql`${t.fxRate} IS NULL OR ${t.fxCounterAmount} IS NULL OR
    abs(CASE WHEN ${t.currency} = 'BOB'
             THEN ${t.amount} - ${t.fxCounterAmount} * ${t.fxRate}
             ELSE ${t.fxCounterAmount} - ${t.amount} * ${t.fxRate} END)
    <= 0.005 * (1 + ${t.fxRate})`),
```

**Scale 8 on `fx_rate`** because a derived rate (154.94 ÷ 15.81 = 9.80012650) must round-trip inside
tolerance against `numeric(12,2)` money on both sides. Changing scale later is a table rewrite.

**Tolerance is `0.005 × (1 + fx_rate)`**, not a flat 0.01: one money side is always the rounded derivative
of the other. `round(230.00 / 12.30, 2) = 18.70`, and `18.70 × 12.30 = 230.01`. A flat 0.01 passes that by
exactly nothing and rejects a large line outright.

### 6.3 The three legal shapes

| Shape                                      | `currency` | `fx_rate` | `fx_counter_amount`  | Example                                 |
| ------------------------------------------ | ---------- | --------- | -------------------- | --------------------------------------- |
| Local                                      | BOB        | NULL      | NULL                 | Cash paid for banners                   |
| Foreign, converted                         | USD        | set       | set (BOB)            | Facebook $15.81, card charged Bs 154.94 |
| Foreign, **rate deliberately not applied** | BOB        | **NULL**  | set (USD, memo only) | _"lo prestado fue para cubrir 3000Bs"_  |

The third shape is the Sheet's annotation made structural. `fx_rate` is forced to NULL — **if a number sat
there, someone would eventually multiply by it.** The USD figure survives as a memo.

There is no `fx_treatment` discriminator column. The account's own currency already carries that fact, and
the composite FK makes it unfalsifiable — the revaluation query's `WHERE a.currency <> 'BOB'` can never
reach a BOB-denominated account.

### 6.4 `finance_fx_rates` — observations, not authority

Many rows per day allowed. The Sheet proves a date-keyed table cannot work: **two Facebook payments on
04/12/2025 went through at 9.2998 and 9.8000.** The rate is a property of the transaction.

- `is_day_default` per (date, currency, source) — pre-fills the entry form
- `is_display_default` per currency — drives every screen

This table never decides what gets posted. Flipping `is_display_default` is one UPDATE, changes every
screen, and writes zero rows to `finance_lines`.

**Do not auto-insert observation rows from posted lines yet.** It is tempting — the transaction rates
would become a free price history, which is hledger's `--infer-market-prices` — but nothing in this design
reads them: the report reads `is_display_default` and the prefill reads `is_day_default`. Add the write when
something consumes it, emit at most one row per `(entry_id, rate, source)`, source it only from `cash_rail`
or `counterparty` legs, and never from a `correccion`.

### 6.5 Cross-currency entries need a conversion control pair

**This is structural and easy to get wrong.** The invariant is `SUM(amount) = 0` **per (entry_id, currency)**
— stricter than Beancount. A cross-currency entry therefore **cannot be two legs**: a BOB expense against a
USD liability leaves BOB at +154.94 and USD at −15.81, and neither is zero. The trigger rejects it.

The fix is a **conversion control account pair per counterparty**, using the `control` role the chart already
has: `control:conversion:dennis` in BOB and in USD. The pair self-liquidates over the life of the debt and
leaves no residual.

A useful free property: `−(control BOB balance) / (control USD balance)` is the **weighted-average historical
rate** of everything still open on that counterparty — exact, with no lot tracking and no extra table.

### 6.6 Seed exactly one rate, dated and labelled

An earlier draft of this document said to seed no rate at all, on the principle that a seeded default is a
guess wearing the authority of a migration. **That is reversed, and the reason matters more than the rule.**

A missing rate degrades into a **blocked form**: the first USD charge Dennis enters is a screen he cannot
submit until he leaves the app to look up a number his card statement does not show. In the Sheet that row
took four seconds. That is the abandonment moment, and it lands on the write path in week one.

A wrong-but-dated rate degrades into a caption he can correct.

So: seed **one** `finance_fx_rates` row — `source = 'manual'`, `note = 'valor inicial — verificar'`,
`as_of_date` = the migration date. Visibly provisional, correctable in one edit.

Context for whoever sets it: Bolivia moved to a **managed float on 29 June 2026** (TCO opened at Bs 9.73 buy
/ 9.83 sell), so the rate now moves daily. Verified against the BCB's own publication at the time of
writing: **Bs 11.52/USD** official, parallel around Bs 12.3.

**Recommended display default: paralelo** — that is the rate at which Dennis must actually acquire dollars to
repay himself, and this is a "can Glitter afford this" module. Oficial stays one tap away and appears as a
permanent grey second line under every USD total whichever way he chooses.

### 6.7 The rate field is optional, never required

Dennis's card statement shows **bolivianos**. The dollar figure is what the vendor invoiced. So the known
quantity at entry time is the Bs amount, not the rate.

The form therefore accepts **whatever he knows**:

| He types | Stored                   | Rate                                                      |
| -------- | ------------------------ | --------------------------------------------------------- |
| Bs only  | `amount` BOB             | none — a plain local expense                              |
| Bs + USD | both                     | **derived** as `Bs ÷ USD`, `source = 'statement_derived'` |
| USD only | `amount` USD, no counter | NULL — the Supabase shape                                 |

Never block a save for a missing rate. The report already carries `saldo_sin_base_fc` for exactly this case.

> **Contradiction resolved.** An earlier draft claimed the rate-less Supabase row "posts as a two-leg pure-USD
> entry". It cannot: `finance_accounts_results_are_local` forces expense accounts to BOB, and
> `finance_lines_amount_nonzero` forbids a zero Bs leg — so the only way to post it through the `gasto`
> template would be to invent a Bs figure, which §6.1 forbids. A rate-less USD row enters as an `apertura`
> against `patrimonio:apertura:usd` during backfill, not through `gasto`.

### 6.8 Settlement — the crux

A Bs payment against a USD debt discharges **only what it buys at that day's rate**.

**Recording** — Facebook, 29/11/2025, Bs 154.94 charged to Dennis's card for a USD 15.81 invoice:

| account                     | cur |  amount |
| --------------------------- | --- | ------: |
| `gastos:publicidad`         | BOB | +154.94 |
| `control:conversion:dennis` | BOB | −154.94 |
| `control:conversion:dennis` | USD |  +15.81 |
| `pasivos:prestamos:dennis`  | USD |  −15.81 |

BOB sums to 0 ✓ USD sums to 0 ✓
Dennis's USD balance reads **−15.81**; the control BOB balance **−154.94** _is_ the historical Bs carrying
amount, available as a plain balance with no extra column. `gastos:publicidad` is frozen at Bs 154.94
forever (IAS 21.23(b) — the debt moves, the expense never does).

**Full settlement today at 12.30, paying Bs 194.46:**

| account                       | cur |     amount |
| ----------------------------- | --- | ---------: |
| `pasivos:prestamos:dennis`    | USD |     +15.81 |
| `control:conversion:dennis`   | USD |     −15.81 |
| `control:conversion:dennis`   | BOB |    +154.94 |
| `gastos:diferencia_de_cambio` | BOB | **+39.52** |
| `activos:mercantil`           | BOB |    −194.46 |

BOB: 154.94 + 39.52 − 194.46 = 0 ✓ USD: 0 ✓
Dennis USD **0.00**, control **0.00 in both currencies**, and the loss is named: **Bs 39.52**.

**Partial settlement** — paying only Bs 154.94 today discharges `154.94 / 12.30` = **USD 12.60**, leaving
**USD 3.21** open. The carrying release is proportional; **the difference leg is the plug**, which guarantees
`SUM = 0` without a separate rounding account. The settlement screen says this out loud before _Guardar_.

**Dennis has already done this by hand.** The −Bs 182.91 row on 29/08/2026 is USD 15.81 at 11.5693 — settled
at that day's rate against a charge booked at 9.80. The feature formalises existing practice.

> **Backfill exception.** For a historical row that discharges a USD obligation, the rate must be **derived**
> as `bs_paid ÷ usd_discharged`, not supplied externally. Using BCB 11.53 for the −Bs 182.91 row discharges
> USD 15.86 against 15.81 outstanding and leaves a phantom $0.05 favour balance. This is the one carve-out
> from "the rate is typed, the Bs is derived" — which is correct only for forward entry.

### 6.9 FX edge cases

- **Overpayment** flips the balance to a favour position on the same account. Allowed, never blocked —
  Andreíta already sits on a flipped sign in the Sheet. No CHECK may forbid a positive balance on a
  liability account.
- **The 29/11/2025 contradiction** — note says 9.30, arithmetic says 9.80013. Arithmetic wins: both money
  figures are observed facts, the note is a later rationalisation. Store both, copy the note verbatim into
  `fx_rate_note`. Do not rewrite the Bs figure and do not drop the note. Entering it as Dennis wrote it
  overshoots the CHECK tolerance by ~150×, so the service layer must validate first and return a
  `FX_RATE_DISAGREES_WITH_AMOUNT` failure code (mirroring
  [app/lib/credits/service.ts](../app/lib/credits/service.ts)) rather than surfacing a raw Postgres
  constraint violation. The UI asks: _"Con 9,80 serían Bs 154,94. ¿Cuál es el correcto?"_
- **The rate-less USD row** is correctly recorded, not defective. Render it `$us 25,25 — sin conversión`.
  **No warning icon and no `[Completar]` action** — the only possible outcome of that action is inventing a
  rate.
- **Period attribution — a real, unmitigated weakness.** Realised-only books the whole FX difference into the
  settlement period. An earlier draft proposed inheriting `festival_id` from the obligation; **that is
  incompatible with the pooled weighted-average basis** used here — a pooled settlement discharges a fraction
  of a blended balance, so there is no single obligation to inherit from. Stated plainly instead: realised FX
  lands where the cash moved. If festival-level accuracy ever matters, the honest fix is a
  settlement-to-obligation link table, which is the tenth table this design declines.
- **Stale display rate.** A computed number has no enforcement. >30 days the header reads
  _"dato de hace N días"_ and goes amber. Note that with a ~2-month annotation half-life in this ledger,
  **degraded is steady state** — so the two-line form `Bs 3.885,83 fijos + $us 75,10` is the permanent
  default, not a fallback.
- **Never mix currencies in a headline.** The Personas total must never be one Bs number summing fixed Bs
  obligations with USD converted at today's rate: it would change overnight with no entry made, and a number
  that moves on its own is indistinguishable from a bug.
- **No USD cash rail in v1.** Glitter holds no dollars; the "USD rail" is Dennis's own card, which is a
  liability to Dennis, not Glitter cash. Seed no `cash_rail` account with currency USD until one genuinely
  opens.
- **Revaluation query filter must be an allowlist**: `WHERE a.currency <> 'BOB' AND a.role IN
('counterparty', 'cash_rail')`. An exclusion list like `role <> 'control'` admits **equity**, and the
  `apertura`-based backfill creates exactly the USD equity account that would then render as a phantom
  counterparty row. Integration test: post an `apertura`-funded USD opening balance, assert the revaluation
  report returns zero rows for equity accounts.

### 6.10 Current exposure (why this matters)

| fecha    | vendor   |       USD | Bs registrado |   tasa |     @11.52 |     @12.30 |
| -------- | -------- | --------: | ------------: | -----: | ---------: | ---------: |
| 28/11/25 | Resend   |     20.00 |        196.00 | 9.8000 |     230.40 |     246.00 |
| 29/11/25 | Facebook |     15.81 |        154.94 | 9.8001 |     182.13 |     194.46 |
| 04/12/25 | Facebook |      9.54 |         88.72 | 9.2998 |     109.90 |     117.34 |
| 04/12/25 | Facebook |      9.75 |         95.55 | 9.8000 |     112.32 |     119.93 |
| 06/12/25 | Vercel   |     20.00 |        186.00 | 9.3000 |     230.40 |     246.00 |
|          |          | **75.10** |    **721.21** |        | **865.15** | **923.73** |

Understated by **Bs 143.94 (20%)** at oficial, **Bs 202.52 (28%)** at paralelo. Plus Supabase USD 25.25
never converted at all (~Bs 291–311, missing from the Sheet's totals entirely).

---

## 7. Derived income (D8 — the expanded v1 scope)

Dennis chose to include **both** automatic stand income and merch revenue in v1. This roughly doubles the
release and pulls in changes to live participant billing. Each prerequisite below is gated: it ships behind
its own flag with its own rollback, and none of them blocks the Phase 1–2 release.

### 7.1 Stand income

Canonical source is `computeInvoiceTender` — approved cash + **non-reversed** credit allocations
([app/lib/payments/tender.ts:106](../app/lib/payments/tender.ts); the non-reversed filter is at :111). The generator must never reimplement it.

**Income definition, fixed here and never re-argued:**

> Recognised revenue = Σ `InvoiceTender.coveredAmount`. Cash received (approved payments + approved top-ups)
> is reported **separately** and is **never added to it** — summing both double-counts the credit leg.

**Prerequisites, each a defect in the current domain:**

| #   | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Fix                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `settleInvoiceShortfall` destructively overwrites `invoices.amount`; the write-off survives only in an unread `stand_reservation_events` jsonb payload ([app/lib/reservations/payment-service.ts](../app/lib/reservations/payment-service.ts))                                                                                                                                                                                                                 | Post a `condonacion` entry instead of overwriting. **Live billing — ship behind a flag, with a parallel-run check.**                                                                |
| P2  | Free/discounted staff stands have no origination path: `createAdminReservation` writes a full-price invoice with no discount path. A `zero_value_entitlement` settlement path exists but nothing creates the zero-price invoice for it                                                                                                                                                                                                                         | Add the origination path. Prerequisite for the `pago_sueldo_con_stand` template.                                                                                                    |
| P3  | External-participant reservations get **no invoice at all** ([app/lib/reservations/capacity-service.ts](../app/lib/reservations/capacity-service.ts)) — sponsors and invited brands read as zero income                                                                                                                                                                                                                                                        | Income query must be a three-way union: invoiced reservations, uninvoiced external participants at snapshot price, and grants. Otherwise the first screen ships a wrong number.     |
| P4  | `stand_reservations.festival_id` is a bare `notNull` integer with **no foreign key**                                                                                                                                                                                                                                                                                                                                                                           | Add the FK as `NOT VALID`, then `VALIDATE CONSTRAINT` in a **separate migration**, so one orphan row in 283 migrations of unenforced history cannot block the ledger's trigger DDL. |
| P5  | **Narrower than it first appeared.** `stand_reservations` already snapshots price at reservation time — `priceAmountSnapshot`, `individualPriceSnapshot`, `sharedPriceSnapshot`, `fullTablePriceSnapshot` ([db/schema.ts:1223](../db/schema.ts)) — so **actual** income is already protected from drift. The gap is only **projected** income for stands nobody has reserved, which reads live `stands.individual_price` and does move when a price is edited. | A price snapshot per edition for the projected side only. Smaller than budgeted; shrinks Phase 4.                                                                                   |

### 7.2 Merch revenue

| #   | Defect                                                                                                                                                                                                                                 | Fix                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6  | Store money is `float4`: `orderItems.priceAtPurchase` ([db/schema.ts:3525](../db/schema.ts)), `products.price` (:2869), `products.discount` (:2881), `productVariants.price` (:2990), `qrCodes.amount` (:2370). **Floats do not foot** | Migrate to `numeric(12,2)`; route store pricing through `roundMoney` — **specifically [app/lib/reservations/money.ts:6](../app/lib/reservations/money.ts)**, see §4.12. |

**P7 (a `festival_id` on `orders`) is deliberately not being done.** Decided 2026-09-12: merch is a
continuous side business, and editions are attributed **by date range** instead.

The rationale is that most merch sales follow a collection launched for an edition, so a window around each
edition captures nearly all of it — without a column, a backfill, or a NULL-policy question. Verified
alternatives, for the record: there is **no collection concept** on `products`, and only _rental_ line items
carry a festival (`orderItems.rentalFestivalId`) — ordinary merch lines have no festival link at all. So
date range is the only option that does not invent new modelling.

**The limitation, stated so it is not rediscovered later.** Attribution is only as good as the window. It
holds while editions are far apart and a collection sells close to its launch. It degrades when two editions
run close together, or when a collection keeps selling months later. Two rules keep it honest:

- Windows must not overlap between editions.
- Every merch figure on a festival report names the window that produced it.

If that ever stops being good enough, the escape hatch is P7 as originally specified — add the column and
backfill from the same windows. Nothing in this design forecloses it.

**P6 is still required regardless of attribution**, because floats do not sum correctly and would put a
rounding error into every revenue total.

> **Risk, stated once.** P1 touches live participant billing in a repo with **no CI, no lint script and no
> git hooks** (verified: no `.github`, no `.husky`, no `lint` script, no `rules` block in
> `eslint.config.mjs`). P6 is a data migration across five columns in the revenue path. If the schedule
> slips, these are the phases to cut — the ledger is complete and useful without them, with stand totals
> typed as one `apertura` figure per edition (~2 minutes, three times a year).

---

## 8. Editability (D6)

Dennis requires that amounts be editable by an admin. The ledger is append-only. These are reconciled as
follows, and the distinction matters:

| Field                                                     | Behaviour                                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`, `fx_rate_note`, receipt attachment         | **Directly editable.** Narrative, not financial. Each edit writes a `finance_entry_amendments` row (§4.10).                                                                                    |
| `occurred_on`                                             | **Editable**, with the change written to `finance_entry_amendments`. It changes no amount and no account, so the ledger stays balanced — and a date typo is the commonest typo (`03/01/0206`). |
| `amount`, `fx_rate`, `account`, `template`, `festival_id` | **Edited through reversal.** The UI button says _Editar_. The service posts a reversing entry plus a corrected one, in one transaction.                                                        |

From Dennis's side this is editing: he changes a number and saves. What the store does is reverse and
re-post, so the history remains intact and every figure stays reproducible. The entry detail screen shows
_"corregido el 14/09 — ver original"_.

A reversal must copy `fx_rate` and `fx_counter_amount` with signs flipped and **never re-derive the rate at
today's value** — re-deriving permanently corrupts the account's weighted-average base. Integration test:
post, reverse, assert `saldo_fc = 0` **and** `base_bob = 0`.

---

## 9. Screens and access

### 9.1 Access (D4)

`admin` only. The existing dashboard gate at
[app/dashboard/layout.tsx:19](../app/dashboard/layout.tsx) admits `admin` **and** `festival_admin`, so
`/dashboard/finanzas` needs its own check — a `festival_admin` must not see salaries or personal loan
balances. Add `requireFinanzasAccess()` in `app/lib/finanzas/policy.ts` and call it in the
`finanzas/layout.tsx`. Roles get revisited later; this is a deliberate stopgap, not a design.

### 9.2 Routes

| Route                                             | Answers                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `/dashboard/finanzas`                             | Hoy: cash per rail with arqueo age, `sin asignar`, this month's flow |
| `/dashboard/finanzas/nuevo`                       | Capture. **A full page route, not an overlay** (§9.3)                |
| `/dashboard/finanzas/movimientos`                 | The ledger, filterable                                               |
| `/dashboard/finanzas/personas`                    | **Who owes whom.** One signed number per counterparty                |
| `/dashboard/finanzas/personas/[code]`             | One counterparty's history and running balance                       |
| `/dashboard/finanzas/festivales/[id]`             | Result per edition                                                   |
| `/dashboard/finanzas/festivales/[id]/presupuesto` | Envelopes: presupuestado / comprometido / gastado / disponible       |
| `/dashboard/finanzas/caja`                        | Arqueo                                                               |
| `/dashboard/finanzas/importar`                    | Backfill wizard                                                      |
| `/dashboard/finanzas/diagnostico`                 | Health checks. No nav link                                           |

**Two screens justify the whole build and must exist on day one:** `personas` (one signed number per person)
and `festivales/[id]` (income − expenses for one edition). If those two queries are not trivially
expressible in the schema, the schema is wrong.

### 9.3 Capture — verified constraints

Adoption is the binding constraint. The Sheet proves the diligence is real but unsustainable by hand: the
YNAB annotation practice ran three months and stopped; the cash count was completed 2 times out of 18.
**Capture must be faster than typing a row into a Google Sheet on a phone.**

Facts verified in this repo that change the estimate:

- **A nested `finanzas/layout.tsx` cannot remove the marketing chrome.** `Navbar` and `FooterServer` are
  mounted in the root layout ([app/layout.tsx:46](../app/layout.tsx)); a nested layout renders _inside_
  them. Reclaiming the 76px means editing `navbar-client.tsx` and the `min-h-[calc(100vh-76px-180px)]` on
  the root `<main>` — a change across the whole public site. **Budget a day with a manual regression pass.**
- **Do not build capture on `DrawerDialog`.** `useMediaQuery` ([app/hooks/use-media-query.tsx](../app/hooks/use-media-query.tsx))
  starts `false` and flips after hydration, swapping Dialog for Drawer and remounting the subtree — losing
  unsaved input. Make `/nuevo` a full page route instead.
- **Receipt upload will fail on the first try.** The 4MB image cap is repeated at **19 sites** in
  `app/api/uploadthing/core.ts` and modern phone photos exceed it. Also add `expense_receipt` to
  `STORAGE_CLEANUP_ENTITY_TYPES` ([app/lib/uploadthing/actions.ts:11](../app/lib/uploadthing/actions.ts)).
- Every `/dashboard` route inherits `force-dynamic` + `await connection()` plus a Clerk+DB profile fetch, so
  the tap count starts _after_ a cold auth-gated SSR round trip on venue mobile data. Ship `app/manifest.ts`
  and `viewport: { viewportFit: 'cover' }` in the first release. A full service worker is deliberately out
  of scope — draft + outbox covers flaky wifi, and nothing in the data evidences genuine no-signal use.

### 9.4 Chart of accounts — 36 seeded rows

`app/lib/finanzas/accounts.ts`. Seeded in code, no editor in the UI. Spanish names, English identifiers.
Codes are two or three lowercase colon-separated segments, satisfying `finance_accounts_code_shape`.

| Code                               | Nombre                         | type      | role         | cur |
| ---------------------------------- | ------------------------------ | --------- | ------------ | --- |
| `activos:mercantil`                | Cuenta Mercantil               | asset     | cash_rail    | BOB |
| `activos:bcp`                      | Cuenta BCP                     | asset     | cash_rail    | BOB |
| `activos:efectivo`                 | Efectivo                       | asset     | cash_rail    | BOB |
| `activos:por_cobrar:participantes` | Por cobrar — participantes     | asset     | control      | BOB |
| `pasivos:prestamos:dennis`         | Préstamos de Dennis (Bs)       | liability | counterparty | BOB |
| `pasivos:prestamos:dennis_usd`     | Préstamos de Dennis ($us)      | liability | counterparty | USD |
| `pasivos:prestamos:enrique`        | Préstamos de Enrique           | liability | counterparty | BOB |
| `pasivos:prestamos:mama_andrea`    | Préstamos de la mamá de Andrea | liability | counterparty | BOB |
| `pasivos:sueldos:andrea`           | Sueldos por pagar — Andrea     | liability | counterparty | BOB |
| `pasivos:sin_atribuir`             | Sin atribuir                   | liability | counterparty | BOB |
| `control:conversion:dennis_bob`    | Conversión — Dennis (Bs)       | equity    | control      | BOB |
| `control:conversion:dennis_usd`    | Conversión — Dennis ($us)      | equity    | control      | USD |
| `patrimonio:apertura`              | Saldo de apertura              | equity    | equity       | BOB |
| `patrimonio:apertura:usd`          | Saldo de apertura ($us)        | equity    | equity       | USD |
| `ingresos:stands`                  | Ingresos por stands            | income    | category     | BOB |
| `ingresos:tienda`                  | Ingresos por tienda            | income    | category     | BOB |
| `ingresos:programas`               | Ingresos por programas         | income    | category     | BOB |
| `ingresos:ajustes_de_caja`         | Sobrantes de caja              | income    | category     | BOB |
| `ingresos:diferencia_de_cambio`    | Diferencia de cambio a favor   | income    | category     | BOB |
| `ingresos:condonaciones`           | Condonaciones recibidas        | income    | category     | BOB |
| `gastos:espacio`                   | Alquiler de espacio            | expense   | category     | BOB |
| `gastos:publicidad`                | Publicidad                     | expense   | category     | BOB |
| `gastos:personal`                  | Personal                       | expense   | category     | BOB |
| `gastos:decoracion`                | Decoración                     | expense   | category     | BOB |
| `gastos:credenciales`              | Credenciales                   | expense   | category     | BOB |
| `gastos:material_impreso`          | Material impreso               | expense   | category     | BOB |
| `gastos:mesas`                     | Mesas                          | expense   | category     | BOB |
| `gastos:toldo`                     | Toldo                          | expense   | category     | BOB |
| `gastos:web_saas`                  | Página web y SaaS              | expense   | category     | BOB |
| `gastos:comida`                    | Comida y consumos              | expense   | category     | BOB |
| `gastos:transporte`                | Transporte                     | expense   | category     | BOB |
| `gastos:papeleria`                 | Papelería                      | expense   | category     | BOB |
| `gastos:condonaciones`             | Condonaciones otorgadas        | expense   | category     | BOB |
| `gastos:diferencia_de_cambio`      | Diferencia de cambio           | expense   | category     | BOB |
| `gastos:ajustes_de_caja`           | Ajustes de caja                | expense   | category     | BOB |

Every `expense` and `income` account is BOB, satisfying `finance_accounts_results_are_local`. Only
counterparty and cash-rail accounts are ever non-BOB.

**Created on demand, not seeded:** `pasivos:sueldos:<slug>` when a `sueldo_devengado` first posts for a
person, `activos:adelantos:<slug>` for an advance, `pasivos:prestamos:<slug>` when a new lender first lends,
and the `control:conversion:<slug>_bob` / `_usd` pair when a counterparty first holds foreign currency.
Export the code builders from `accounts.ts` so each shape has exactly one definition — a duplicated builder
is how the control-pair codes diverged during authoring.

### 9.5 Entry templates — the leg matrix

15 templates. Each expands **one typed amount** into the correct legs (hledger's rule: the user types one
number, the rest is inferred). `FV` = fair value, `Δ` = counted − ledger.

| Template                  | Nombre                         | Legs                                                                                   |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| `gasto`                   | Gasto                          | `gastos:<cat>` +A · rail −A — or counterparty −A when someone else paid                |
| `ingreso`                 | Ingreso                        | rail +A · `ingresos:<cat>` −A                                                          |
| `ingreso_stands_derivado` | Ingreso de stands (automático) | `activos:por_cobrar:participantes` +A · `ingresos:stands` −A                           |
| `cobro_participante`      | Cobro a participante           | rail +A · `activos:por_cobrar:participantes` −A                                        |
| `prestamo_recibido`       | Préstamo recibido              | rail +A · `pasivos:prestamos:<p>` −A                                                   |
| `pago_prestamo`           | Pago de préstamo               | see below                                                                              |
| `sueldo_devengado`        | Sueldo devengado               | `gastos:personal` +A · `pasivos:sueldos:<p>` −A                                        |
| `pago_sueldo`             | Pago de sueldo                 | `pasivos:sueldos:<p>` +D · `gastos:personal` +(A−D) · rail −A, where D = min(A, saldo) |
| `pago_sueldo_con_stand`   | Pago de sueldo con stand       | see below                                                                              |
| `adelanto_a_persona`      | Adelanto                       | `activos:adelantos:<p>` +A · rail −A                                                   |
| `traspaso`                | Traspaso entre cuentas         | rail₁ −A · rail₂ +A                                                                    |
| `condonacion`             | Condonación                    | `gastos:condonaciones` +A · `activos:por_cobrar:participantes` −A                      |
| `apertura`                | Saldo de apertura              | account ±A · `patrimonio:apertura` ∓A (BOB) or `patrimonio:apertura:usd` ∓A (USD)      |
| `ajuste_de_caja`          | Ajuste de caja                 | rail +Δ · `gastos:ajustes_de_caja` −Δ (Δ<0) or `ingresos:ajustes_de_caja` −Δ (Δ>0)     |
| `correccion`              | Corrección                     | every leg of the original, mirrored                                                    |

#### `cobro_participante` — why `ingreso` must not be used for stand cash

Once the generator (§7.1) posts `ingreso_stands_derivado`, the income is recognised and the participant's
unpaid balance sits on `activos:por_cobrar:participantes`. The QR payment that later lands on Mercantil is
**not** income a second time — it is the receivable being collected. Recording it as `ingreso` (rail +A ·
`ingresos:stands` −A) double-counts every stand, which is exactly the defect §7.1's income definition
exists to prevent ("cash received … is **never added to it**"). So the cash leg has its own template, and
the `/nuevo` form must not offer `ingresos:stands` as a category under `ingreso` at all — that account is
written only by the generator and by `pago_sueldo_con_stand`.

The same receivable is what `condonacion` writes off. Between the three, `por_cobrar` ties out to the
credit subledger on `/diagnostico`: Σ open invoice balances (per `computeInvoiceTender`) must equal the
account balance, and the tie-out is the acceptance test for Phase 4.

#### `pago_sueldo_con_stand` — a partial discharge, not an either/or

**Two earlier specifications of this were wrong, and it is the case the whole model is justified by.**

The first had four legs, two of them on the same account with `+FV` and `−FV` — they cancel, double-count
the expense, and never discharge the liability. The correction in an earlier revision of this document had
three unconditional legs which **do not sum to zero** (`+FV − FV + FV = +FV`).

The real shape is a **partial discharge**, because the stand's fair value and the accrued salary are
independent numbers and usually differ:

```
D = min(FV, saldo)                         where saldo = the open salary liability

pasivos:sueldos:<persona>  +D              emitted when D > 0
gastos:personal            +(FV − D)       emitted when FV > D, carries festival_id
ingresos:stands            −FV             always
```

Sum: `D + (FV − D) − FV = 0` ✓ — in all three branches (2 legs when `saldo` is 0 or ≥ FV, 3 in between).

With an accrual of Bs 500 and a stand worth Bs 800, the binary version posted `+800` against a Bs 500
liability, flipping it to a Bs 300 _favour_ position and recognising **zero** expense for Bs 300 of pay
actually delivered. `pago_sueldo` has the identical defect and the identical fix.

`saldo` must be read from the **account balance**, not from "does an accrual entry exist" — a
`sueldo_devengado` that was later reversed still has its original entry row, so an existence check reports
an accrual whose liability is zero.

Compensation in kind stays **gross on both legs at fair value**. There is no "descontar del stand" shortcut.

#### `pago_prestamo` across currencies

Settling a USD obligation with bolivianos needs the conversion control pair (§6.5) plus a difference plug:

```
pasivos:prestamos:dennis_usd  USD  +discharged
control:conversion:dennis_usd USD  −discharged
control:conversion:dennis_bob BOB  +released          ← the historical basis released
gastos:diferencia_de_cambio   BOB  +difference        ← the plug; may be negative
activos:mercantil             BOB  −paid
```

USD sums to zero; BOB sums to zero because `difference = paid − released` by construction.

**Split the payment when part of the balance has no basis.** Dennis's USD 100.35 is 75.10 carrying Bs 721.21
of basis plus the Supabase 25.25 carrying none. Settling in full at 12.30 pays Bs 1,234.31 — and a naive plug
books **Bs 513.10** as "diferencia de cambio" when the true realised difference is **Bs 202.52**. The other
Bs 310.58 is unrecognised Supabase cost wearing an FX label. Since §12 makes the size of the difference
account the system's own honesty metric, that corrupts the one number meant to measure corruption. Compute
`paidForBasisless = paid × withoutBasis ÷ discharged` and post it to `patrimonio:apertura` instead — the
basis-less debt was opened against equity with no BOB side, so closing it against equity is what discharges
the opening-balance gap.

#### Preconditions `postEntry()` enforces

- Resolve every account through a typed lookup returning `CONTROL_PAIR_MISSING` / `UNKNOWN_ACCOUNT` rather
  than letting a raw FK violation surface (§6.9).
- Resolve the control pair **lazily** — a counterparty whose entire USD balance is basis-less emits no
  control legs and must not be blocked by a missing pair.
- `ajuste_de_caja`, `traspaso`, `prestamo_recibido`, `pago_prestamo`, `adelanto_a_persona` and `apertura`
  are balance-sheet only: `festival_id` is forced to null before the insert, and the
  `finance_entries_balance_sheet_templates_unattributed` CHECK (§4.3) is the backstop (§3.3).
- `correccion` mirrors `fx_rate` and `fx_counter_amount` with signs flipped and **never** re-derives the
  rate at today's value — re-deriving permanently corrupts the account's weighted-average basis.
- A `correccion` that re-posts must pass an explicit idempotency-key override, or a template with a
  deterministic key (like `sueldo_devengado`) can be reversed but never re-posted.

## 10. Migration and cutover

### 10.1 Ship as one indivisible release

> **Shipping capture before opening balances exist is strictly worse than shipping nothing.**

A capture surface whose _Debo_ screen reads Bs 0.00 against a true Bs 15,209.46 creates a second
hand-maintained debt record — reproducing the exact Bs 5,212.76 divergence between the Sheet's `Deudas`
expense lines and its own repayment rows that this project exists to delete.

**Done criterion for release 1:** the Personas screen shows each counterparty's balance and **Dennis agrees
with every number.** Not "the screen opens".

### 10.2 What comes in (D7)

- The ~50-row debt ledger, line by line, with per-row historical rates
- Opening balances per counterparty and per cash rail, dated the cutover date
- **Not** the fixed-costs tab — it is fully settled and nets to Bs 0.00 (§13.2)
- **Not** the 18 historical festival tabs — they stay in the Sheet as archive

This is typing, not engineering: ~45 amount-bearing rows in one guided sitting. Do not build a paste-TSV
importer plus a reconciliation screen first — that schedules the task Dennis's history says he abandons
behind a week of tooling he has to build.

Deterministic idempotency keys (`legacy:debt-ledger:<row>`) make duplicates a visible conflict rather than a
silent second posting. **GSuite Bs 175.64 appears twice** — once in the debt ledger (01/01/2026) and once in
the "Deudas de Twinkler" tab. Dennis decides which is real.

Date handling: the backfill asserts every parsed date falls within `[2025-01-01, today]` and **hard-fails
listing offenders.** Fixed by an explicit reviewable `DATE_OVERRIDES` map with the literal sheet cell quoted
in a comment — never a silent coercion heuristic. Known offenders: `03/01/0206` → `2026-01-03`; the undated
Bs 12.19 Instagram row → `2026-04-30` with _"(fecha no registrada en la planilla; asignada al cierre de
abril)"_ appended to the description.

### 10.3 Two data decisions

**Andreíta's Bs 1,782.70 — confirmed: no receivable ever existed.** It originates as an October budget
variance (salary budgeted Bs 7,120.00, spent Bs 8,902.70), not a cash event. An overspent envelope is not
money someone owes you. It appears in budget-vs-actual and **nowhere else**. The Sheet nets it against her
December and January salaries in prose (1,782.70 → 1,330.60 → 682.40) and the remaining Bs 682.40 then
vanishes after 31/01/2026. Per D6, whatever the import produces stays editable by an admin.

**Unattributed rows import as-is** (D7): ~Bs 1,750 of SaaS/ads naming no counterparty and ~Bs 6,636 of
_Prestado_ rows naming no lender go to a visible `pasivos:sin_atribuir` account with a work-down queue. The
unattributed −Bs 201.00 (30/08/2026) divides cleanly into no USD figure at any plausible rate — import it as
an unallocated repayment and flag it in the backfill report rather than guessing.

### 10.4 Cutover (D9)

Hard cutover on a named date, **TBD**. The Sheet becomes read-only that day; opening balances are dated to
it; no parallel running. Pick a date inside an inter-festival window — the git history shows one reliable
multi-week window per year.

---

## 11. Phasing

| Phase                                    | Scope                                                                                                                                                                                                                                                                                             | Weeks (est.) |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **0 — El libro**                         | 9 tables, enums, CHECKs, composite FKs (migration A). Five triggers as a `--custom` migration (B). Seed 36 accounts. `postEntry()` + templates. Integration test registered in `test:integration`.                                                                                                | 1            |
| **1+2 — Capturar y saber (one release)** | `/nuevo` full-page capture, `/movimientos`, manifest + safe-area, receipt upload fixes, the guided import sitting, opening balances, `/personas`. **FX _storage_ only** (§11.1). **Recurring-charge chips and the weekly summary email ship HERE**, not later — they are the retention mechanism. | 3            |
| **2.5 — FX display**                     | `hoy_bob`, the oficial/paralelo control, the difference chip. Gated on at least one rate row existing and being under 30 days old (§11.1).                                                                                                                                                        | 0.5          |
| **3 — Sobres y compromisos**             | Budget lines, commitments, `sin asignar`, `/festivales/[id]` and `/presupuesto`                                                                                                                                                                                                                   | 1.5          |
| **4 — Ingresos automáticos (gated)**     | P1–P5, stand income generator, credit-subledger tie-out on `/diagnostico`                                                                                                                                                                                                                         | 2–3          |
| **5 — Tienda (gated)**                   | P6 float→numeric migration, merch revenue by date range (P7 dropped)                                                                                                                                                                                                                              | 1            |
| **6 — Arqueo y correo**                  | `/caja`, balance assertions, visible `ajuste_de_caja` pad                                                                                                                                                                                                                                         | 0.5          |

### 11.1 Why FX storage and FX display ship separately

The FX **columns** are unretrofittable in an append-only ledger — adding them later means every historical
posting carries a guessed rate or none. The FX **display** is a `SELECT` and is trivially addable any time.

So release 1 ships: the five `finance_lines` FX columns, the composite `(account_id, currency)` FK, the
per-currency counterparty accounts, the conversion control pairs, and the denomination question in the entry
form. `/personas` shows **two numbers — `Bs 3.885,83 fijos + $us 75,10` — and no conversion at all**, so the
"Debo" figure released in Phase 1+2 is a fact that cannot move on its own.

Release 2.5 adds the conversion. This is deliberate: the prior conclusion that release 1 must end with a
_correct_ "Debo" number is incompatible with a headline that changes overnight because a rate moved.

**Estimates are optimistic.** Apply 2–2.5× for calendar reality: the repo's history shows five of the last
fourteen months with ≤9 commit days and one 49-day silence. Phases 4 and 5 are the ones to cut if the
schedule slips.

**Applying migrations is Dennis's call and is one-way.** Generate and show the SQL; never run
`drizzle-kit push` against a real database. Resolve `POSTGRES_URL` and state the host before any command
that reads or writes a database.

---

## 12. Expected burden

- **Steady weeks:** ~4 minutes. 5–8 entries, mostly 2-tap recurring chips, plus a weekly arqueo.
- **Festival run-up:** 12–15 minutes/week, 25–40 entries.
- **Month-end:** ~10 minutes reading `/personas` and confirming four signed numbers. Reading, not typing.

**If a month is skipped, nothing breaks.** No balance is stored, so nothing can go out of sync. Three things
degrade, in order: cash rails drift from reality (visibly — the arqueo age goes amber past 14 days),
counterparty balances become stale but never _wrong_, and envelopes go optimistic. Recovery is one screen:
count each rail, confirm, and the delta posts a visible `ajuste_de_caja`.

The size of `gastos:ajustes_de_caja` over time is the system's own honesty metric. It lives on
`/diagnostico` and nowhere else — it is a fact about the operator, not about the festivals.

---

## 13. Open items

### Resolved 2026-09-12

- **Andrea Gonzales** is the Sheet's "Andreíta" / "Andy". She holds **two unrelated accounts**:
  `activos:mercantil` (a cash rail — her account, treated as Glitter's main) and `pasivos:sueldos:andrea`
  (salary Glitter owes her). These must never net against each other, and must be labelled distinctly in the
  UI so nobody reads one as the other.
- **Cash rails:** Cuenta Mercantil (QR), Cuenta BCP, Efectivo — all BOB (§4.1.1).
- **Dennis's card settles in USD and is never a Glitter account** (§4.1.1). SaaS/ads obligations are
  USD-denominated; the Sheet's Bs figures for them are his own conversions, not charges.
- **The −Bs 201.00 (30/08/2026)** is a partial repayment to Dennis against his **boliviano** balance.
- **The GSuite duplicate:** the debt ledger is authoritative. Ignore the "Deudas Twinkler" tab entirely.
- **Merch is attributed by date range, not by `festival_id`** (§7.2). P7 dropped; P6 remains.
- **Counterparty seed list — closed.** See §13.1.
- **Alquiler CBA is an expense category, not a counterparty.** See §13.2.

### 13.1 Counterparties to seed

A counterparty is anyone where _"are we square right now?"_ is not automatically zero. The balance belongs
to **whoever fronted the money**, never to whoever received it.

**Four accounts, and only four:**

| Counterparty      | Kind   | Why they carry a balance                         |
| ----------------- | ------ | ------------------------------------------------ |
| Dennis            | person | Loans to Glitter (BOB and USD), and unpaid pay   |
| Andrea Gonzales   | person | Unpaid salary (Bs 2,161.55 Jan–Apr, part repaid) |
| Enrique           | person | Loans to Glitter                                 |
| La mamá de Andrea | person | Loan to Glitter (Bs 2,300, since repaid)         |

**Collaborators are always paid in full and carry no balance.** Mare, Micaela, Tifany and Polman are workers
Glitter pays; where cash was short, Glitter **took a loan** to complete the payment, so the resulting balance
sits with the lender. Verified in the ledger:

- Mare — `10/02/2026 "Prestado para pago a Mare de enero" +Bs 2,750`, then
  `05/05/2026 "Pago adeudado por sueldo de Mare" −Bs 2,750`. A loan taken and repaid. Mare was paid on time;
  the obligation was to the lender.
- Polman — one row, in the fixed-costs tab: `"Prestado para pago a polman" Bs 820`, repaid in the same tab.
- Micaela, Tifany — no debt-ledger rows at all.

They are **payees on an expense**, exactly like vendors — a name on the transaction, not an account.

> A `sueldo_devengado` template still exists, and posting one creates a `pasivos:sueldos:<persona>` account
> on demand. That is the capability, not the default. Nothing is seeded, and no collaborator starts with a
> balance.

**No vendor accounts either.** Resend, Vercel, Railway, Supabase, GSuite, Meta, Tigo and the domain registrar
are descriptions on an expense. The balance their charges create is with Dennis, who paid them.

**Andrea is the one genuine exception**, and only for salary: `17/04/2026 "Lo que no se ha pagado a Andreita
ene a abr" Bs 2,161.55`, reduced by −Bs 1,401.91 (03/05) and −Bs 81.91 (30/06). Note this is separate from
her two Bs 0.00 salary rows for Dec and Jan, which the Sheet explicitly declines to count, and separate again
from the October budget variance that is **not** a receivable (§10.3).

### 13.2 The fixed-costs tab is fully settled — skip it in the import

Verified: the tab nets to **exactly Bs 0.00**, matching its own Total cell.

| Row                         |        Bs |
| --------------------------- | --------: |
| Alquiler CBA                |  3,000.00 |
| GSuite                      |    175.64 |
| Recarga Tigo                |     10.00 |
| Prestado para pago a Polman |    820.00 |
| Pagado con pagos de Glitter | −3,000.00 |
| Pagado con pagos de Glitter | −1,005.64 |
| **Total**                   |  **0.00** |

`175.64 + 10.00 + 820.00 = 1,005.64` exactly, so the two repayment rows clear the venue advance and the
GSuite/Tigo/Polman batch in full. **It contributes nothing to opening balances and the import skips it
entirely.**

**Why the Bs 3,000 "Alquiler CBA" row is not a venue debt.** The venue was paid in full. That row records
**Dennis lending Glitter the money** to pay it — a liability to Dennis, sitting in a line that reads like an
obligation to the venue. It is the same class of error as `Deudas` booked into Gastos (§3.2): a
balance-sheet item wearing an expense label. Under the five-type taxonomy it cannot recur — the lend posts
to `pasivos:prestamos:dennis` and the venue payment to `gastos:espacio`, and §3.3 keeps the liability leg
off any festival result.

### Opening balances as of 2026-09-12 — RECONCILED

**Balance date: 2026-09-12.** Not the cutover date — see below.

| Counterparty      |           BOB |        USD |
| ----------------- | ------------: | ---------: |
| **Dennis**        | **12,510.52** | **100.35** |
| Andrea Gonzales   |        677.73 |          — |
| Enrique           |          0.00 |          — |
| La mamá de Andrea |          0.00 |          — |
| _Sin atribuir_    |          0.00 |          — |
| **Total**         | **13,188.25** | **100.35** |

**Ties to the Sheet exactly.** Bs 13,188.25 plus the Bs 721.21 of self-computed conversions that moved into
USD equals **Bs 13,909.46** — the Sheet's own `Total Deuda Bs` cell, to the centavo, after Dennis added the
two missing repayment rows on 2026-09-12.

Method: three independent passes over the 45 amount-bearing rows (chronological, by-counterparty, and a
parsing script) agreed on every figure; two adversarial passes re-checked the arithmetic and the
classification. Every Bs row sums to the Sheet's control total and the USD column to $25.25.

**What Glitter actually owes Dennis today:** Bs 12,510.52 + $100.35, which is **Bs 13,666.55** at the BCB
official rate (11.52) or **Bs 13,744.82** at the parallel (~12.30). The dollar leg was recorded in the Sheet
at Bs 721.21 for five of the six rows; it is worth Bs 865.15–923.73 today, and the Supabase $25.25 was never
converted at all.

#### Classification decisions, all confirmed with Dennis

- **Dennis lent the two unattributed December loans** — Bs 885.83 (15/12) and Bs 3,000.00 (21/12). Both are
  boliviano-denominated per their own _"no se aplica el tipo de cambio"_ notes. The Bs 3,000 is **not** the
  Alquiler CBA of the fixed-costs block; they are different debts.
- **Both unlabelled repayments went to Dennis** — 26/02 −Bs 672.89 and 30/08 −Bs 201.00.
- **The three small expenses were paid from Dennis's own pocket** — cena Bs 54.64, reunión con Mare
  Bs 119.00, taxi al CBA Bs 19.00. _Sin atribuir_ is therefore empty.
- **The 29/08 −Bs 182.91 _"devolucion de deuda de facebook"_ is a boliviano repayment** against the 18/08
  loan, despite its description. It reduces the BOB balance, not the USD one.
- **The seven vendor rows with no dollar figure were paid in bolivianos** — GSuite, Railway, Tigo, Vercel,
  Resend, dominio, Instagram (Bs 837.08). They stay in BOB; no rate is invented.
- **Two settled debts had no repayment row** and were added to the Sheet on 2026-09-12: `Pagado a Dennis
−Bs 800.00` (the December obligation discharged in April) and `31/07/2026 Pagado a Enrique −Bs 500.00`.
  Dennis confirms these are the only two.

#### Notes for the import

- The `Pagado a Dennis −Bs 800.00` row is **undated**. It sits after 17/04 and the original obligation's note
  says _"Pagado en glitter abril"_ — date it to April via the explicit `DATE_OVERRIDES` map (§10.2), never a
  heuristic.
- The Festicker pair (30/06 +Bs 1,188.66 / 12/07 −Bs 1,188.66) names no counterparty but nets to exactly
  zero. Import both legs visibly rather than dropping them; balance impact is nil.
- **Source of truth is the "Deudas Glitter Ene - Ago 2026" tab only.** Every other debt sheet has been ported
  into it and must be ignored — including the fixed-costs / "Deuda de Twinkler" block, which also settles the
  question of whether its GSuite and Tigo lines duplicate the ledger's. They do not; the ledger stands.

### Still open

**The cutover date** — the day the Sheet stops being used and the app takes over. **This is distinct from the
balance date above**, and cannot be today because there is no app yet. The Sheet keeps running until Phase
1+2 ships; the rows accumulated in between are imported at cutover alongside everything else, and these
opening balances are recomputed to include them.

### Currency scope — smaller than it looks

**The app is boliviano-only and stays that way.** Every existing price, order, credit and invoice is Bs, and
the ~50 files that hardcode `Bs` are correct, not technical debt. There is already a `formatMoney()` helper
([app/lib/formatters.ts:89](../app/lib/formatters.ts)) plus a few local `Intl.NumberFormat` calls with
`currency: "BOB"`.

USD appears in exactly one place: **the handful of SaaS and ads debts Dennis fronted on his USD-settling
card** (§4.1.1, §6.10) — five known rows plus Supabase. Nothing else in Glitter is ever denominated in
dollars, and no Glitter cash rail is.

So the currency work is confined to the finanzas module:

- `formatUsd` and `formatRate` alongside the existing `formatMoney`
- A denomination control on the entry form, shown **only** when the entry has a counterparty leg
- Dennis's row on `/personas` rendering two lines — `Bs …` and `$us …` — never summed into one figure (§6.9)

That is hours of work, not a phase. An earlier revision of this document called for threading USD through
the whole UI and re-budgeting Phase 1+2; that was wrong and is withdrawn.

---

## 14. References

- `credit_ledger_entries` — the in-repo precedent for ledger rigor: [db/schema.ts:2002](../db/schema.ts),
  [drizzle/0259_credit_ledger_integrity.sql](../drizzle/0259_credit_ledger_integrity.sql)
- `reservation_request_registry` — idempotency pattern:
  [app/lib/reservations/request-registry.ts](../app/lib/reservations/request-registry.ts)
- `computeInvoiceTender` — canonical income rule: [app/lib/payments/tender.ts](../app/lib/payments/tender.ts)
- Existing in-repo finance reporting precedent: [app/lib/orders/profitability.ts](../app/lib/orders/profitability.ts)
- Beancount — [double-entry method](https://beancount.github.io/docs/the_double_entry_counting_method.html),
  [envelope budgeting](https://beancount.io/ledger/open_ledger/budgeting-envelopes?lang=en)
- hledger — [budgeting](https://hledger.org/budgeting.html)
- BCB — [tipos de cambio](https://www.bcb.gob.bo/?q=cotizaciones_tc)
