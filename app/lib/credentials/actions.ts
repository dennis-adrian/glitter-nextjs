"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  applyPrintState,
  batchItemsFor,
  buildHolders,
  isDefaultRule,
  isPrintable,
  resolveRules,
} from "@/app/lib/credentials/calculate";
import {
  CREDENTIAL_GROUPS,
  CREDENTIALS_COPY,
  isCategoryGroup,
  type CredentialGroup,
  type CredentialRule,
  type CredentialsResult,
} from "@/app/lib/credentials/definitions";
import { fetchCredentialsData } from "@/app/lib/credentials/queries";
import {
  addExtraCredentialSchema,
  createPrintBatchSchema,
  createStaffMemberSchema,
  externalCredentialQuantitySchema,
  extraCredentialRefSchema,
  festivalOnlySchema,
  festivalStaffMemberSchema,
  printBatchRefSchema,
  saveCredentialRulesSchema,
  staffMemberRefSchema,
  updateExtraCredentialSchema,
  updateStaffMemberSchema,
  type AddExtraCredentialInput,
  type CreatePrintBatchInput,
  type CreateStaffMemberInput,
  type ExternalCredentialQuantityInput,
  type ExtraCredentialRefInput,
  type FestivalOnlyInput,
  type FestivalStaffMemberInput,
  type PrintBatchRefInput,
  type SaveCredentialRulesInput,
  type StaffMemberRefInput,
  type UpdateExtraCredentialInput,
  type UpdateStaffMemberInput,
} from "@/app/lib/credentials/schema";
import { loggableError } from "@/app/lib/errors/loggable-error";
import { IMPERSONATION_READ_ONLY_RESULT } from "@/app/lib/impersonation/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { isImpersonationReadOnlyError } from "@/db/write-guard";
import {
  credentialPrintBatches,
  credentialPrintBatchItems,
  festivalCredentialRules,
  festivalExternalCredentialOverrides,
  festivalExtraCredentials,
  festivals,
  festivalStaffMembers,
  staffMembers,
} from "@/db/schema";

/**
 * The credentials page's writes (docs/PLAN-credenciales.md §6.3). Admins and
 * festival admins alike; every write is scoped by the festival in the URL. Shaped like the volunteer admin's
 * actions: refusals inside a transaction throw a `Refusal`, which rolls it
 * back and becomes the returned message.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A refusal decided inside a transaction; rolls it back. */
class Refusal extends Error {}

const UNAUTHORIZED: CredentialsResult = {
  success: false,
  message: CREDENTIALS_COPY.unauthorized,
};

function refused(message: string): CredentialsResult {
  return { success: false, message };
}

function invalid(error: { issues: { message: string }[] }): CredentialsResult {
  return refused(error.issues[0]?.message ?? "Revisá los datos e intentá de nuevo.");
}

function failure(error: unknown, context: string, festivalId: number): CredentialsResult {
  if (error instanceof Refusal) return refused(error.message);
  if (isImpersonationReadOnlyError(error)) return IMPERSONATION_READ_ONLY_RESULT;
  console.error(context, { festivalId, ...loggableError(error) });
  return refused(CREDENTIALS_COPY.genericError);
}

/** Every festival's credentials page: a typed path names the route's folder. */
function revalidateCredentials() {
  revalidatePath("/(site)/dashboard/festivals/[id]/credentials", "layout");
}

/** Admins and festival admins, before reading any input. */
async function authorize() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { blocked: UNAUTHORIZED } as const;
  return { profile } as const;
}

async function assertFestival(tx: Tx, festivalId: number) {
  const [festival] = await tx
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) throw new Refusal(CREDENTIALS_COPY.festivalNotFound);
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/**
 * Upserts the festival's rule rows. A group whose quantity and naming mode
 * both equal the default loses its row, so "no row" keeps meaning "default".
 */
export async function saveCredentialRules(
  input: SaveCredentialRulesInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = saveCredentialRulesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, rules } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await assertFestival(tx, festivalId);
      const defaults: CredentialGroup[] = [];
      for (const group of CREDENTIAL_GROUPS) {
        const value = rules[group];
        const rule: CredentialRule = {
          quantity: value.quantity,
          namingMode: "namingMode" in value ? value.namingMode : "all_named",
        };
        if (isDefaultRule(group, rule)) {
          defaults.push(group);
          continue;
        }
        const namingMode = isCategoryGroup(group) ? rule.namingMode : null;
        await tx
          .insert(festivalCredentialRules)
          .values({
            festivalId,
            group,
            quantity: rule.quantity,
            namingMode,
            updatedByUserId: auth.profile.id,
          })
          .onConflictDoUpdate({
            target: [festivalCredentialRules.festivalId, festivalCredentialRules.group],
            set: {
              quantity: rule.quantity,
              namingMode,
              updatedByUserId: auth.profile.id,
              updatedAt: sql`now()`,
            },
          });
      }
      if (defaults.length > 0) {
        await tx
          .delete(festivalCredentialRules)
          .where(
            and(
              eq(festivalCredentialRules.festivalId, festivalId),
              inArray(festivalCredentialRules.group, defaults),
            ),
          );
      }
    });
  } catch (error) {
    return failure(error, "Error saving credential rules", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: "Reglas guardadas." };
}

/** Back to the code defaults: the festival's rule rows go. */
export async function resetCredentialRules(
  input: FestivalOnlyInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = festivalOnlySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await assertFestival(tx, festivalId);
      await tx
        .delete(festivalCredentialRules)
        .where(eq(festivalCredentialRules.festivalId, festivalId));
    });
  } catch (error) {
    return failure(error, "Error resetting credential rules", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: "Volvimos a los valores por defecto." };
}

/* ------------------------------------------------------------------ */
/* External participants                                               */
/* ------------------------------------------------------------------ */

const EXTERNAL_NOT_COUNTED =
  "Ese participante externo no tiene una reserva que se cuente en este festival. Actualizá la página.";

/**
 * Sets, or with `quantity: null` clears, one external participant's total
 * for the festival. Remembers how many stands it had, so the Equipo tab can
 * flag a later change. Refuses one with no counted reservation here.
 */
export async function setExternalCredentialQuantity(
  input: ExternalCredentialQuantityInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = externalCredentialQuantitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, externalParticipantId, quantity } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const data = await fetchCredentialsData(tx, festivalId, { concurrency: 1 });
      if (!data) throw new Refusal(CREDENTIALS_COPY.festivalNotFound);
      const holder = buildHolders(data, resolveRules(data.ruleRows)).holders.find(
        (entry) => entry.key === `external:${externalParticipantId}`,
      );
      if (!holder) throw new Refusal(EXTERNAL_NOT_COUNTED);
      const scope = and(
        eq(festivalExternalCredentialOverrides.festivalId, festivalId),
        eq(festivalExternalCredentialOverrides.externalParticipantId, externalParticipantId),
      );
      if (quantity === null) {
        await tx.delete(festivalExternalCredentialOverrides).where(scope);
        return;
      }
      await tx
        .insert(festivalExternalCredentialOverrides)
        .values({
          festivalId,
          externalParticipantId,
          quantity,
          standsAtOverride: holder.standCount,
          updatedByUserId: auth.profile.id,
        })
        .onConflictDoUpdate({
          target: [
            festivalExternalCredentialOverrides.festivalId,
            festivalExternalCredentialOverrides.externalParticipantId,
          ],
          set: {
            quantity,
            standsAtOverride: holder.standCount,
            updatedByUserId: auth.profile.id,
            updatedAt: sql`now()`,
          },
        });
    });
  } catch (error) {
    return failure(error, "Error saving an external credential quantity", festivalId);
  }

  revalidateCredentials();
  return {
    success: true,
    message:
      quantity === null
        ? "Volvió a la cantidad por espacio."
        : `Cantidad guardada: ${quantity}.`,
  };
}

/* ------------------------------------------------------------------ */
/* The Glitter team                                                    */
/* ------------------------------------------------------------------ */

const STAFF_NOT_FOUND = "No encontramos a esa persona del equipo. Actualizá la página.";
const STAFF_ARCHIVED =
  "Esa persona está archivada. Restaurala antes de sumarla a esta edición.";

async function lockStaffMember(tx: Tx, staffMemberId: number) {
  const [member] = await tx
    .select({ id: staffMembers.id, isActive: staffMembers.isActive })
    .from(staffMembers)
    .where(eq(staffMembers.id, staffMemberId))
    .for("update");
  if (!member) throw new Refusal(STAFF_NOT_FOUND);
  return member;
}

/** Adds someone to the shared roster, ticked for this festival unless told not to. */
export async function createStaffMember(
  input: CreateStaffMemberInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = createStaffMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, fullName, roleLabel, selectForFestival } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await assertFestival(tx, festivalId);
      const [member] = await tx
        .insert(staffMembers)
        .values({ fullName, roleLabel })
        .returning({ id: staffMembers.id });
      if (selectForFestival) {
        await tx
          .insert(festivalStaffMembers)
          .values({ festivalId, staffMemberId: member!.id });
      }
    });
  } catch (error) {
    return failure(error, "Error creating a staff member", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: `${fullName} se sumó al equipo.` };
}

/** Renames someone or changes their role, for every festival. */
export async function updateStaffMember(
  input: UpdateStaffMemberInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = updateStaffMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, staffMemberId, fullName, roleLabel } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await lockStaffMember(tx, staffMemberId);
      await tx
        .update(staffMembers)
        .set({ fullName, roleLabel, updatedAt: sql`now()` })
        .where(eq(staffMembers.id, staffMemberId));
    });
  } catch (error) {
    return failure(error, "Error updating a staff member", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: CREDENTIALS_COPY.saved };
}

async function setStaffActive(
  input: StaffMemberRefInput,
  isActive: boolean,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = staffMemberRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, staffMemberId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await lockStaffMember(tx, staffMemberId);
      await tx
        .update(staffMembers)
        .set({ isActive, updatedAt: sql`now()` })
        .where(eq(staffMembers.id, staffMemberId));
    });
  } catch (error) {
    return failure(error, "Error archiving or restoring a staff member", festivalId);
  }

  revalidateCredentials();
  return {
    success: true,
    message: isActive
      ? "La persona volvió a la lista del equipo."
      : "Archivada. Sigue en las ediciones donde ya estaba marcada.",
  };
}

/**
 * Archives someone: they leave the roster offered for new editions, but
 * stay selected where they already are. Rows are never deleted.
 */
export async function archiveStaffMember(
  input: StaffMemberRefInput,
): Promise<CredentialsResult> {
  return setStaffActive(input, false);
}

export async function restoreStaffMember(
  input: StaffMemberRefInput,
): Promise<CredentialsResult> {
  return setStaffActive(input, true);
}

/** Ticks or unticks one roster member for this festival. */
export async function setFestivalStaffMember(
  input: FestivalStaffMemberInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = festivalStaffMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, staffMemberId, selected } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await assertFestival(tx, festivalId);
      const member = await lockStaffMember(tx, staffMemberId);
      if (!selected) {
        await tx
          .delete(festivalStaffMembers)
          .where(
            and(
              eq(festivalStaffMembers.festivalId, festivalId),
              eq(festivalStaffMembers.staffMemberId, staffMemberId),
            ),
          );
        return;
      }
      if (!member.isActive) throw new Refusal(STAFF_ARCHIVED);
      await tx
        .insert(festivalStaffMembers)
        .values({ festivalId, staffMemberId })
        .onConflictDoNothing();
    });
  } catch (error) {
    return failure(error, "Error selecting a staff member", festivalId);
  }

  revalidateCredentials();
  return {
    success: true,
    message: selected ? "Marcada para esta edición." : "Ya no está en esta edición.",
  };
}

/* ------------------------------------------------------------------ */
/* One-off credentials                                                 */
/* ------------------------------------------------------------------ */

const EXTRA_NOT_FOUND = "No encontramos esa credencial. Actualizá la página.";
const EXTRA_NAMED_IS_ONE = "Una credencial con nombre es siempre una.";

async function lockExtra(tx: Tx, festivalId: number, extraCredentialId: number) {
  const [extra] = await tx
    .select({
      id: festivalExtraCredentials.id,
      name: festivalExtraCredentials.name,
      quantity: festivalExtraCredentials.quantity,
    })
    .from(festivalExtraCredentials)
    .where(
      and(
        eq(festivalExtraCredentials.id, extraCredentialId),
        eq(festivalExtraCredentials.festivalId, festivalId),
      ),
    )
    .for("update");
  if (!extra) throw new Refusal(EXTRA_NOT_FOUND);
  return extra;
}

/** A named person (one credential) or a labelled lot of unnamed ones. */
export async function addExtraCredential(
  input: AddExtraCredentialInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = addExtraCredentialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, extra } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await assertFestival(tx, festivalId);
      await tx.insert(festivalExtraCredentials).values(
        extra.kind === "named"
          ? { festivalId, name: extra.name, label: extra.label, quantity: 1 }
          : { festivalId, name: null, label: extra.label, quantity: extra.quantity },
      );
    });
  } catch (error) {
    return failure(error, "Error adding a one-off credential", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: "Credencial agregada." };
}

/**
 * Keeps the id, so raising "Prensa" from 6 to 8 reads "Faltan 2" rather than
 * 8 new. A named entry's name cannot change: it is what was printed.
 */
export async function updateExtraCredential(
  input: UpdateExtraCredentialInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = updateExtraCredentialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, extraCredentialId, label, quantity } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const extra = await lockExtra(tx, festivalId, extraCredentialId);
      if (extra.name != null && quantity !== undefined && quantity !== 1) {
        throw new Refusal(EXTRA_NAMED_IS_ONE);
      }
      await tx
        .update(festivalExtraCredentials)
        .set({
          label,
          quantity: extra.name != null ? 1 : (quantity ?? extra.quantity),
          updatedAt: sql`now()`,
        })
        .where(eq(festivalExtraCredentials.id, extraCredentialId));
    });
  } catch (error) {
    return failure(error, "Error updating a one-off credential", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: CREDENTIALS_COPY.saved };
}

/**
 * Removes an entry. One already sent to print stays in its batch and shows
 * as "Ya no corresponde"; the screen warns before calling this.
 */
export async function removeExtraCredential(
  input: ExtraCredentialRefInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = extraCredentialRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, extraCredentialId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await lockExtra(tx, festivalId, extraCredentialId);
      await tx
        .delete(festivalExtraCredentials)
        .where(eq(festivalExtraCredentials.id, extraCredentialId));
    });
  } catch (error) {
    return failure(error, "Error removing a one-off credential", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: "Credencial quitada." };
}

/* ------------------------------------------------------------------ */
/* Print batches                                                       */
/* ------------------------------------------------------------------ */

const NOT_A_HOLDER =
  "Alguien del lote ya no tiene credencial en este festival. Actualizá la página.";
const NOTHING_TO_PRINT = "No hay credenciales para marcar en este lote.";
const BATCH_NOT_FOUND = "No encontramos ese lote. Actualizá la página.";
const NOT_LATEST_BATCH = "Solo se puede deshacer el último lote enviado a imprenta.";

/**
 * Serialises batch writes per festival, so two admins cannot record the same
 * unit twice. Not the festival row lock: that one is the reservation flow's
 * throughput ceiling.
 */
async function lockFestivalBatches(tx: Tx, festivalId: number) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('credential_print_batches'), ${festivalId})`,
  );
}

function credentialCount(count: number) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? "credencial" : "credenciales"}`;
}

/**
 * "Marcar como enviadas a imprenta". The client names holders; the counts
 * are recomputed here from live data under the festival's batch lock, so a
 * stale screen or a second admin cannot record a unit twice. Each item
 * stores only what this batch sends (§6.3).
 */
export async function createCredentialPrintBatch(
  input: CreatePrintBatchInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = createPrintBatchSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, holderKeys, note } = parsed.data;

  let sent = 0;
  try {
    await db.transaction(async (tx) => {
      await lockFestivalBatches(tx, festivalId);
      const data = await fetchCredentialsData(tx, festivalId, { concurrency: 1 });
      if (!data) throw new Refusal(CREDENTIALS_COPY.festivalNotFound);
      const rules = resolveRules(data.ruleRows);
      const holders = applyPrintState(buildHolders(data, rules).holders, data.batches);
      const byKey = new Map(
        holders.filter((holder) => !holder.stale).map((holder) => [holder.key, holder]),
      );

      const items: (typeof credentialPrintBatchItems.$inferInsert)[] = [];
      for (const key of holderKeys) {
        const holder = byKey.get(key);
        if (!holder || !isPrintable(holder)) throw new Refusal(NOT_A_HOLDER);
        for (const plan of batchItemsFor(holder)) {
          items.push({
            batchId: 0,
            festivalId,
            unitKey: plan.unit.key,
            group: plan.unit.group,
            userId: plan.unit.userId,
            printedName: plan.unit.printedName,
            detail: plan.unit.detail,
            namedCount: plan.named,
            unnamedCount: plan.unnamed,
            isReprint: plan.isReprint,
          });
          sent += plan.named + plan.unnamed;
        }
      }
      if (items.length === 0) throw new Refusal(NOTHING_TO_PRINT);

      const [batch] = await tx
        .insert(credentialPrintBatches)
        .values({ festivalId, note, rules, createdByUserId: auth.profile.id })
        .returning({ id: credentialPrintBatches.id });
      await tx
        .insert(credentialPrintBatchItems)
        .values(items.map((item) => ({ ...item, batchId: batch!.id })));
    });
  } catch (error) {
    return failure(error, "Error creating a credential print batch", festivalId);
  }

  revalidateCredentials();
  return {
    success: true,
    message: `Marcaste ${credentialCount(sent)} como enviadas a imprenta.`,
  };
}

/**
 * Undoes a mistake: removes the festival's most recent batch, and only that
 * one. Admins only.
 */
export async function deleteCredentialPrintBatch(
  input: PrintBatchRefInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  if (auth.profile.role !== "admin") return refused(CREDENTIALS_COPY.adminOnly);
  const parsed = printBatchRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, batchId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await lockFestivalBatches(tx, festivalId);
      const [latest] = await tx
        .select({ id: credentialPrintBatches.id })
        .from(credentialPrintBatches)
        .where(eq(credentialPrintBatches.festivalId, festivalId))
        .orderBy(desc(credentialPrintBatches.createdAt), desc(credentialPrintBatches.id))
        .limit(1);
      if (!latest) throw new Refusal(BATCH_NOT_FOUND);
      if (latest.id !== batchId) {
        const [exists] = await tx
          .select({ id: credentialPrintBatches.id })
          .from(credentialPrintBatches)
          .where(
            and(
              eq(credentialPrintBatches.id, batchId),
              eq(credentialPrintBatches.festivalId, festivalId),
            ),
          );
        throw new Refusal(exists ? NOT_LATEST_BATCH : BATCH_NOT_FOUND);
      }
      await tx
        .delete(credentialPrintBatches)
        .where(
          and(
            eq(credentialPrintBatches.id, batchId),
            eq(credentialPrintBatches.festivalId, festivalId),
          ),
        );
    });
  } catch (error) {
    return failure(error, "Error deleting a credential print batch", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: "Deshiciste el último envío a imprenta." };
}
