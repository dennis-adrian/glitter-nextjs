"use server";

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  CreateDistributionListSchema,
  DISTRIBUTION_LIST_MAX_MEMBERS,
  type DistributionListFilter,
  DistributionListFilterV1,
  DistributionListIdSchema,
  type DistributionListMember,
  DistributionListMembersSchema,
  UpdateDistributionListSchema,
  type AudienceCount,
} from "@/app/lib/distribution_lists/definitions";
import {
  previewFilterAudience,
  searchDistributionListCandidates,
} from "@/app/lib/distribution_lists/queries";
import { isUniqueViolationOn } from "@/app/lib/errors/postgres";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { distributionListMembers, distributionLists, users } from "@/db/schema";

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
    })
    .from(distributionLists)
    .where(eq(distributionLists.id, listId))
    .for("update");
  if (!list) return { list: null, message: NOT_FOUND } as const;
  if (list.archivedAt) return { list: null, message: ARCHIVED } as const;
  return { list, message: null } as const;
}

class Refusal extends Error {}

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
          description: data.description,
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

  const result = await db.transaction(async (tx) => {
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
    if (added.ok && added.added > 0) {
      await tx
        .update(distributionLists)
        .set({ updatedByUserId: actor.id, updatedAt: sql`now()` })
        .where(eq(distributionLists.id, listId));
    }
    return added;
  });
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

  const message = await db.transaction(async (tx) => {
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
    if (removed.length > 0) {
      await tx
        .update(distributionLists)
        .set({ updatedByUserId: actor.id, updatedAt: sql`now()` })
        .where(eq(distributionLists.id, listId));
    }
    return null;
  });
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
