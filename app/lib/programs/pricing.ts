import type { ParticipantEligibility } from "@/app/lib/programs/eligibility";

/**
 * Which rule produced a price. Persisted with every purchase line so a
 * historical amount stays explainable without replaying today's configuration.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §8.3.
 */
export type PriceRule =
  | "public"
  | "explicit_override"
  | "program_discount"
  | "global_discount";

/**
 * How a discount is expressed. `percent` takes a share off the public price;
 * `fixed` takes a flat amount off it.
 */
export type ParticipantDiscountType = "percent" | "fixed";

export type ParticipantDiscount = {
  type: ParticipantDiscountType;
  /** Percentage points when `percent`, Bs when `fixed`. */
  value: number;
};

export type PriceInput = {
  publicPrice: number;
  /** Explicit per-session or per-pass participant price, when set. */
  participantPrice: number | null;
  /** The program's own discount, when it overrides the global default. */
  programDiscount: ParticipantDiscount | null;
  /** `program_settings` default, applied when the program has no override. */
  globalDiscount: ParticipantDiscount;
};

export type ResolvedPrice = {
  amount: number;
  basis: ParticipantEligibility;
  rule: PriceRule;
  snapshot: PriceSnapshot;
};

export type PriceSnapshot = {
  rule: PriceRule;
  basis: ParticipantEligibility;
  publicPrice: number;
  participantPrice: number | null;
  appliedDiscount: ParticipantDiscount | null;
  amount: number;
};

export const PARTICIPANT_DISCOUNT_TYPE_LABELS: Record<
  ParticipantDiscountType,
  string
> = {
  percent: "Porcentaje (%)",
  fixed: "Monto fijo (Bs)",
};

/**
 * Reads a program's discount override off its row. Both columns move together,
 * enforced by `programs_discount_pair_complete`, so null means "inherit the
 * global default".
 */
export function programDiscountFrom(program: {
  participantDiscountType: ParticipantDiscountType | null;
  participantDiscountValue: number | null;
}): ParticipantDiscount | null {
  if (
    program.participantDiscountType === null ||
    program.participantDiscountValue === null
  ) {
    return null;
  }

  return {
    type: program.participantDiscountType,
    value: program.participantDiscountValue,
  };
}

/** Reads the global default off the settings row. */
export function globalDiscountFrom(settings: {
  defaultParticipantDiscountType: ParticipantDiscountType;
  defaultParticipantDiscountValue: number;
}): ParticipantDiscount {
  return {
    type: settings.defaultParticipantDiscountType,
    value: settings.defaultParticipantDiscountValue,
  };
}

/**
 * Rounds half-up to two decimals via integer cents. Scaling through
 * micro-units first absorbs binary float noise so values like 10.075
 * become 10.08 instead of 10.07.
 */
export function roundMoney(amount: number): number {
  const micros = Math.round(amount * 1e6);
  return Math.round(micros / 1e4) / 100;
}

/** `1234.5` → `"Bs 1.234,50"`. Every price shown to a buyer goes through this. */
export function formatMoney(amount: number): string {
  const formatted = new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `Bs ${formatted}`;
}

/**
 * Applies one discount to a price. A fixed discount larger than the price
 * clamps to zero rather than going negative — the resulting free session then
 * flows through the normal free-registration path.
 */
export function applyDiscount(
  publicPrice: number,
  discount: ParticipantDiscount,
): number {
  assertDiscount(discount);

  const discounted =
    discount.type === "percent"
      ? publicPrice * (1 - discount.value / 100)
      : publicPrice - discount.value;

  return roundMoney(Math.max(0, discounted));
}

/**
 * The applicable price for a buyer, plus the evidence to persist.
 *
 * A public buyer always pays `publicPrice`. A participant pays an explicit
 * override when one exists, otherwise the program discount, otherwise the
 * global default discount.
 */
export function resolvePrice(
  input: PriceInput,
  eligibility: ParticipantEligibility,
): ResolvedPrice {
  const publicPrice = roundMoney(input.publicPrice);

  if (eligibility === "public") {
    return build(publicPrice, "public", eligibility, input, null);
  }

  if (input.participantPrice !== null) {
    return build(
      roundMoney(input.participantPrice),
      "explicit_override",
      eligibility,
      input,
      null,
    );
  }

  const usesProgramDiscount = input.programDiscount !== null;
  const discount = usesProgramDiscount
    ? input.programDiscount!
    : input.globalDiscount;

  const rule: PriceRule = usesProgramDiscount
    ? "program_discount"
    : "global_discount";

  return build(
    applyDiscount(publicPrice, discount),
    rule,
    eligibility,
    input,
    discount,
  );
}

/** Rejects a negative value, or a percentage above 100. */
function assertDiscount(discount: ParticipantDiscount): void {
  const { type, value } = discount;

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid discount value: ${value}. Expected a non-negative number.`,
    );
  }

  if (type === "percent" && value > 100) {
    throw new Error(
      `Invalid discount percent: ${value}. Expected a value in [0, 100].`,
    );
  }
}

function build(
  amount: number,
  rule: PriceRule,
  basis: ParticipantEligibility,
  input: PriceInput,
  appliedDiscount: ParticipantDiscount | null,
): ResolvedPrice {
  return {
    amount,
    basis,
    rule,
    snapshot: {
      rule,
      basis,
      publicPrice: roundMoney(input.publicPrice),
      participantPrice:
        input.participantPrice === null
          ? null
          : roundMoney(input.participantPrice),
      appliedDiscount,
      amount,
    },
  };
}

/** A zero price routes the purchase through the free-registration flow. */
export function isFreePrice(amount: number): boolean {
  return amount <= 0;
}

/**
 * What a participant saves versus the public price. Used by the session pages
 * and, in Phase 4, by the Week Pass recommendation.
 */
export function participantSavings(input: PriceInput): number {
  const publicAmount = resolvePrice(input, "public").amount;
  const participantAmount = resolvePrice(input, "active_participant").amount;

  return roundMoney(publicAmount - participantAmount);
}
