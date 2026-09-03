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
  | {
      ok: false;
      code:
        | "STANDS_NOT_FOUND"
        | "INVALID_PRICES"
        | "BREAKS_PAIR"
        | "DUPLICATE_STANDS";
      problems: StandPriceProblem[];
    };

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Locks the given `stand_groups` rows in ascending id order and returns their
 * types.
 *
 * Groups are locked before stands because `setStandGroupFullTable` does the
 * same; taking the two tables in opposite orders is how the price editor and
 * the full-table switch would deadlock on the same table.
 */
async function lockStandGroupTypes(tx: DbTx, groupIds: readonly number[]) {
  const types = new Map<number, string>();
  for (const groupId of [...new Set(groupIds)].sort((a, b) => a - b)) {
    const [group] = await tx
      .select({ type: standGroups.type })
      .from(standGroups)
      .where(eq(standGroups.id, groupId))
      .limit(1)
      .for("update");
    if (group) types.set(groupId, group.type);
  }
  return types;
}

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

  // Two entries for the same stand would race each other in the write loop and,
  // worse, make the row count below look like a missing stand. Reject them by
  // name instead of letting either failure mode speak for the caller.
  const uniqueIds = new Set(updates.map((update) => update.standId));
  if (uniqueIds.size !== updates.length) {
    const seen = new Set<number>();
    const duplicates = new Set<number>();
    for (const update of updates) {
      if (seen.has(update.standId)) duplicates.add(update.standId);
      seen.add(update.standId);
    }
    return {
      ok: false,
      code: "DUPLICATE_STANDS",
      problems: [...duplicates].map((standId) => ({
        standId,
        message: "El espacio aparece más de una vez en el mismo cambio.",
      })),
    };
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
    // Group memberships first, unlocked, only to know which group rows to take
    // — the locks themselves must run groups-before-stands.
    const preliminary = await tx
      .select({ standGroupId: stands.standGroupId })
      .from(stands)
      .where(inArray(stands.id, standIds));
    const groupTypes = await lockStandGroupTypes(
      tx,
      preliminary
        .map((row) => row.standGroupId)
        .filter((id): id is number => id != null),
    );

    await lockStandRows(tx, standIds);

    const existing = await tx
      .select({
        id: stands.id,
        standCategory: stands.standCategory,
        standGroupId: stands.standGroupId,
        sharedPrice: stands.sharedPrice,
      })
      .from(stands)
      .where(inArray(stands.id, standIds));
    if (existing.length !== uniqueIds.size) {
      return {
        ok: false as const,
        code: "STANDS_NOT_FOUND" as const,
        problems: [{ standId: null, message: "No se encontraron todos los espacios." }],
      };
    }

    const rowById = new Map(existing.map((row) => [row.id, row]));
    const storedProblems: StandPriceProblem[] = [];
    for (const update of updates) {
      const row = rowById.get(update.standId);
      if (update.sharedPrice != null && row?.standCategory !== "illustration") {
        storedProblems.push({
          standId: update.standId,
          message:
            "Solo los espacios de ilustración tienen precio compartido.",
        });
      }
      // An omitted shared price keeps the stored one, which the new individual
      // price can overtake. The column check would reject the write anyway;
      // saying so here turns a generic failure into an actionable message.
      if (
        update.sharedPrice === undefined &&
        row?.sharedPrice != null &&
        row.sharedPrice < update.individualPrice
      ) {
        storedProblems.push({
          standId: update.standId,
          message: `El precio compartido guardado (Bs${row.sharedPrice.toFixed(2)}) quedaría por debajo del individual; actualizá también el compartido.`,
        });
      }
    }
    if (storedProblems.length > 0) {
      return {
        ok: false as const,
        code: "INVALID_PRICES" as const,
        problems: storedProblems,
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
      // Regrouping between the two reads can surface a group the locking pass
      // missed. Reading its type unlocked is still sound: flipping a type goes
      // through `setStandGroupFullTable`, which must first take the stand locks
      // this transaction already holds.
      const type =
        groupTypes.get(groupId) ??
        (
          await tx
            .select({ type: standGroups.type })
            .from(standGroups)
            .where(eq(standGroups.id, groupId))
            .limit(1)
        )[0]?.type;
      if (type !== "full_table") continue;

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
          // Legacy adapter. Nothing else writes stands.price any more, so
          // mirroring the individual price here keeps callers that still read
          // it correct until the column is dropped.
          price: update.individualPrice,
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

/**
 * Guard for the legacy single-price admin editors, which predate the
 * individual/shared split and still send one amount.
 *
 * That amount is the individual price, and those callers write it without the
 * pair and ordering rules `updateStandPrices` enforces. Rather than duplicate
 * the whole ruleset, refuse the two edits that could break an invariant and
 * point the admin at the pair-aware dialog.
 *
 * Callers must already hold the stand row locks. The group type is read without
 * its own lock on purpose: taking one here would invert the groups-before-
 * stands order and deadlock against the price dialog. A concurrent full-table
 * activation blocks on those same stand locks and revalidates prices itself, so
 * it cannot pair mismatched halves behind this check.
 */
export async function guardLegacySinglePriceEdit(
  tx: DbTx,
  standIds: readonly number[],
  individualPrice: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // The legacy editors validate the amount loosely, so a value the pair-aware
  // path would refuse can still arrive here. Reject it with the same rule
  // instead of letting it reach the column.
  if (individualPrice < 0 || !isTwoDecimals(individualPrice)) {
    return {
      ok: false,
      message: "El precio individual debe ser 0 o más, con hasta dos decimales.",
    };
  }

  if (standIds.length === 0) return { ok: true };

  const rows = await tx
    .select({
      id: stands.id,
      sharedPrice: stands.sharedPrice,
      groupType: standGroups.type,
    })
    .from(stands)
    .leftJoin(standGroups, eq(standGroups.id, stands.standGroupId))
    .where(inArray(stands.id, [...standIds]));

  if (rows.some((row) => row.groupType === "full_table")) {
    return {
      ok: false,
      message:
        "Uno o más espacios son mitades de una mesa completa. Cambiá su precio desde el editor de precios, seleccionando ambas mitades.",
    };
  }

  const belowShared = rows.find(
    (row) => row.sharedPrice != null && row.sharedPrice < individualPrice,
  );
  if (belowShared) {
    return {
      ok: false,
      message:
        "El precio compartido guardado quedaría por debajo del individual. Actualizá ambos desde el editor de precios.",
    };
  }

  return { ok: true };
}
