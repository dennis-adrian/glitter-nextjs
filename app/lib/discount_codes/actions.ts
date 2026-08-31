"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { discountCodes, invoices, standReservations } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NewDiscountCode } from "./definitions";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import {
  lockFestivalRow,
  lockFestivalTermsDocument,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";
import {
  applyDiscountSchema,
  parseUnknown,
} from "@/app/lib/reservations/schemas";

export async function fetchDiscountCodes() {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) return [];
  try {
    return await db.query.discountCodes.findMany({
      orderBy: [asc(discountCodes.createdAt)],
      with: {
        festival: true,
        user: true,
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function createDiscountCode(data: NewDiscountCode) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }

  const normalizedCode = data.code.trim().toLowerCase();
  try {
    await db.insert(discountCodes).values({ ...data, code: normalizedCode });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo crear el código de descuento.",
    };
  }

  revalidatePath("/dashboard/discount_codes");
  return {
    success: true,
    message: "Código de descuento creado correctamente.",
  };
}

export async function updateDiscountCode(
  id: number,
  data: Partial<NewDiscountCode>,
) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const normalizedData =
    data.code !== undefined
      ? { ...data, code: data.code.trim().toLowerCase() }
      : data;
  try {
    await db
      .update(discountCodes)
      .set({ ...normalizedData, updatedAt: new Date() })
      .where(eq(discountCodes.id, id));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo actualizar el código de descuento.",
    };
  }

  revalidatePath("/dashboard/discount_codes");
  return {
    success: true,
    message: "Código de descuento actualizado correctamente.",
  };
}

export async function fetchDiscountCode(id: number) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) return null;
  try {
    return await db.query.discountCodes.findFirst({
      where: eq(discountCodes.id, id),
      with: {
        festival: true,
        user: true,
      },
    });
  } catch (error) {
    console.error(error);
    return null;
  }
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
    return { success: false, message: "Código de descuento inválido o inactivo." };
  }

  const rateLimitUnavailable = Symbol("discountApplyRateLimitUnavailable");
  const allowed = await consumeActionRateLimit({
    key: `discount-apply:user:${currentUser.id}`,
    limit: 15,
    windowMs: 60_000,
  }).catch(() => rateLimitUnavailable);
  if (allowed === rateLimitUnavailable) {
    return { success: false, message: "Código de descuento inválido o inactivo." };
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

      if (!invoicePreview) {
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
        return { success: false, message: "No autorizado para esta factura." };
      }

      if (invoice.status !== "pending") {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
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

      if (
        discountCode.userId !== null &&
        discountCode.userId !== invoice.userId
      ) {
        return {
          success: false,
          message: "Código de descuento inválido o inactivo.",
        };
      }

      const originalAmount = invoice.originalAmount;
      const rawDiscount =
        discountCode.discountUnit === "percentage"
          ? originalAmount * (discountCode.discountValue / 100)
          : discountCode.discountValue;
      const discountAmount =
        Math.round(Math.min(originalAmount, Math.max(0, rawDiscount)) * 100) /
        100;
      const newAmount = Math.round((originalAmount - discountAmount) * 100) / 100;

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
