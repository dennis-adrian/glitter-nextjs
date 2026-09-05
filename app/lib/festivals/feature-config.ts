/**
 * Festival reservation feature configuration rules (PRD §5).
 *
 * Pure: the admin panel, the participant-facing checks, and the tests all
 * apply the same rules to rows they fetched themselves.
 */

export const FEATURE_TYPES = [
  "full_table",
  "late_partner",
  "reservation_release",
] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];

/** Only full_table is priced per category; the rest are festival-wide. */
// Re-exported from the pairing rules so the eligible set has one definition:
// a second copy means adding a category in two places and casting between two
// identical types.
import {
  FULL_TABLE_CATEGORIES,
  type FullTableCategory,
} from "@/app/lib/stands/full-table-pairs";

export { FULL_TABLE_CATEGORIES, type FullTableCategory };

/**
 * The feature types that actually have an implementation behind them.
 *
 * Every feature now has an implementation, so this list is currently complete.
 * It stays because the next feature to be configured before it is built needs
 * the same guard: without it an admin can enable and price something no code
 * implements, and participants would be charged for what never happens.
 */
export const IMPLEMENTED_FEATURE_TYPES: readonly FeatureType[] = [
  "full_table",
  "reservation_release",
  "late_partner",
];

/**
 * Deliberately not a type predicate: narrowing `type` to the implemented set
 * would make the rules for the unimplemented ones — the late-partner deadline
 * below, say — look like dead code to the compiler, and those rules are what
 * phases 4 and 5 will switch back on.
 */
export function isFeatureTypeImplemented(type: FeatureType): boolean {
  return IMPLEMENTED_FEATURE_TYPES.includes(type);
}

export const FEATURE_NOT_IMPLEMENTED_REASON =
  "Esta función todavía no está implementada, así que no se puede activar.";

/** Late partner closes this far before the festival unless overridden. */
export const LATE_PARTNER_DEFAULT_LEAD_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;

export type FeatureConfigRow = {
  id: number;
  type: FeatureType;
  category: FullTableCategory | null;
  enabled: boolean;
  creditPrice: number;
  deadlineOverrideAt: Date | null;
};

export type EffectiveFeatureConfig = FeatureConfigRow & {
  /**
   * When late partner stops being offered. Null for other types, and null for
   * late partner when the festival has no start date and no override — which
   * makes the feature unavailable rather than open-ended.
   */
  effectiveDeadlineAt: Date | null;
  /** False when the feature must not be offered or accepted right now. */
  available: boolean;
  /** Why it is unavailable, for the admin panel. Null when available. */
  unavailableReason: string | null;
};

/**
 * The late-partner cutoff: an explicit override, otherwise the earliest
 * festival start minus the default lead time.
 *
 * Returns null when neither exists. A festival with no dates has no deadline
 * to compute, and treating that as "no deadline" would leave the feature open
 * forever — the PRD makes it unavailable instead.
 */
export function resolveLatePartnerDeadline(input: {
  deadlineOverrideAt: Date | null;
  earliestStartDate: Date | null;
}): Date | null {
  if (input.deadlineOverrideAt) return input.deadlineOverrideAt;
  if (!input.earliestStartDate) return null;
  return new Date(
    input.earliestStartDate.getTime() - LATE_PARTNER_DEFAULT_LEAD_DAYS * DAY_MS,
  );
}

/**
 * Resolves a stored row into what the admin panel and the participant checks
 * both need. `now` is injected so the caller controls the clock.
 */
export function resolveFeatureConfig(
  row: FeatureConfigRow,
  context: { earliestStartDate: Date | null; now: Date },
): EffectiveFeatureConfig {
  const effectiveDeadlineAt =
    row.type === "late_partner"
      ? resolveLatePartnerDeadline({
          deadlineOverrideAt: row.deadlineOverrideAt,
          earliestStartDate: context.earliestStartDate,
        })
      : null;

  let unavailableReason: string | null = null;
  if (!row.enabled) {
    unavailableReason = "La función está desactivada.";
  } else if (row.type === "late_partner") {
    if (!effectiveDeadlineAt) {
      unavailableReason =
        "El festival no tiene fecha de inicio ni plazo definido, así que no se puede calcular la fecha límite.";
    } else if (effectiveDeadlineAt.getTime() <= context.now.getTime()) {
      unavailableReason = "El plazo para agregar un compañero ya venció.";
    }
  }

  // Applied last so a more specific reason still speaks when there is one, but
  // an unimplemented feature can never resolve as available — not even one an
  // admin managed to enable before the panel started refusing it.
  if (unavailableReason === null && !isFeatureTypeImplemented(row.type)) {
    unavailableReason = FEATURE_NOT_IMPLEMENTED_REASON;
  }

  return {
    ...row,
    effectiveDeadlineAt,
    available: unavailableReason === null,
    unavailableReason,
  };
}

/** The scope key a row occupies, so duplicates and gaps are easy to spot. */
export function featureScopeKey(
  type: FeatureType,
  category: FullTableCategory | null,
) {
  return category ? `${type}:${category}` : type;
}

/** Every scope a festival can configure, in the order the panel shows them. */
export function allFeatureScopes(): {
  type: FeatureType;
  category: FullTableCategory | null;
}[] {
  return [
    ...FULL_TABLE_CATEGORIES.map((category) => ({
      type: "full_table" as const,
      category,
    })),
    { type: "late_partner" as const, category: null },
    { type: "reservation_release" as const, category: null },
  ];
}
