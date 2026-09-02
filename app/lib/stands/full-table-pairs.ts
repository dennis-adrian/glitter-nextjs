/**
 * Full-table pairing rules (PRD §7.1).
 *
 * One stand is half a physical table. A full table is exactly two stands an
 * admin has explicitly paired — never inferred from map coordinates, because
 * positions are placed freehand and adjacency proves nothing.
 *
 * Pure on purpose: the admin command, the health report, and the tests all
 * apply the same rules to rows they fetched themselves.
 */

/** Categories that may be sold as a full table. */
export const FULL_TABLE_CATEGORIES = [
  "illustration",
  "entrepreneurship",
] as const;
export type FullTableCategory = (typeof FULL_TABLE_CATEGORIES)[number];

export type FullTablePairMember = {
  id: number;
  label: string | null;
  standNumber: number;
  festivalId: number | null;
  festivalSectorId: number | null;
  standCategory: string;
  participationType: string;
  individualPrice: number;
  sharedPrice: number | null;
  positionLeft: number | null;
  positionTop: number | null;
  /** Subcategory ids the stand is eligible for, in any order. */
  subcategoryIds: number[];
};

export type FullTablePairProblemCode =
  | "MEMBER_COUNT"
  | "CATEGORY_NOT_ELIGIBLE"
  | "CATEGORY_MISMATCH"
  | "FESTIVAL_MISMATCH"
  | "SECTOR_MISMATCH"
  | "PARTICIPATION_TYPE_MISMATCH"
  | "SUBCATEGORY_MISMATCH"
  | "INDIVIDUAL_PRICE_MISMATCH"
  | "SHARED_PRICE_MISSING"
  | "SHARED_PRICE_MISMATCH"
  | "NOT_PLACED_ON_MAP";

export type FullTablePairProblem = {
  code: FullTablePairProblemCode;
  /** Spanish, and names the exact mismatch so an admin can act on it. */
  message: string;
};

export type FullTablePairValidation =
  | { ok: true }
  | { ok: false; problems: FullTablePairProblem[] };

function standName(member: FullTablePairMember) {
  return member.label?.trim() || `#${member.standNumber}`;
}

function sameIdSet(left: number[], right: number[]) {
  const a = [...new Set(left)].sort((x, y) => x - y);
  const b = [...new Set(right)].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Every rule a `full_table` group must satisfy. Returns all problems rather
 * than the first, so the editor can show an admin everything to fix at once.
 */
export function validateFullTablePair(
  members: readonly FullTablePairMember[],
): FullTablePairValidation {
  const problems: FullTablePairProblem[] = [];

  if (members.length !== 2) {
    problems.push({
      code: "MEMBER_COUNT",
      message: `Una mesa completa son exactamente dos espacios; este grupo tiene ${members.length}.`,
    });
    // Every remaining rule compares two members, so stop here.
    return { ok: false, problems };
  }

  const [first, second] = members;

  for (const member of members) {
    if (
      !FULL_TABLE_CATEGORIES.includes(member.standCategory as FullTableCategory)
    ) {
      problems.push({
        code: "CATEGORY_NOT_ELIGIBLE",
        message: `El espacio ${standName(member)} es de categoría ${member.standCategory}; la mesa completa solo aplica a ilustración y emprendimiento.`,
      });
    }
    if (member.positionLeft == null || member.positionTop == null) {
      problems.push({
        code: "NOT_PLACED_ON_MAP",
        message: `El espacio ${standName(member)} no está ubicado en el plano.`,
      });
    }
  }

  if (first.standCategory !== second.standCategory) {
    problems.push({
      code: "CATEGORY_MISMATCH",
      message: `Los espacios son de categorías distintas: ${standName(first)} es ${first.standCategory} y ${standName(second)} es ${second.standCategory}.`,
    });
  }
  if (first.festivalId !== second.festivalId) {
    problems.push({
      code: "FESTIVAL_MISMATCH",
      message: "Los espacios pertenecen a festivales distintos.",
    });
  }
  if (first.festivalSectorId !== second.festivalSectorId) {
    problems.push({
      code: "SECTOR_MISMATCH",
      message: "Los espacios pertenecen a sectores distintos.",
    });
  }
  if (first.participationType !== second.participationType) {
    problems.push({
      code: "PARTICIPATION_TYPE_MISMATCH",
      message: `Los tipos de participación no coinciden: ${first.participationType} y ${second.participationType}.`,
    });
  }
  if (!sameIdSet(first.subcategoryIds, second.subcategoryIds)) {
    problems.push({
      code: "SUBCATEGORY_MISMATCH",
      message:
        "Los espacios no admiten las mismas subcategorías, así que no se pueden reservar como una sola mesa.",
    });
  }

  if (first.individualPrice !== second.individualPrice) {
    problems.push({
      code: "INDIVIDUAL_PRICE_MISMATCH",
      message: `Los precios individuales no coinciden: ${standName(first)} cuesta Bs${first.individualPrice.toFixed(2)} y ${standName(second)} Bs${second.individualPrice.toFixed(2)}.`,
    });
  }

  // Only illustration sells a shared price, so only illustration pairs must
  // agree on one. Entrepreneurship ignores `shared_price` entirely.
  if (
    first.standCategory === "illustration" &&
    second.standCategory === "illustration"
  ) {
    const missing = members.filter((member) => member.sharedPrice == null);
    if (missing.length > 0) {
      problems.push({
        code: "SHARED_PRICE_MISSING",
        message: `Falta el precio compartido en ${missing.map(standName).join(" y ")}.`,
      });
    } else if (first.sharedPrice !== second.sharedPrice) {
      problems.push({
        code: "SHARED_PRICE_MISMATCH",
        message: `Los precios compartidos no coinciden: ${standName(first)} cuesta Bs${first.sharedPrice!.toFixed(2)} y ${standName(second)} Bs${second.sharedPrice!.toFixed(2)}.`,
      });
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
