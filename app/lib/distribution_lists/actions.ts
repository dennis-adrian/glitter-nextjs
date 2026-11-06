"use server";

import { and, count, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  confirmadosListName,
  copiedMessage,
  CreateDistributionListSchema,
  DISTRIBUTION_LIST_MAX_MEMBERS,
  type DistributionListFilter,
  DistributionListFilterV1,
  DistributionListIdSchema,
  type DistributionListMember,
  DistributionListMembersSchema,
  DuplicateDistributionListSchema,
  PullDistributionListSchema,
  pulledMessage,
  UpdateDistributionListSchema,
  type AudienceCount,
} from "@/app/lib/distribution_lists/definitions";
import {
  fetchPullCandidates,
  type PullCandidates,
  previewFilterAudience,
  searchDistributionListCandidates,
} from "@/app/lib/distribution_lists/queries";
import {
  confirmadosMemberIdsSql,
  fixedMemberIdsSql,
  originMemberIdsSql,
  pullCandidatesSql,
  UnreadableListFilterError,
  listMemberIdsSql,
} from "@/app/lib/distribution_lists/resolve";
import { hasPgErrorCode, isUniqueViolationOn } from "@/app/lib/errors/postgres";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  distributionListMembers,
  distributionListRemovals,
  distributionLists,
  festivals,
  users,
} from "@/db/schema";

const LISTS_PATH = "/dashboard/communications/lists";

type Failure = { success: false; message: string };
type ActionResult<T = object> =
  | ({ success: true; message: string } & T)
  | Failure;

const NOT_FOUND = "No encontramos esa lista.";
const ARCHIVED = "Esta lista está archivada: ya no se puede cambiar.";
const NAME_TAKEN = "Ya hay una lista con ese nombre. Elegí otro.";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Global admins with the flag on, before anything else (G2). Festival admins
 * see nothing of Comunicaciones, so they are refused here too.
 */
async function listsActor() {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return {
      actor: null,
      blocked: { success: false, message: "No autorizado." } as Failure,
    };
  }
  const blocked = await featureFlagGuard("comunicados", actor);
  if (blocked) return { actor: null, blocked };
  return { actor, blocked: null };
}

function invalid(error: { issues: { message: string }[] }): Failure {
  return {
    success: false,
    message: error.issues[0]?.message ?? "Revisá los datos de la lista.",
  };
}

function isNameTaken(error: unknown) {
  return isUniqueViolationOn(
    error,
    (constraint) => constraint === "distribution_lists_name_unique",
  );
}

/** Of `userIds`, the ones a list may hold: participants that exist. */
async function participantIds(tx: DbTx, userIds: readonly number[]) {
  if (userIds.length === 0) return [];
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, [...userIds]), eq(users.role, "user")));
  return rows.map((row) => row.id);
}

/**
 * Adds participants to a fixed list the caller holds locked. The cap counts
 * the members already there, so two admins adding at once cannot pass it.
 */
async function addMembersInTx(
  tx: DbTx,
  listId: number,
  userIds: readonly number[],
  addedByUserId: number,
): Promise<
  | { ok: true; added: number; already: number; refused: number }
  | { ok: false; message: string }
> {
  const allowed = await participantIds(tx, userIds);
  const refused = userIds.length - allowed.length;
  if (allowed.length === 0) return { ok: true, added: 0, already: 0, refused };

  const existing = await tx
    .select({ userId: distributionListMembers.userId })
    .from(distributionListMembers)
    .where(
      and(
        eq(distributionListMembers.listId, listId),
        inArray(distributionListMembers.userId, allowed),
      ),
    );
  const already = new Set(existing.map((row) => row.userId));
  const fresh = allowed.filter((id) => !already.has(id));
  if (fresh.length === 0) {
    return { ok: true, added: 0, already: already.size, refused };
  }

  const [{ total }] = await tx
    .select({ total: count() })
    .from(distributionListMembers)
    .where(eq(distributionListMembers.listId, listId));
  if (total + fresh.length > DISTRIBUTION_LIST_MAX_MEMBERS) {
    return {
      ok: false,
      message: `Una lista elegida a mano llega a ${DISTRIBUTION_LIST_MAX_MEMBERS.toLocaleString("es-BO")} personas como máximo; esta ya tiene ${total.toLocaleString("es-BO")}.`,
    };
  }

  const inserted = await tx
    .insert(distributionListMembers)
    .values(fresh.map((userId) => ({ listId, userId, addedByUserId })))
    .onConflictDoNothing()
    .returning({ userId: distributionListMembers.userId });
  return {
    ok: true,
    added: inserted.length,
    already: already.size + (fresh.length - inserted.length),
    refused,
  };
}

/** Locks a list for a write; refuses one that is gone or archived. */
async function lockList(tx: DbTx, listId: number) {
  const [list] = await tx
    .select({
      id: distributionLists.id,
      kind: distributionLists.kind,
      archivedAt: distributionLists.archivedAt,
      originFestivalId: distributionLists.originFestivalId,
      originListId: distributionLists.originListId,
      originName: distributionLists.originName,
    })
    .from(distributionLists)
    .where(eq(distributionLists.id, listId))
    .for("update");
  if (!list) return { list: null, message: NOT_FOUND } as const;
  if (list.archivedAt) return { list: null, message: ARCHIVED } as const;
  return { list, message: null } as const;
}

class Refusal extends Error {}

async function forgetRemovals(
  tx: DbTx,
  listId: number,
  userIds: readonly number[],
) {
  if (userIds.length === 0) return;
  await tx
    .delete(distributionListRemovals)
    .where(
      and(
        eq(distributionListRemovals.listId, listId),
        inArray(distributionListRemovals.userId, [...userIds]),
      ),
    );
}

/** A member write that threw: a person deleted meanwhile, or anything else. */
function memberWriteFailure(error: unknown, log: string): Failure {
  if (hasPgErrorCode(error, "23503")) {
    return {
      success: false,
      message:
        "Alguna de las personas ya no existe. Actualizá la página e intentá de nuevo.",
    };
  }
  console.error(log, {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return { success: false, message: "No se pudo actualizar la lista." };
}

export async function createDistributionListAction(
  input: unknown,
): Promise<ActionResult<{ listId: number }>> {
  const { actor, blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = CreateDistributionListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  try {
    const listId = await db.transaction(async (tx) => {
      const [list] = await tx
        .insert(distributionLists)
        .values({
          name: data.name,
          description: data.description,
          kind: data.kind,
          filter: data.kind === "filter" ? data.filter : null,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        })
        .returning({ id: distributionLists.id });
      if (data.kind === "fixed" && data.memberIds.length > 0) {
        const added = await addMembersInTx(
          tx,
          list.id,
          data.memberIds,
          actor.id,
        );
        if (!added.ok) throw new Refusal(added.message);
      }
      return list.id;
    });
    revalidatePath(LISTS_PATH);
    return { success: true, message: "Guardamos la lista.", listId };
  } catch (error) {
    if (isNameTaken(error)) return { success: false, message: NAME_TAKEN };
    if (error instanceof Refusal) {
      return { success: false, message: error.message };
    }
    console.error("Error creating a distribution list", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { success: false, message: "No se pudo guardar la lista." };
  }
}

/** Name, description and, for a filter list, its criteria. Never the kind. */
export async function updateDistributionListAction(
  input: unknown,
): Promise<ActionResult> {
  const { actor, blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = UpdateDistributionListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  try {
    const message = await db.transaction(async (tx) => {
      const locked = await lockList(tx, data.listId);
      if (!locked.list) return locked.message;
      if (locked.list.kind === "filter" && !data.filter) {
        return "Elegí los filtros de la lista.";
      }
      if (locked.list.kind === "fixed" && data.filter) {
        return "Una lista elegida a mano no tiene filtros.";
      }
      await tx
        .update(distributionLists)
        .set({
          name: data.name,
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(locked.list.kind === "filter" ? { filter: data.filter } : {}),
          updatedByUserId: actor.id,
          updatedAt: sql`now()`,
        })
        .where(eq(distributionLists.id, data.listId));
      return null;
    });
    if (message) return { success: false, message };
    revalidatePath(LISTS_PATH);
    revalidatePath(`${LISTS_PATH}/${data.listId}`);
    return { success: true, message: "Guardamos los cambios." };
  } catch (error) {
    if (isNameTaken(error)) return { success: false, message: NAME_TAKEN };
    console.error("Error updating a distribution list", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { success: false, message: "No se pudieron guardar los cambios." };
  }
}

/**
 * Takes the list out of the pickers and frees its name. Drafts and schedules
 * that name it keep resolving it; sent comunicados never change.
 */
export async function archiveDistributionListAction(
  listId: unknown,
): Promise<ActionResult> {
  const { actor, blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = DistributionListIdSchema.safeParse(listId);
  if (!parsed.success) return { success: false, message: NOT_FOUND };

  const archived = await db
    .update(distributionLists)
    .set({
      archivedAt: sql`now()`,
      updatedByUserId: actor.id,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(distributionLists.id, parsed.data),
        isNull(distributionLists.archivedAt),
      ),
    )
    .returning({ id: distributionLists.id });
  if (archived.length === 0) {
    return { success: false, message: "Esa lista ya estaba archivada." };
  }
  revalidatePath(LISTS_PATH);
  revalidatePath(`${LISTS_PATH}/${parsed.data}`);
  return { success: true, message: "Archivamos la lista." };
}

function addedMessage(added: number, already: number, refused: number) {
  const parts = [
    added === 1 ? "Agregamos 1 persona" : `Agregamos ${added} personas`,
  ];
  if (already > 0) {
    parts.push(already === 1 ? "1 ya estaba" : `${already} ya estaban`);
  }
  if (refused > 0) {
    parts.push(
      refused === 1
        ? "1 no es participante"
        : `${refused} no son participantes`,
    );
  }
  return `${parts.join(" · ")}.`;
}

export async function addDistributionListMembersAction(
  input: unknown,
): Promise<ActionResult<{ added: number }>> {
  const { actor, blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = DistributionListMembersSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { listId, userIds } = parsed.data;

  let result: Awaited<ReturnType<typeof addMembersInTx>>;
  try {
    result = await db.transaction(async (tx) => {
      const locked = await lockList(tx, listId);
      if (!locked.list) return { ok: false, message: locked.message } as const;
      if (locked.list.kind !== "fixed") {
        return {
          ok: false,
          message:
            "Una lista con filtros se calcula sola: no se le agregan personas.",
        } as const;
      }
      const added = await addMembersInTx(tx, listId, userIds, actor.id);
      // Added back by hand: a later "Traer nuevos" no longer holds them out.
      if (added.ok) await forgetRemovals(tx, listId, userIds);
      if (added.ok && added.added > 0) {
        await tx
          .update(distributionLists)
          .set({ updatedByUserId: actor.id, updatedAt: sql`now()` })
          .where(eq(distributionLists.id, listId));
      }
      return added;
    });
  } catch (error) {
    return memberWriteFailure(error, "Error adding distribution list members");
  }
  if (!result.ok) return { success: false, message: result.message };
  revalidatePath(`${LISTS_PATH}/${listId}`);
  revalidatePath(LISTS_PATH);
  return {
    success: true,
    message: addedMessage(result.added, result.already, result.refused),
    added: result.added,
  };
}

export async function removeDistributionListMemberAction(
  input: unknown,
): Promise<ActionResult> {
  const { actor, blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = DistributionListMembersSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { listId, userIds } = parsed.data;

  let message: string | null;
  try {
    message = await db.transaction(async (tx) => {
      const locked = await lockList(tx, listId);
      if (!locked.list) return locked.message;
      if (locked.list.kind !== "fixed") return NOT_FOUND;
      const removed = await tx
        .delete(distributionListMembers)
        .where(
          and(
            eq(distributionListMembers.listId, listId),
            inArray(distributionListMembers.userId, userIds),
          ),
        )
        .returning({ userId: distributionListMembers.userId });
      // A copy remembers who was taken out by hand, so a pull leaves them out.
      if (removed.length > 0 && locked.list.originName !== null) {
        await tx
          .insert(distributionListRemovals)
          .values(
            removed.map(({ userId }) => ({
              listId,
              userId,
              removedByUserId: actor.id,
            })),
          )
          .onConflictDoUpdate({
            target: [
              distributionListRemovals.listId,
              distributionListRemovals.userId,
            ],
            set: { removedByUserId: actor.id, removedAt: sql`now()` },
          });
      }
      if (removed.length > 0) {
        await tx
          .update(distributionLists)
          .set({ updatedByUserId: actor.id, updatedAt: sql`now()` })
          .where(eq(distributionLists.id, listId));
      }
      return null;
    });
  } catch (error) {
    return memberWriteFailure(
      error,
      "Error removing distribution list members",
    );
  }
  if (message) return { success: false, message };
  revalidatePath(`${LISTS_PATH}/${listId}`);
  revalidatePath(LISTS_PATH);
  return { success: true, message: "Quitamos a la persona de la lista." };
}

/** The filter editor's live panel. Reads only. */
export async function previewDistributionListFilterAction(
  filter: unknown,
): Promise<
  | {
      success: true;
      filter: DistributionListFilter;
      count: AudienceCount;
      names: DistributionListMember[];
    }
  | Failure
> {
  const { blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = DistributionListFilterV1.safeParse(filter);
  if (!parsed.success) return invalid(parsed.error);
  const preview = await previewFilterAudience(parsed.data);
  if (!preview) return { success: false, message: "No autorizado." };
  return { success: true, filter: parsed.data, ...preview };
}

export async function searchDistributionListCandidatesAction(input: {
  query: unknown;
  listId?: unknown;
}) {
  const { blocked } = await listsActor();
  if (blocked) return [];
  if (typeof input?.query !== "string") return [];
  const listId = DistributionListIdSchema.safeParse(input.listId);
  return searchDistributionListCandidates(
    input.query,
    listId.success ? listId.data : null,
  );
}

/**
 * Any audience into a fixed list (B10): the source's participants today,
 * frozen. A copy of a festival's Confirmados or of a filter list remembers its
 * origin for "Traer nuevos"; a copy of a fixed list is a plain copy.
 */
export async function duplicateDistributionListAction(
  input: unknown,
): Promise<ActionResult<{ listId: number }>> {
  const { actor, blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = DuplicateDistributionListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { source, name } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      let sourceName: string;
      let memberIds: SQL;
      let origin: {
        originFestivalId?: number;
        originListId?: number;
        originName?: string;
        copiedAt?: SQL;
      } = {};
      if (source.kind === "festival") {
        const [festival] = await tx
          .select({ id: festivals.id, name: festivals.name })
          .from(festivals)
          .where(eq(festivals.id, source.festivalId));
        if (!festival) throw new Refusal("No encontramos ese festival.");
        sourceName = confirmadosListName(festival.name);
        memberIds = confirmadosMemberIdsSql([festival.id]);
        origin = {
          originFestivalId: festival.id,
          originName: sourceName,
          copiedAt: sql`now()`,
        };
      } else {
        // An archived list can be copied too: it is how one comes back.
        const [list] = await tx
          .select({
            id: distributionLists.id,
            name: distributionLists.name,
            kind: distributionLists.kind,
            filter: distributionLists.filter,
          })
          .from(distributionLists)
          .where(eq(distributionLists.id, source.listId));
        if (!list) throw new Refusal(NOT_FOUND);
        sourceName = list.name;
        if (list.kind === "fixed") {
          memberIds = fixedMemberIdsSql([list.id]);
        } else {
          try {
            memberIds = listMemberIdsSql(list);
          } catch (error) {
            if (error instanceof UnreadableListFilterError) {
              throw new Refusal(error.message);
            }
            throw error;
          }
          origin = {
            originListId: list.id,
            originName: sourceName,
            copiedAt: sql`now()`,
          };
        }
      }

      const [copy] = await tx
        .insert(distributionLists)
        .values({
          name,
          kind: "fixed",
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
          ...origin,
        })
        .returning({ id: distributionLists.id });

      // One statement: who is on the source now is what the copy holds.
      const inserted = await tx.execute<{ copied: number; others: number }>(sql`
        WITH people AS (
          SELECT ${users.id} AS user_id, ${users.role} = 'user' AS participant
          FROM (SELECT DISTINCT m.user_id FROM (${memberIds}) AS m(user_id)) AS d
          JOIN ${users} ON ${users.id} = d.user_id
        ),
        copied AS (
          INSERT INTO ${distributionListMembers} (list_id, user_id, added_by_user_id)
          SELECT ${copy.id}, people.user_id, ${actor.id}
          FROM people WHERE people.participant
          ORDER BY people.user_id
          ON CONFLICT DO NOTHING
          RETURNING 1
        )
        SELECT (SELECT count(*) FROM copied)::int AS copied,
               (SELECT count(*) FROM people WHERE NOT people.participant)::int AS others`);
      const { copied, others } = inserted.rows[0] ?? { copied: 0, others: 0 };
      if (copied > DISTRIBUTION_LIST_MAX_MEMBERS) {
        throw new Refusal(
          `«${sourceName}» tiene ${copied.toLocaleString("es-BO")} participantes y una lista elegida a mano llega a ${DISTRIBUTION_LIST_MAX_MEMBERS.toLocaleString("es-BO")} como máximo. Copiá una lista más chica.`,
        );
      }
      return { listId: copy.id, sourceName, copied, others };
    });
    revalidatePath(LISTS_PATH);
    return {
      success: true,
      message: copiedMessage(
        outcome.copied,
        outcome.sourceName,
        outcome.others,
      ),
      listId: outcome.listId,
    };
  } catch (error) {
    if (isNameTaken(error)) return { success: false, message: NAME_TAKEN };
    if (error instanceof Refusal) {
      return { success: false, message: error.message };
    }
    if (hasPgErrorCode(error, "23503")) {
      return {
        success: false,
        message: "La lista cambió mientras la copiábamos. Intentá de nuevo.",
      };
    }
    console.error("Error duplicating a distribution list", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { success: false, message: "No se pudo copiar la lista." };
  }
}

/** The "Traer nuevos" dialog: who is in the origin now and not in the copy. */
export async function previewDistributionListPullAction(
  listId: unknown,
): Promise<PullCandidates> {
  const { blocked } = await listsActor();
  if (blocked) return { ok: false, message: blocked.message };
  const parsed = DistributionListIdSchema.safeParse(listId);
  if (!parsed.success) return { ok: false, message: NOT_FOUND };
  return fetchPullCandidates(parsed.data);
}

/**
 * Adds the people ticked in "Traer nuevos", re-checked against the origin as
 * it is now: anyone no longer in it, or already in the copy, is left out, and
 * those removed by hand only come back with `includeRemoved`.
 */
export async function pullDistributionListMembersAction(
  input: unknown,
): Promise<ActionResult<{ added: number }>> {
  const { actor, blocked } = await listsActor();
  if (blocked) return blocked;
  const parsed = PullDistributionListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { listId, userIds, includeRemoved } = parsed.data;

  let result:
    | { ok: true; added: number; leftOut: number; originName: string }
    | { ok: false; message: string };
  try {
    result = await db.transaction(async (tx) => {
      const locked = await lockList(tx, listId);
      if (!locked.list) return { ok: false, message: locked.message } as const;
      if (locked.list.kind !== "fixed") {
        return { ok: false, message: NOT_FOUND } as const;
      }
      const origin = await originMemberIdsSql(tx, locked.list);
      if (!origin.ok) return origin;
      const current = await tx.execute<{ user_id: number; removed: boolean }>(
        sql`SELECT c.user_id, c.removed
            FROM (${pullCandidatesSql(listId, origin.memberIds)}) AS c`,
      );
      const offered = new Map(
        current.rows.map((row) => [Number(row.user_id), row.removed]),
      );
      const wanted = userIds.filter((id) => {
        const removed = offered.get(id);
        return removed !== undefined && (!removed || includeRemoved);
      });
      let added = 0;
      if (wanted.length > 0) {
        const outcome = await addMembersInTx(tx, listId, wanted, actor.id);
        if (!outcome.ok) return outcome;
        added = outcome.added;
        await forgetRemovals(tx, listId, wanted);
      }
      await tx
        .update(distributionLists)
        .set({
          lastPulledAt: sql`now()`,
          updatedByUserId: actor.id,
          updatedAt: sql`now()`,
        })
        .where(eq(distributionLists.id, listId));
      return {
        ok: true,
        added,
        leftOut: userIds.length - added,
        originName: locked.list.originName!,
      } as const;
    });
  } catch (error) {
    return memberWriteFailure(error, "Error pulling distribution list members");
  }
  if (!result.ok) return { success: false, message: result.message };
  revalidatePath(`${LISTS_PATH}/${listId}`);
  revalidatePath(LISTS_PATH);
  return {
    success: true,
    message: pulledMessage(result.added, result.originName, result.leftOut),
    added: result.added,
  };
}
