"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  discountCodes,
  discountCodeUsers,
  invoiceCreditAllocations,
  invoices,
  standReservations,
  users,
} from "@/db/schema";
import { and, asc, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type {
  DiscountCodeUser,
  DiscountCodeWithRelations,
} from "./definitions";
import {
  discountCodeInputSchema,
  setDiscountCodeActiveSchema,
  type DiscountCodeInput,
} from "./schemas";
import { isValidDiscountCodeFormat, normalizeDiscountCode } from "./utils";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import {
  lockFestivalRow,
  lockFestivalTermsDocument,
  lockCreditAccountRows,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";
import {
  applyDiscountSchema,
  parseUnknown,
} from "@/app/lib/reservations/schemas";
import { userSearchCondition } from "@/app/lib/users/search-condition";
import { getUserName } from "@/app/lib/users/utils";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const LIST_PATH = "/dashboard/discount_codes";
const FORMAT_MESSAGE =
  "Usá solo letras, números, guiones o guiones bajos en el código.";

const userColumns = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  email: true,
  imageUrl: true,
} as const;

function byName(a: DiscountCodeUser, b: DiscountCodeUser) {
  return (getUserName(a) || a.email).localeCompare(
    getUserName(b) || b.email,
    "es",
  );
}

async function findDiscountCodes(
  where?: SQL,
): Promise<DiscountCodeWithRelations[]> {
  const rows = await db.query.discountCodes.findMany({
    where,
    orderBy: [desc(discountCodes.createdAt), desc(discountCodes.id)],
    with: {
      festival: { columns: { id: true, name: true } },
      users: { columns: {}, with: { user: { columns: userColumns } } },
    },
  });
  return rows.map(({ users: assigned, ...code }) => ({
    ...code,
    assignedUsers: assigned.map(({ user }) => user).sort(byName),
  }));
}

export async function fetchDiscountCodes() {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) return [];
  try {
    return await findDiscountCodes();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchDiscountCode(id: number) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) return null;
  try {
    const [code] = await findDiscountCodes(eq(discountCodes.id, id));
    return code ?? null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

/** People an admin can reserve a code for, found by name, email or #id. */
export async function searchDiscountCodeUsers(
  query: unknown,
): Promise<DiscountCodeUser[]> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) return [];
  if (typeof query !== "string") return [];
  const term = query.trim();
  if (term.length < 2 || term.length > 100) return [];

  try {
    return await db
      .select({
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        imageUrl: users.imageUrl,
      })
      .from(users)
      .where(userSearchCondition(term))
      .orderBy(asc(users.displayName), asc(users.id))
      .limit(8);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if (
    "cause" in error &&
    error.cause &&
    typeof error.cause === "object" &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
  ) {
    return error.cause.code;
  }
  return undefined;
}

function writeErrorMessage(error: unknown, fallback: string) {
  switch (databaseCode(error)) {
    case "23505":
      return "Ya existe un código de descuento con ese nombre.";
    case "23503":
      return "El festival o alguno de los usuarios elegidos ya no existe.";
    default:
      console.error(error);
      return fallback;
  }
}

function parseInput(input: unknown) {
  const parsed = discountCodeInputSchema.safeParse(input);
  if (parsed.success) return parsed;
  // The form checks the same rules with its own wording; a message reaches
  // here only from the refinements, or from a payload the form never sends.
  const issue = parsed.error.issues[0];
  return {
    success: false as const,
    message:
      issue?.code === "custom" ? issue.message : "Datos de código inválidos.",
  };
}

function codeValues(data: ReturnType<typeof discountCodeInputSchema.parse>) {
  return {
    code: normalizeDiscountCode(data.code),
    discountUnit: data.discountUnit,
    discountValue: data.discountValue,
    maxUses: data.maxUses,
    festivalId: data.festivalId,
    audience: data.audience,
    expiresAt: data.expiresAt,
    isActive: data.isActive,
  };
}

/**
 * Makes the code's stored users exactly the chosen ones. An `everyone` code
 * keeps none, so switching a code back to public leaves no stale list behind
 * to resurface if it is ever restricted again.
 */
async function replaceAssignedUsers(
  tx: DbTx,
  discountCodeId: number,
  audience: DiscountCodeWithRelations["audience"],
  userIds: number[],
) {
  const keep = audience === "selected_users" ? [...new Set(userIds)] : [];
  await tx
    .delete(discountCodeUsers)
    .where(
      keep.length > 0
        ? and(
            eq(discountCodeUsers.discountCodeId, discountCodeId),
            notInArray(discountCodeUsers.userId, keep),
          )
        : eq(discountCodeUsers.discountCodeId, discountCodeId),
    );
  if (keep.length === 0) return;
  await tx
    .insert(discountCodeUsers)
    .values(keep.map((userId) => ({ discountCodeId, userId })))
    .onConflictDoNothing();
}

export async function createDiscountCode(input: DiscountCodeInput) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }

  const parsed = parseInput(input);
  if (!parsed.success) return { success: false, message: parsed.message };
  const data = parsed.data;
  if (!isValidDiscountCodeFormat(data.code)) {
    return { success: false, message: FORMAT_MESSAGE };
  }
  if (data.expiresAt <= new Date()) {
    return {
      success: false,
      message: "La fecha de vencimiento tiene que ser futura.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(discountCodes)
        .values(codeValues(data))
        .returning({ id: discountCodes.id });
      await replaceAssignedUsers(tx, created.id, data.audience, data.userIds);
    });
  } catch (error) {
    return {
      success: false,
      message: writeErrorMessage(
        error,
        "No se pudo crear el código de descuento.",
      ),
    };
  }

  revalidatePath(LIST_PATH);
  return {
    success: true,
    message: "Código de descuento creado correctamente.",
  };
}

export async function updateDiscountCode(id: number, input: DiscountCodeInput) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }

  const parsed = parseInput(input);
  if (!parsed.success) return { success: false, message: parsed.message };
  const data = parsed.data;
  const values = codeValues(data);

  try {
    const result = await db.transaction(async (tx) => {
      // Locked so a participant applying the code meanwhile cannot slip a
      // use past the limit checked below.
      const [existing] = await tx
        .select({
          code: discountCodes.code,
          currentUses: discountCodes.currentUses,
        })
        .from(discountCodes)
        .where(eq(discountCodes.id, id))
        .limit(1)
        .for("update");
      if (!existing) {
        return { success: false, message: "El código de descuento no existe." };
      }
      // A code saved before the format existed may keep its name.
      if (
        values.code !== existing.code &&
        !isValidDiscountCodeFormat(data.code)
      ) {
        return { success: false, message: FORMAT_MESSAGE };
      }
      if (values.maxUses !== null && values.maxUses < existing.currentUses) {
        return {
          success: false,
          message: `El límite de usos no puede ser menor a los ${existing.currentUses} usos que ya tiene.`,
        };
      }

      await tx
        .update(discountCodes)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(discountCodes.id, id));
      await replaceAssignedUsers(tx, id, data.audience, data.userIds);
      return {
        success: true,
        message: "Código de descuento actualizado correctamente.",
      };
    });
    if (!result.success) return result;
  } catch (error) {
    return {
      success: false,
      message: writeErrorMessage(
        error,
        "No se pudo actualizar el código de descuento.",
      ),
    };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}/edit`);
  return {
    success: true,
    message: "Código de descuento actualizado correctamente.",
  };
}

/** The list's quick switch, without opening the whole form. */
export async function setDiscountCodeActive(input: unknown) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const parsed = setDiscountCodeActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos de código inválidos." };
  }

  try {
    const updated = await db
      .update(discountCodes)
      .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
      .where(eq(discountCodes.id, parsed.data.id))
      .returning({ id: discountCodes.id });
    if (updated.length === 0) {
      return { success: false, message: "El código de descuento no existe." };
    }
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo actualizar el código de descuento.",
    };
  }

  revalidatePath(LIST_PATH);
  return {
    success: true,
    message: parsed.data.isActive
      ? "Código de descuento activado."
      : "Código de descuento desactivado.",
  };
}

export async function validateAndApplyDiscountCode({
  code,
  invoiceId,
}: {
  code: string;
  invoiceId: number;
}) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) {
    return { success: false, message: "Usuario no autenticado." };
  }

  const parsed = parseUnknown(applyDiscountSchema, { code, invoiceId });
  if (!parsed.success) {
    return {
      success: false,
      message: "Código de descuento inválido o inactivo.",
    };
  }

  const rateLimitUnavailable = Symbol("discountApplyRateLimitUnavailable");
  const allowed = await consumeActionRateLimit({
    key: `discount-apply:user:${currentUser.id}`,
    limit: 15,
    windowMs: 60_000,
  }).catch(() => rateLimitUnavailable);
  if (allowed === rateLimitUnavailable) {
    return {
      success: false,
      message: "Código de descuento inválido o inactivo.",
    };
  }
  if (!allowed) {
    return {
      success: false,
      message: "Demasiados intentos. Esperá un minuto e intentá de nuevo.",
    };
  }

  const normalizedCode = parsed.data.code.trim().toLowerCase();

  try {
    const result = await db.transaction(async (tx) => {
      const [invoicePreview] = await tx
        .select({
          id: invoices.id,
          userId: invoices.userId,
          festivalId: standReservations.festivalId,
          standId: standReservations.standId,
        })
        .from(invoices)
        .innerJoin(
          standReservations,
          eq(standReservations.id, invoices.reservationId),
        )
        .where(eq(invoices.id, parsed.data.invoiceId))
        .limit(1);

      // Ownership before the festival-wide locks: someone else's invoice id
      // must not hold up the festival's reservation writes, and gets the same
      // answer as a missing invoice.
      if (
        !invoicePreview ||
        (invoicePreview.userId !== currentUser.id &&
          currentUser.role !== "admin")
      ) {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      await lockParticipants(tx, invoicePreview.festivalId, [
        invoicePreview.userId,
      ]);
      await lockFestivalRow(tx, invoicePreview.festivalId);
      await lockFestivalTermsDocument(tx);
      await lockParticipantEligibilityRows(tx, invoicePreview.festivalId, [
        invoicePreview.userId,
      ]);
      await lockCreditAccountRows(tx, [invoicePreview.userId]);
      await lockStandRows(tx, [invoicePreview.standId]);

      const [invoice] = await tx
        .select({
          id: invoices.id,
          originalAmount: invoices.originalAmount,
          discountAmount: invoices.discountAmount,
          amount: invoices.amount,
          discountCodeId: invoices.discountCodeId,
          status: invoices.status,
          userId: invoices.userId,
          festivalId: standReservations.festivalId,
        })
        .from(invoices)
        .innerJoin(
          standReservations,
          eq(standReservations.id, invoices.reservationId),
        )
        .where(eq(invoices.id, parsed.data.invoiceId))
        .limit(1)
        .for("update");

      if (!invoice) {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      if (invoice.userId !== currentUser.id && currentUser.role !== "admin") {
        return { success: false, message: "No autorizado para este cobro." };
      }

      if (invoice.status !== "pending") {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }
      const creditAllocations = await tx
        .select({ id: invoiceCreditAllocations.id })
        .from(invoiceCreditAllocations)
        .where(eq(invoiceCreditAllocations.invoiceId, invoice.id))
        .for("update");
      if (creditAllocations.length > 0) {
        return {
          success: false,
          message: "No podés aplicar un descuento después de usar créditos.",
        };
      }
      if (invoice.discountCodeId !== null) {
        const already = await tx.query.discountCodes.findFirst({
          where: eq(discountCodes.id, invoice.discountCodeId),
        });
        if (already && already.code === normalizedCode) {
          return {
            success: true,
            message: "Código de descuento aplicado correctamente.",
            discountAmount: invoice.discountAmount,
            newAmount: invoice.amount,
          };
        }
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      const [discountCode] = await tx
        .select()
        .from(discountCodes)
        .where(
          and(
            eq(sql`lower(${discountCodes.code})`, normalizedCode),
            eq(discountCodes.isActive, true),
          ),
        )
        .limit(1)
        .for("update");

      if (!discountCode) {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      if (discountCode.expiresAt < new Date()) {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      if (
        discountCode.maxUses !== null &&
        discountCode.currentUses >= discountCode.maxUses
      ) {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      if (
        discountCode.festivalId !== null &&
        discountCode.festivalId !== invoice.festivalId
      ) {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      if (discountCode.audience === "selected_users") {
        // Checked against the invoice's owner, not the caller, so an admin
        // applying a code on someone's behalf is held to the same list.
        const [assigned] = await tx
          .select({ id: discountCodeUsers.id })
          .from(discountCodeUsers)
          .where(
            and(
              eq(discountCodeUsers.discountCodeId, discountCode.id),
              eq(discountCodeUsers.userId, invoice.userId),
            ),
          )
          .limit(1);
        if (!assigned) {
          return {
            success: false,
            message: "Código de descuento inválido o inactivo.",
          };
        }
      }

      const originalAmount = invoice.originalAmount;
      const rawDiscount =
        discountCode.discountUnit === "percentage"
          ? originalAmount * (discountCode.discountValue / 100)
          : discountCode.discountValue;
      const discountAmount =
        Math.round(Math.min(originalAmount, Math.max(0, rawDiscount)) * 100) /
        100;
      const newAmount =
        Math.round((originalAmount - discountAmount) * 100) / 100;

      await tx
        .update(invoices)
        .set({
          amount: newAmount,
          discountAmount,
          discountCodeId: discountCode.id,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      await tx
        .update(discountCodes)
        .set({
          currentUses: discountCode.currentUses + 1,
          updatedAt: new Date(),
        })
        .where(eq(discountCodes.id, discountCode.id));

      return {
        success: true,
        message: "Código de descuento aplicado correctamente.",
        discountAmount,
        newAmount,
      };
    });

    if (result.success) {
      revalidatePath("/dashboard/festivals/[id]/payments", "page");
    }

    return result;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Ocurrió un error al aplicar el código de descuento.",
    };
  }
}
