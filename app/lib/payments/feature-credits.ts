import { roundMoney } from "@/app/lib/reservations/money";

/**
 * The credits a reservation cost outside its cobro.
 *
 * A reservation has two money stories and `computeInvoiceTender` projects only
 * the first: the invoice, settled by vouchers and credit allocations. The
 * second lives in `reservation_feature_actions` — adding a partner after
 * booking, taking the full table, releasing the stand — and is paid in credits
 * that never touch the invoice, because the late-partner flow deliberately
 * leaves the original amount exactly as it was (PRD §8.4).
 *
 * The consequence on screen was a reservation holding two participants,
 * billed at the individual price, with `Créditos --` and a drawer saying no
 * credits were applied. All three were true about the invoice and false about
 * the reservation.
 */
export type FeatureCreditItem = {
  kind: "feature_access" | "shared_price_difference";
  amount: number;
  description: string | null;
};

export type FeatureCreditAction = {
  actionId: number;
  type: "full_table_access" | "late_partner" | "reservation_release";
  status: "active" | "fulfilled" | "cancelled" | "failed";
  /** Absolute value of the spend actually posted; 0 when none was. */
  amount: number;
  reversed: boolean;
  createdAt: Date;
  /** Written only by the late-partner flow, which charges two components. */
  items: FeatureCreditItem[];
};

export type FeatureCreditsMap = Map<number, FeatureCreditAction[]>;

const FEATURE_TYPE_LABELS: Record<FeatureCreditAction["type"], string> = {
  full_table_access: "Mesa completa",
  late_partner: "Compañero agregado",
  reservation_release: "Liberación de espacio",
};

export function featureActionLabel(type: FeatureCreditAction["type"]): string {
  return FEATURE_TYPE_LABELS[type] ?? type;
}

const FEATURE_ITEM_LABELS: Record<FeatureCreditItem["kind"], string> = {
  feature_access: "Función",
  shared_price_difference: "Diferencia individual → compartido",
};

export function featureItemLabel(kind: FeatureCreditItem["kind"]): string {
  return FEATURE_ITEM_LABELS[kind] ?? kind;
}

/**
 * A reservation's feature credits, compact enough to hand to every row.
 *
 * The types travel with the total because the number alone does not answer the
 * question an admin is actually asking. Two participants beside an individual
 * price reads as an error until something says the second seat was bought —
 * "Bs50" does not say that, "Bs50 · compañero agregado" does.
 */
export type FeatureCreditSummary = {
  total: number;
  /** Distinct types that were actually charged, in the order they happened. */
  types: FeatureCreditAction["type"][];
};

export const EMPTY_FEATURE_CREDIT_SUMMARY: FeatureCreditSummary = {
  total: 0,
  types: [],
};

export function summarizeFeatureCredits(
  actions: readonly FeatureCreditAction[],
): FeatureCreditSummary {
  const charged = actions.filter(
    (action) => !action.reversed && action.amount > 0,
  );
  return {
    total: totalFeatureCredits(charged),
    types: [...new Set(charged.map((action) => action.type))],
  };
}

/** Lower-case phrasing for an inline note, where the label is mid-sentence. */
const FEATURE_REASONS: Record<FeatureCreditAction["type"], string> = {
  full_table_access: "mesa completa",
  late_partner: "compañero agregado",
  reservation_release: "liberación de espacio",
};

export function featureCreditReason(
  types: readonly FeatureCreditAction["type"][],
): string {
  return types.map((type) => FEATURE_REASONS[type] ?? type).join(" · ");
}

/**
 * What was actually debited, summed over a reservation's feature actions.
 *
 * Reads the ledger rather than `feature_price_snapshot`, for the same reason
 * the tender reads allocations rather than `invoices.amount`: the snapshot is
 * a price, the ledger is the charge. Most `full_table_access` rows sit at
 * `active` or `cancelled` with a hold that was never captured and no spend
 * entry at all — summing their snapshots would invent a charge nobody paid.
 */
export function totalFeatureCredits(
  actions: readonly FeatureCreditAction[],
): number {
  return roundMoney(
    actions
      .filter((action) => !action.reversed)
      .reduce((sum, action) => sum + action.amount, 0),
  );
}
