import "server-only";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import {
  type FullTablePairProblem,
  validateFullTablePair,
} from "@/app/lib/stands/full-table-pairs";
import {
  loadStandGroupMembers,
  loadStandsAsPairMembers,
} from "@/app/lib/stands/full-table-health";
import { pruneEmptyGroups } from "@/app/lib/stands/group-service";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { resolveJointAxis } from "@/app/lib/stands/groups";
import { lockStandRows } from "@/app/lib/reservations/locks";
import { OCCUPYING_RESERVATION_STATUSES } from "@/app/lib/reservations/members";
import { db } from "@/db";
import {
  standGroups,
  standHoldMembers,
  standHolds,
  standReservationStands,
  stands,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FullTableConfigResult =
  | { ok: true; groupId: number; type: "visual_group" | "full_table" }
  | { ok: false; code: "GROUP_NOT_FOUND"; problems?: undefined }
  | { ok: false; code: "OCCUPIED"; problems?: undefined }
  | { ok: false; code: "INVALID_PAIR"; problems: FullTablePairProblem[] };

/** Any reservation still holding one of these stands. */
async function hasLiveOccupancy(tx: DbTx, standIds: readonly number[]) {
  if (standIds.length === 0) return false;

  // A participant holding both halves is mid-booking on this pair. Retyping
  // the group underneath them would let confirmation create a two-stand
  // reservation on a group that is no longer a declared full table.
  const [heldRow] = await tx
    .select({ id: standHoldMembers.id })
    .from(standHoldMembers)
    .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
    .where(
      and(
        inArray(standHoldMembers.standId, [...standIds]),
        gt(standHolds.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (heldRow != null) return true;

  const [row] = await tx
    .select({ id: standReservationStands.id })
    .from(standReservationStands)
    .where(
      and(
        inArray(standReservationStands.standId, [...standIds]),
        isNull(standReservationStands.releasedAt),
        inArray(standReservationStands.reservationStatus, [
          ...OCCUPYING_RESERVATION_STATUSES,
        ]),
      ),
    )
    .limit(1);
  return row != null;
}

/**
 * Declares a stand group a full table, or returns it to a visual group.
 *
 * The exactly-two-members rule and the matching-attributes rules are cross-row
 * invariants no column can express, so this command is the only sanctioned way
 * to set the type — a direct write can still produce a malformed group, which
 * is why the health report checks the same rules.
 *
 * Locks the group and its stands before validating, so a concurrent price or
 * membership edit cannot slip between the check and the write.
 */
export async function setStandGroupFullTable(input: {
  groupId: number;
  enabled: boolean;
}): Promise<FullTableConfigResult> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: standGroups.id, type: standGroups.type })
      .from(standGroups)
      .where(eq(standGroups.id, input.groupId))
      .limit(1)
      .for("update");
    if (!group) return { ok: false, code: "GROUP_NOT_FOUND" };

    const memberIds = await tx
      .select({ id: stands.id })
      .from(stands)
      .where(eq(stands.standGroupId, input.groupId));
    await lockStandRows(
      tx,
      memberIds.map((row) => row.id),
    );

    // Re-read under the stand locks; membership may have changed.
    const members = await loadStandGroupMembers(tx, input.groupId);

    if (
      await hasLiveOccupancy(
        tx,
        members.map((member) => member.id),
      )
    ) {
      return { ok: false, code: "OCCUPIED" };
    }

    if (input.enabled) {
      const validation = validateFullTablePair(members);
      if (!validation.ok) {
        return {
          ok: false,
          code: "INVALID_PAIR",
          problems: validation.problems,
        };
      }
    }

    const type = input.enabled ? "full_table" : "visual_group";
    await tx
      .update(standGroups)
      .set({
        type,
        // Turning the feature off clears the price: `setFullTablePrice`
        // refuses a group that is not a full table, so a price left behind
        // here is one no admin can see or edit, and re-enabling would put the
        // table straight back on sale at a number nobody re-confirmed.
        ...(input.enabled ? {} : { fullTablePrice: null }),
        updatedAt: new Date(),
      })
      .where(eq(standGroups.id, input.groupId));

    return { ok: true, groupId: input.groupId, type };
  });
}

export type DeclareFullTablePairResult =
  | { ok: true; groupId: number }
  | {
      ok: false;
      code:
        | "STANDS_NOT_FOUND"
        | "DUPLICATE_STANDS"
        | "ALREADY_FULL_TABLE"
        | "NO_SECTOR"
        | "NOT_ALIGNED"
        | "OCCUPIED"
        | "INVALID_PAIR";
      problems: FullTablePairProblem[];
    };

function pairRefusal(
  code: Extract<DeclareFullTablePairResult, { ok: false }>["code"],
  problem: FullTablePairProblem,
): DeclareFullTablePairResult {
  return { ok: false, code, problems: [problem] };
}

/**
 * Creates the group and declares it a full table in one transaction.
 *
 * `groupStands` and `setStandGroupFullTable` are separate commands, and calling
 * them in sequence from a browser leaves a bare `visual_group` behind whenever
 * the second half fails — two stands silently joined into something nobody
 * asked for. This is the single command the stands table uses instead.
 *
 * Everything is validated before the first write, the way a price edit
 * validates the projected pair: a refusal then names every mismatch at once
 * instead of surfacing them one discarded write at a time.
 */
export async function declareFullTablePair(input: {
  standIds: readonly number[];
}): Promise<DeclareFullTablePairResult> {
  const standIds = [...new Set(input.standIds)];
  if (standIds.length !== input.standIds.length) {
    return pairRefusal("DUPLICATE_STANDS", {
      code: "MEMBER_COUNT",
      message: "Seleccionaste el mismo espacio dos veces.",
    });
  }
  if (standIds.length !== 2) {
    return pairRefusal("INVALID_PAIR", {
      code: "MEMBER_COUNT",
      message: `Una mesa completa son exactamente dos espacios; seleccionaste ${standIds.length}.`,
    });
  }

  return db.transaction(async (tx) => {
    await lockStandRows(tx, standIds);

    const placement = await tx
      .select({
        id: stands.id,
        label: stands.label,
        standNumber: stands.standNumber,
        festivalSectorId: stands.festivalSectorId,
        positionLeft: stands.positionLeft,
        positionTop: stands.positionTop,
        standGroupId: stands.standGroupId,
      })
      .from(stands)
      .where(inArray(stands.id, standIds));
    if (placement.length !== 2) {
      return pairRefusal("STANDS_NOT_FOUND", {
        code: "MEMBER_COUNT",
        message: "No se encontraron ambos espacios.",
      });
    }

    const previousGroupIds = [
      ...new Set(
        placement
          .map((row) => row.standGroupId)
          .filter((id): id is number => id != null),
      ),
    ];

    // A half already spoken for cannot be re-paired. Re-parenting it would
    // leave the table it came from with a single member — a `full_table` group
    // no rule can satisfy — so the second table has to be refused rather than
    // silently dismantle the first. `StandBulkActionsMenu` greys the action out
    // for the same reason; this is the rule itself.
    const declaredGroupIds = new Set(
      previousGroupIds.length === 0
        ? []
        : (
            await tx
              .select({ id: standGroups.id })
              .from(standGroups)
              .where(
                and(
                  inArray(standGroups.id, previousGroupIds),
                  eq(standGroups.type, "full_table"),
                ),
              )
          ).map((row) => row.id),
    );
    const alreadyPaired = placement.filter(
      (row) =>
        row.standGroupId != null && declaredGroupIds.has(row.standGroupId),
    );
    if (alreadyPaired.length > 0) {
      return pairRefusal("ALREADY_FULL_TABLE", {
        code: "MEMBER_COUNT",
        message: `${alreadyPaired.map(formatStandLabel).join(" y ")} ya ${
          alreadyPaired.length === 1 ? "es mitad" : "son mitades"
        } de una mesa completa; separá esa mesa antes de declarar otra.`,
      });
    }

    if (await hasLiveOccupancy(tx, standIds)) {
      return pairRefusal("OCCUPIED", {
        code: "MEMBER_COUNT",
        message:
          "Hay una reserva vigente en estos espacios; liberala antes de declarar la mesa.",
      });
    }

    const members = await loadStandsAsPairMembers(tx, standIds);
    const validation = validateFullTablePair(members);
    if (!validation.ok) {
      return {
        ok: false as const,
        code: "INVALID_PAIR" as const,
        problems: validation.problems,
      };
    }

    const sectorId = placement[0].festivalSectorId;
    if (sectorId == null) {
      return pairRefusal("NO_SECTOR", {
        code: "SECTOR_MISMATCH",
        message: "Los espacios deben pertenecer a un sector.",
      });
    }

    // The group's own rule, which the pairing rules do not cover: members that
    // line up on neither axis can never be drawn as one clean outline. An admin
    // working from the table cannot see positions, so this has to name itself
    // rather than surface as a generic failure.
    if (resolveJointAxis(placement) === null) {
      return pairRefusal("NOT_ALIGNED", {
        code: "NOT_PLACED_ON_MAP",
        message:
          "Los espacios no están alineados en una misma fila o columna del plano. Acomodalos en el editor de mapa y volvé.",
      });
    }

    const [group] = await tx
      .insert(standGroups)
      .values({ festivalSectorId: sectorId, type: "full_table" })
      .returning({ id: standGroups.id });

    await tx
      .update(stands)
      .set({ standGroupId: group.id, updatedAt: new Date() })
      .where(inArray(stands.id, standIds));

    await pruneEmptyGroups(tx, previousGroupIds);

    return { ok: true as const, groupId: group.id };
  });
}

export type DissolveFullTablePairResult =
  | { ok: true }
  | { ok: false; code: "GROUP_NOT_FOUND" | "OCCUPIED" };

/**
 * Undoes a declaration completely: the stands stop being a table and stop being
 * grouped at all.
 *
 * Returning the group to `visual_group` is the narrower undo and stays
 * available through `setStandGroupFullTable`. From the stands table the admin's
 * question is whether these two stands are one table, and a leftover group they
 * cannot see from there is exactly what `declareFullTablePair` exists to avoid
 * creating.
 */
export async function dissolveFullTablePair(input: {
  groupId: number;
}): Promise<DissolveFullTablePairResult> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: standGroups.id })
      .from(standGroups)
      .where(eq(standGroups.id, input.groupId))
      .limit(1)
      .for("update");
    if (!group) return { ok: false as const, code: "GROUP_NOT_FOUND" as const };

    const memberIds = (
      await tx
        .select({ id: stands.id })
        .from(stands)
        .where(eq(stands.standGroupId, input.groupId))
    ).map((row) => row.id);
    await lockStandRows(tx, memberIds);

    if (await hasLiveOccupancy(tx, memberIds)) {
      return { ok: false as const, code: "OCCUPIED" as const };
    }

    // The stands foreign key is ON DELETE SET NULL, so deleting the group
    // releases every member still attached to it.
    await tx.delete(standGroups).where(eq(standGroups.id, input.groupId));
    return { ok: true as const };
  });
}

export type SetFullTablePriceResult =
  | { ok: true; groupId: number }
  | {
      ok: false;
      code: "GROUP_NOT_FOUND" | "NOT_A_FULL_TABLE" | "INVALID_PRICE";
    };

/**
 * Sets what booking a whole table costs.
 *
 * Priced per table rather than per category: stand prices already vary by
 * sector, so one number for every table in a category would sell an expensive
 * table for the same as a cheap one. Clearing it withdraws the table from
 * participants rather than falling back to a guess — a table nobody has priced
 * is not something to sell.
 *
 * Live reservations keep their own snapshot, so repricing never rewrites what
 * someone was already billed.
 */
export async function setFullTablePrice(input: {
  groupId: number;
  price: number | null;
}): Promise<SetFullTablePriceResult> {
  if (input.price != null) {
    const rounded = Math.round(input.price * 100) / 100;
    if (
      !Number.isFinite(input.price) ||
      input.price < 0 ||
      Math.abs(rounded - input.price) > 1e-9
    ) {
      return { ok: false, code: "INVALID_PRICE" };
    }
  }

  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: standGroups.id, type: standGroups.type })
      .from(standGroups)
      .where(eq(standGroups.id, input.groupId))
      .limit(1)
      .for("update");
    if (!group) return { ok: false as const, code: "GROUP_NOT_FOUND" as const };
    if (group.type !== "full_table") {
      return { ok: false as const, code: "NOT_A_FULL_TABLE" as const };
    }

    await tx
      .update(standGroups)
      .set({ fullTablePrice: input.price, updatedAt: new Date() })
      .where(eq(standGroups.id, input.groupId));

    return { ok: true as const, groupId: input.groupId };
  });
}
