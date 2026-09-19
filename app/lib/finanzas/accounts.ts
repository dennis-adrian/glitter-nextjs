/**
 * The chart of accounts, owned by code.
 *
 * `finance_accounts` has no editor in the UI: this file is the list, and the
 * seeder upserts it by `code`. Codes are stable identifiers — renaming one is a
 * data migration, not an edit, because `finance_lines` points at the row.
 *
 * Everything here has to survive the CHECKs in `db/schema.ts` (§4.1 of
 * docs/IMPLEMENTATION-finanzas.md). They are restated as invariants in
 * `validateAccountSeed()` at the bottom so a bad row fails a unit test rather
 * than a migration:
 *
 *   finance_accounts_code_shape                 two or three lowercase segments
 *   finance_accounts_counterparty_is_a_balance  role counterparty => asset|liability
 *   finance_accounts_rail_is_an_asset           role cash_rail    => asset
 *   finance_accounts_results_are_local          expense|income    => BOB
 *
 * Not everything lives here. Accounts created on demand by the service layer:
 *
 *   pasivos:sueldos:<persona>   posted by `sueldo_devengado` for anyone who is
 *                               not paid in full on the day. Only Andrea's is
 *                               seeded, because she carries an opening balance.
 *   control:conversion:<persona> + its USD twin, posted the first time a
 *                               counterparty takes on a foreign-currency
 *                               obligation. Only Dennis's pair is seeded,
 *                               because he is the only one today (§4.1.1).
 *
 * No vendor and no collaborator gets an account. Resend, Vercel, Railway,
 * Supabase, GSuite, Meta, Tigo, the domain registrar, Mare, Micaela, Tifany and
 * Polman are descriptions on an expense — the balance their charges create sits
 * with whoever fronted the money (§13.1).
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors of the pgEnums in `db/schema.ts`. Once the finanzas tables land,
 * replace these with `(typeof financeAccountTypeEnum.enumValues)[number]` and
 * friends so the enum and this file cannot drift apart.
 */
export type FinanceCurrency = "BOB" | "USD";

export type FinanceAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export type FinanceAccountRole =
  | "cash_rail" // a real place money sits
  | "counterparty" // a person Glitter owes, or who owes Glitter
  | "category" // an expense or income bucket
  | "equity"
  | "control"; // cross-currency clearing, self-liquidating

/** The only counterparties that carry a balance (§13.1). Closed list. */
export type FinanceCounterpartyName =
  | "Dennis"
  | "Andrea Gonzales"
  | "Enrique"
  | "La mamá de Andrea";

export type FinanceCounterpartyKind = "person" | "vendor";

export type FinanceCounterpartySeedRow = {
  name: FinanceCounterpartyName;
  kind: FinanceCounterpartyKind;
  /** Why this one carries a balance. Lands in `finance_counterparties.notes`. */
  notes: string;
};

export type FinanceAccountSeedRow = {
  /** `finance_accounts.code`. Two or three lowercase segments, colon separated. */
  code: string;
  /** Spanish. This is the string Dennis reads on every screen. */
  name: string;
  type: FinanceAccountType;
  role: FinanceAccountRole;
  currency: FinanceCurrency;
  /**
   * Resolved to `finance_accounts.counterparty_id` by the seeder. `null` for
   * rails, categories and equity — and for `pasivos:sin_atribuir`, which is a
   * holding pen precisely because the counterparty is unknown.
   */
  counterparty: FinanceCounterpartyName | null;
  sortOrder: number;
};

/* -------------------------------------------------------------------------- */
/* Counterparties (seeded first — accounts reference them by name)             */
/* -------------------------------------------------------------------------- */

export const FINANCE_COUNTERPARTY_SEED = [
  {
    name: "Dennis",
    kind: "person",
    notes:
      "Presta a Glitter en bolivianos y adelanta cargos en dólares con su tarjeta personal. Su tarjeta nunca es una cuenta de Glitter: cada cargo entra como préstamo.",
  },
  {
    name: "Andrea Gonzales",
    kind: "person",
    notes:
      "Sueldo pendiente de enero a abril de 2026. La Cuenta Mercantil está a su nombre pero es caja de Glitter: las dos cosas nunca se compensan entre sí.",
  },
  {
    name: "Enrique",
    kind: "person",
    notes: "Préstamos a Glitter. Saldo en cero al 2026-09-12.",
  },
  {
    name: "La mamá de Andrea",
    kind: "person",
    notes: "Préstamo de Bs 2.300 a Glitter, ya devuelto. Saldo en cero.",
  },
] as const satisfies readonly FinanceCounterpartySeedRow[];

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

export const FINANCE_ACCOUNT_SEED = [
  /* --- Caja: los tres rieles reales, todos en BOB (§4.1.1) ---------------- */
  // There is no USD rail and there must not be one until Glitter genuinely
  // holds dollars. The "USD rail" is Dennis's card, which is a liability.
  {
    code: "activos:mercantil",
    name: "Cuenta Mercantil",
    type: "asset",
    role: "cash_rail",
    currency: "BOB",
    counterparty: null,
    sortOrder: 100,
  },
  {
    code: "activos:bcp",
    name: "Cuenta BCP",
    type: "asset",
    role: "cash_rail",
    currency: "BOB",
    counterparty: null,
    sortOrder: 110,
  },
  {
    code: "activos:efectivo",
    name: "Efectivo",
    type: "asset",
    role: "cash_rail",
    currency: "BOB",
    counterparty: null,
    sortOrder: 120,
  },

  /* --- Personas: una cuenta por moneda (§4.1) ----------------------------- */
  // All `liability`: these are what Glitter owes. An advance to a person
  // (`adelanto_a_persona`) or an overpayment flips the balance positive on the
  // same account — that is allowed on purpose (§6.9) and is why there is no
  // mirror `activos:cobrar:*` set.
  {
    code: "pasivos:prestamos:dennis",
    name: "Préstamos de Dennis (Bs)",
    type: "liability",
    role: "counterparty",
    currency: "BOB",
    counterparty: "Dennis",
    sortOrder: 200,
  },
  {
    code: "pasivos:prestamos:dennis_usd",
    name: "Préstamos de Dennis (USD)",
    type: "liability",
    role: "counterparty",
    currency: "USD",
    counterparty: "Dennis",
    sortOrder: 210,
  },
  {
    // Andrea's balance is unpaid salary, not a loan, so it lives on the sueldos
    // branch — the one `pasivos:sueldos:*` account that is seeded rather than
    // created on demand, because she has an opening balance of Bs 677,73.
    code: "pasivos:sueldos:andrea",
    name: "Sueldo por pagar — Andrea Gonzales",
    type: "liability",
    role: "counterparty",
    currency: "BOB",
    counterparty: "Andrea Gonzales",
    sortOrder: 220,
  },
  {
    code: "pasivos:prestamos:enrique",
    name: "Préstamos de Enrique",
    type: "liability",
    role: "counterparty",
    currency: "BOB",
    counterparty: "Enrique",
    sortOrder: 230,
  },
  {
    code: "pasivos:prestamos:mama_andrea",
    name: "Préstamos de la mamá de Andrea",
    type: "liability",
    role: "counterparty",
    currency: "BOB",
    counterparty: "La mamá de Andrea",
    sortOrder: 240,
  },
  {
    // Holding pen for imported rows that name no lender (§10.3). Visible on
    // /personas with a work-down queue; empty at the 2026-09-12 balance date.
    code: "pasivos:sin_atribuir",
    name: "Sin atribuir",
    type: "liability",
    role: "counterparty",
    currency: "BOB",
    counterparty: null,
    sortOrder: 250,
  },

  /* --- Conversión: el par de control, uno por moneda (§6.5) --------------- */
  // Only a counterparty that can hold foreign currency needs a pair, so today
  // only Dennis. The pair self-liquidates over the life of the debt; while a
  // debt is open, −(saldo BOB) / (saldo USD) is the weighted-average historical
  // rate for free. Never carries a festival_id (§3.3).
  {
    code: "control:conversion:dennis",
    name: "Conversión — Dennis (Bs)",
    type: "equity",
    role: "control",
    currency: "BOB",
    counterparty: "Dennis",
    sortOrder: 300,
  },
  {
    code: "control:conversion:dennis_usd",
    name: "Conversión — Dennis (USD)",
    type: "equity",
    role: "control",
    currency: "USD",
    counterparty: "Dennis",
    sortOrder: 310,
  },

  /* --- Patrimonio: aperturas (§6.7) --------------------------------------- */
  {
    code: "patrimonio:apertura",
    name: "Saldos de apertura (Bs)",
    type: "equity",
    role: "equity",
    currency: "BOB",
    counterparty: null,
    sortOrder: 400,
  },
  {
    // A rate-less USD row (the Supabase $25,25 shape) cannot enter through
    // `gasto` — it has to land somewhere, and this is the somewhere. The
    // revaluation query's allowlist keeps it off /personas.
    code: "patrimonio:apertura:usd",
    name: "Saldos de apertura (USD)",
    type: "equity",
    role: "equity",
    currency: "USD",
    counterparty: null,
    sortOrder: 410,
  },

  /* --- Gastos: siempre en BOB (finance_accounts_results_are_local) -------- */
  {
    code: "gastos:espacio",
    name: "Alquiler de espacio",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 500,
  },
  {
    code: "gastos:publicidad",
    name: "Publicidad",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 510,
  },
  {
    code: "gastos:decoracion",
    name: "Decoración",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 520,
  },
  {
    code: "gastos:credenciales",
    name: "Credenciales",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 530,
  },
  {
    code: "gastos:material_impreso",
    name: "Material impreso",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 540,
  },
  {
    code: "gastos:mesas",
    name: "Mesas",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 550,
  },
  {
    code: "gastos:toldo",
    name: "Toldo",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 560,
  },
  {
    // Resend, Vercel, Railway, Supabase, GSuite, el dominio. The vendor is a
    // description on the entry, never an account.
    code: "gastos:web_saas",
    name: "Página web y servicios (SaaS)",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 570,
  },
  {
    // The expense leg of `pago_sueldo_con_stand`, and of every salary.
    code: "gastos:personal",
    name: "Personal",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 580,
  },
  {
    code: "gastos:comida",
    name: "Comida y consumos",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 590,
  },
  {
    code: "gastos:transporte",
    name: "Transporte y taxis",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 600,
  },
  {
    code: "gastos:papeleria",
    name: "Papelería",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 610,
  },
  {
    // Posted only at settlement, when bolivianos actually move. There is no
    // "revaluar deudas" action and there must never be one (§6.1).
    code: "gastos:diferencia_de_cambio",
    name: "Diferencia de cambio",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 620,
  },
  {
    // The pad against a balance assertion. Its size over time is the system's
    // honesty metric; it belongs on /diagnostico and nowhere else (§12).
    code: "gastos:ajustes_de_caja",
    name: "Ajustes de caja",
    type: "expense",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 630,
  },

  /* --- Ingresos: siempre en BOB ------------------------------------------- */
  {
    // Σ InvoiceTender.coveredAmount. Cash received is reported separately and
    // is never added to this (§7.1).
    code: "ingresos:stands",
    name: "Ingresos por stands",
    type: "income",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 700,
  },
  {
    code: "ingresos:tienda",
    name: "Ingresos por tienda",
    type: "income",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 710,
  },
  {
    code: "ingresos:programas",
    name: "Ingresos por programas y sesiones",
    type: "income",
    role: "category",
    currency: "BOB",
    counterparty: null,
    sortOrder: 720,
  },
] as const satisfies readonly FinanceAccountSeedRow[];

export type FinanceSeededAccountCode =
  (typeof FINANCE_ACCOUNT_SEED)[number]["code"];

/* -------------------------------------------------------------------------- */
/* Codes the templates reach for by name                                       */
/* -------------------------------------------------------------------------- */

/**
 * Accounts the service layer names directly. Anything in here must exist in the
 * seed, which `validateAccountSeed()` asserts — a typo in a template is
 * otherwise a runtime failure on the write path.
 */
export const FINANCE_WELL_KNOWN_ACCOUNTS = {
  /** `apertura`, BOB side. */
  openingBalanceBob: "patrimonio:apertura",
  /** `apertura`, the rate-less USD backfill row (§6.7). */
  openingBalanceUsd: "patrimonio:apertura:usd",
  /** The realised FX difference, posted only at settlement (§6.8). */
  fxDifference: "gastos:diferencia_de_cambio",
  /** The `ajuste_de_caja` pad against a balance assertion (§4.6). */
  cashAdjustment: "gastos:ajustes_de_caja",
  /** The income leg of `pago_sueldo_con_stand` and of the stand generator. */
  standIncome: "ingresos:stands",
  /** The expense leg of `pago_sueldo_con_stand` and of every salary. */
  staffExpense: "gastos:personal",
  /** Imported rows that name no lender (§10.3). */
  unattributed: "pasivos:sin_atribuir",
  /** Glitter's main rail — the one that receives QR payments. */
  mainRail: "activos:mercantil",
} as const satisfies Record<string, FinanceSeededAccountCode>;

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

const SEED_BY_CODE = new Map<string, FinanceAccountSeedRow>(
  FINANCE_ACCOUNT_SEED.map((account) => [account.code, account]),
);

export function getSeedAccount(
  code: FinanceSeededAccountCode,
): FinanceAccountSeedRow {
  const account = SEED_BY_CODE.get(code);
  if (!account) {
    throw new Error(`Cuenta no encontrada en el plan de cuentas: ${code}`);
  }
  return account;
}

export function isSeededAccountCode(
  code: string,
): code is FinanceSeededAccountCode {
  return SEED_BY_CODE.has(code);
}

/**
 * The pair of conversion control codes for a counterparty (§6.5). Only Dennis's
 * pair is seeded; the rest are created on demand the first time a counterparty
 * takes on a foreign-currency obligation.
 */
export function conversionControlCodes(slug: string): {
  bob: string;
  usd: string;
} {
  return {
    bob: `control:conversion:${slug}`,
    usd: `control:conversion:${slug}_usd`,
  };
}

/** The on-demand salary account for a person (§13.1). Never seeded but Andrea's. */
export function staffLiabilityCode(slug: string): string {
  return `pasivos:sueldos:${slug}`;
}

/* -------------------------------------------------------------------------- */
/* Invariants — the table's CHECKs, restated so a unit test catches drift      */
/* -------------------------------------------------------------------------- */

/** `finance_accounts_code_shape`. Note the first segment allows no underscore. */
export const FINANCE_ACCOUNT_CODE_SHAPE = /^[a-z0-9]+(:[a-z0-9_-]+){1,2}$/;

export function validateAccountSeed(
  accounts: readonly FinanceAccountSeedRow[] = FINANCE_ACCOUNT_SEED,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const counterpartyNames = new Set<string>(
    FINANCE_COUNTERPARTY_SEED.map((c) => c.name),
  );

  for (const a of accounts) {
    if (!FINANCE_ACCOUNT_CODE_SHAPE.test(a.code)) {
      problems.push(`${a.code}: no cumple finance_accounts_code_shape`);
    }
    if (seen.has(a.code)) {
      problems.push(`${a.code}: código duplicado`);
    }
    seen.add(a.code);

    if (
      a.role === "counterparty" &&
      a.type !== "asset" &&
      a.type !== "liability"
    ) {
      problems.push(
        `${a.code}: role counterparty exige type asset o liability, no ${a.type}`,
      );
    }
    if (a.role === "cash_rail" && a.type !== "asset") {
      problems.push(`${a.code}: role cash_rail exige type asset, no ${a.type}`);
    }
    if ((a.type === "expense" || a.type === "income") && a.currency !== "BOB") {
      problems.push(
        `${a.code}: finance_accounts_results_are_local — ${a.type} debe ser BOB`,
      );
    }
    if (a.role === "cash_rail" && a.currency !== "BOB") {
      // Not a DB CHECK, a design rule (§4.1.1, §6.9): no USD rail in v1.
      problems.push(`${a.code}: no se siembra ningún riel de caja en USD`);
    }
    if (a.counterparty !== null && !counterpartyNames.has(a.counterparty)) {
      problems.push(
        `${a.code}: contraparte "${a.counterparty}" no está en FINANCE_COUNTERPARTY_SEED`,
      );
    }
  }

  for (const code of Object.values(FINANCE_WELL_KNOWN_ACCOUNTS)) {
    if (!seen.has(code)) {
      problems.push(`${code}: referenciada por el servicio pero no sembrada`);
    }
  }

  return problems;
}
