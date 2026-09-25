import { z } from "zod";

/**
 * What a ledger entry means, rather than what its `type` column says.
 *
 * The column is too coarse for an admin reading the history: a
 * positive `admin_adjustment` can be credits handed back from a cancelled
 * invoice, a debt an admin cleared, or an undone discount, and each needs
 * its own label. The kind is derived in SQL from the entry, the entry it
 * reverses and its metadata (see `ledgerKindSql` in `admin-queries.ts`), so
 * filtering and display share one definition.
 */
export const CREDIT_LEDGER_KINDS = [
  "purchase",
  "spend",
  "voucher_reversal",
  "refund",
  "grant",
  "deduction",
  "adjustment",
  "debt_resolution",
  "revert",
] as const;
export type CreditLedgerKind = (typeof CREDIT_LEDGER_KINDS)[number];

export const CREDIT_LEDGER_KIND_LABELS: Record<CreditLedgerKind, string> = {
  purchase: "Compra de créditos",
  spend: "Uso de créditos",
  voucher_reversal: "Reversión por comprobante rechazado",
  refund: "Devolución de créditos usados",
  grant: "Créditos otorgados",
  deduction: "Descuento administrativo",
  adjustment: "Ajuste administrativo",
  debt_resolution: "Regularización de saldo",
  revert: "Reversión de un movimiento",
};

/**
 * Whether an entry can be undone from the admin history.
 *
 * Only an admin's own decision qualifies. A purchase is undone by rejecting
 * its voucher and a spend by whatever booked it. Undoing a refund would take
 * back credits whose invoice allocation is already gone. Undoing an undo is
 * really a fresh adjustment, and posting it as one keeps the link honest.
 */
export function canRevertCreditEntry(entry: {
  kind: CreditLedgerKind;
  isReverted: boolean;
}): boolean {
  if (entry.isReverted) return false;
  return (
    entry.kind === "grant" ||
    entry.kind === "deduction" ||
    entry.kind === "adjustment" ||
    entry.kind === "debt_resolution"
  );
}

export const CREDIT_DEBT_RESOLUTION_LABELS: Record<string, string> = {
  mark_paid: "Marcado como pagado",
  waive: "Condonado",
};

export const CREDIT_TOP_UP_STATUS_LABELS: Record<string, string> = {
  awaiting_voucher: "Falta el comprobante",
  under_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
};

export const CREDIT_TOP_UP_PURPOSE_LABELS: Record<string, string> = {
  feature: "Función opcional",
  invoice: "Pago de reserva",
  debt: "Regularización de saldo",
};

export const CREDIT_ACCOUNT_FILTERS = [
  "all",
  "positive",
  "debt",
  "zero",
  "holds",
  "review",
  "drift",
] as const;
export type CreditAccountFilter = (typeof CREDIT_ACCOUNT_FILTERS)[number];

export const CREDIT_ACCOUNT_FILTER_LABELS: Record<CreditAccountFilter, string> =
  {
    all: "Todas las cuentas",
    positive: "Con saldo",
    debt: "En negativo",
    zero: "Sin saldo",
    holds: "Con créditos retenidos",
    review: "Con compras en revisión",
    drift: "Con descuadre",
  };

export const CREDIT_ACCOUNT_SORTS = [
  "balance",
  "spendable",
  "purchased",
  "spent",
  "lastActivity",
  "name",
] as const;
export type CreditAccountSort = (typeof CREDIT_ACCOUNT_SORTS)[number];

export const CREDIT_ACCOUNT_SORT_LABELS: Record<CreditAccountSort, string> = {
  balance: "Saldo",
  spendable: "Disponible",
  purchased: "Comprado",
  spent: "Usado",
  lastActivity: "Último movimiento",
  name: "Nombre",
};

export const CREDIT_ADMIN_PAGE_SIZES = [25, 50, 100, 200] as const;

// Every field falls back instead of failing: these come from a URL an admin
// may have edited or bookmarked, and a stale filter should show the default
// list rather than a 404.
const limitSchema = z.coerce.number().int().min(1).max(200).catch(25);
const offsetSchema = z.coerce.number().int().min(0).catch(0);
const querySchema = z.string().trim().max(200).catch("");
const positiveIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .catch(undefined);
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const CreditAccountsSearchParamsSchema = z.object({
  query: querySchema,
  filter: z.enum(CREDIT_ACCOUNT_FILTERS).catch("all"),
  sort: z.enum(CREDIT_ACCOUNT_SORTS).catch("balance"),
  direction: z.enum(["asc", "desc"]).catch("desc"),
  limit: limitSchema,
  offset: offsetSchema,
});
export type CreditAccountsSearchParams = z.infer<
  typeof CreditAccountsSearchParamsSchema
>;

export const CreditLedgerSearchParamsSchema = z.object({
  query: querySchema,
  userId: positiveIdSchema,
  festivalId: positiveIdSchema,
  kind: z
    .union([
      z.enum(CREDIT_LEDGER_KINDS),
      z
        .array(z.string())
        .transform((values) =>
          values.filter((value): value is CreditLedgerKind =>
            (CREDIT_LEDGER_KINDS as readonly string[]).includes(value),
          ),
        ),
    ])
    .optional()
    .catch(undefined)
    .transform((value) =>
      value == null ? [] : typeof value === "string" ? [value] : value,
    ),
  from: isoDateSchema,
  to: isoDateSchema,
  limit: limitSchema,
  offset: offsetSchema,
});
export type CreditLedgerSearchParams = z.infer<
  typeof CreditLedgerSearchParamsSchema
>;

/** Plain `searchParams` from a page, with repeated keys kept as arrays. */
export type RawSearchParams = Record<string, string | string[] | undefined>;
