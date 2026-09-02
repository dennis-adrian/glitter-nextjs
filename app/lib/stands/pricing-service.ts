import "server-only";

import { eq, inArray } from "drizzle-orm";

import { validateFullTablePair } from "@/app/lib/stands/full-table-pairs";
import { loadStandGroupMembers } from "@/app/lib/stands/full-table-health";
import { lockStandRows } from "@/app/lib/reservations/locks";
import { roundMoney } from "@/app/lib/reservations/money";
import { db } from "@/db";
import { standGroups, stands } from "@/db/schema";

export type StandPriceUpdate = {
  standId: number;
  individualPrice: number;
  /**
   * Illustration only. `null` clears it; any value on another category is
   * rejected rather than silently ignored, so a mistake is visible.
   */
  sharedPrice?: number | null;
};

export type StandPriceProblem = {
  standId: number | null;
  message: string;
};

export type StandPriceResult =
  | { ok: true; updated: number }
  | { ok: false; code: "STANDS_NOT_FOUND" | "INVALID_PRICES" | "BREAKS_PAIR"; problems: StandPriceProblem[] };

function isTwoDecimals(value: number) {
  return (
    Number.isFinite(value) && Math.abs(roundMoney(value) - value) < 1e-9
  );
}

/**
 * Sets individual and shared prices for one or more stands in a single
 * transaction.
 *
 * Bulk is the default shape rather than a convenience: a full-table pair must
 * agree on price, so changing one half alone would always be rejected. Editing
 * both together is the only way to reprice a paired stand, and this is what
 * makes that possible.
 *
 * A stand that belongs to a `full_table` group is revalidated against its
 * partner after the change. An edit that would leave the pair malformed is
 * refused with the exact mismatch — an admin who genuinely wants to break a
 * pair turns the full table off first, which skips validation by design.
 */
export async function updateStandPrices(
  updates: readonly StandPriceUpdate[],
): Promise<StandPriceResult> {
  if (updates.length === 0) {
    return { ok: true, updated: 0 };
  }

  const problems: StandPriceProblem[] = [];
  for (const update of updates) {
    if (update.individualPrice < 0 || !isTwoDecimals(update.individualPrice)) {
      problems.push({
        standId: update.standId,
        message:
          "El precio individual debe ser 0 o más, con hasta dos decimales.",
      });
    }
    if (update.sharedPrice != null) {
      if (update.sharedPrice < 0 || !isTwoDecimals(update.sharedPrice)) {
        problems.push({
          standId: update.standId,
          message:
            "El precio compartido debe ser 0 o más, con hasta dos decimales.",
        });
      } else if (update.sharedPrice < update.individualPrice) {
        problems.push({
          standId: update.standId,
          message:
            "El precio compartido no puede ser menor que el individual.",
        });
      }
    }
  }
  if (problems.length > 0) {
    return { ok: false, code: "INVALID_PRICES", problems };
  }

  const standIds = updates.map((update) => update.standId);

  return db.transaction(async (tx) => {
    await lockStandRows(tx, standIds);

    const existing = await tx
      .select({
        id: stands.id,
        standCategory: stands.standCategory,
        standGroupId: stands.standGroupId,
      })
      .from(stands)
      .where(inArray(stands.id, standIds));
    if (existing.length !== updates.length) {
      return {
        ok: false as const,
        code: "STANDS_NOT_FOUND" as const,
        problems: [{ standId: null, message: "No se encontraron todos los espacios." }],
      };
    }

    const categoryById = new Map(
      existing.map((row) => [row.id, row.standCategory]),
    );
    const categoryProblems: StandPriceProblem[] = [];
    for (const update of updates) {
      if (
        update.sharedPrice != null &&
        categoryById.get(update.standId) !== "illustration"
      ) {
        categoryProblems.push({
          standId: update.standId,
          message:
            "Solo los espacios de ilustración tienen precio compartido.",
        });
      }
    }
    if (categoryProblems.length > 0) {
      return {
        ok: false as const,
        code: "INVALID_PRICES" as const,
        problems: categoryProblems,
      };
    }

    // Validate the *projected* pair before writing anything: applying the
    // change and rolling back on failure would work, but this keeps the exact
    // mismatch messages and avoids a write that is always discarded.
    const groupIds = [
      ...new Set(
        existing
          .map((row) => row.standGroupId)
          .filter((id): id is number => id != null),
      ),
    ];
    const updateByStand = new Map(
      updates.map((update) => [update.standId, update]),
    );
    const pairProblems: StandPriceProblem[] = [];

    for (const groupId of groupIds) {
      const [group] = await tx
        .select({ type: standGroups.type })
        .from(standGroups)
        .where(eq(standGroups.id, groupId))
        .limit(1)
        .for("update");
      if (group?.type !== "full_table") continue;

      const projected = (await loadStandGroupMembers(tx, groupId)).map(
        (member) => {
          const update = updateByStand.get(member.id);
          if (!update) return member;
          return {
            ...member,
            individualPrice: update.individualPrice,
            sharedPrice:
              update.sharedPrice === undefined
                ? member.sharedPrice
                : update.sharedPrice,
          };
        },
      );

      const validation = validateFullTablePair(projected);
      if (!validation.ok) {
        for (const problem of validation.problems) {
          pairProblems.push({ standId: null, message: problem.message });
        }
      }
    }

    if (pairProblems.length > 0) {
      return {
        ok: false as const,
        code: "BREAKS_PAIR" as const,
        problems: [
          ...pairProblems,
          {
            standId: null,
            message:
              "Editá ambas mitades a la vez, o desactivá la mesa completa antes de cambiar el precio.",
          },
        ],
      };
    }

    for (const update of updates) {
      await tx
        .update(stands)
        .set({
          individualPrice: update.individualPrice,
          ...(update.sharedPrice === undefined
            ? {}
            : { sharedPrice: update.sharedPrice }),
          updatedAt: new Date(),
        })
        .where(eq(stands.id, update.standId));
    }

    return { ok: true as const, updated: updates.length };
  });
}
