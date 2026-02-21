"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { discountCodes, invoices } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NewDiscountCode } from "./definitions";

export async function fetchDiscountCodes() {
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
  try {
    await db.insert(discountCodes).values(data);
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
  try {
    await db
      .update(discountCodes)
      .set({ ...data, updatedAt: new Date() })
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
  festivalId,
}: {
  code: string;
  invoiceId: number;
  festivalId: number;
}) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) {
    return { success: false, message: "Usuario no autenticado." };
  }

  try {
    return await db.transaction(async (tx) => {
      // Fetch invoice to validate it has no discount yet
      const [invoice] = await tx
        .select({
          id: invoices.id,
          originalAmount: invoices.originalAmount,
          discountCodeId: invoices.discountCodeId,
          status: invoices.status,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!invoice) {
        return { success: false, message: "Factura no encontrada." };
      }
      if (invoice.status !== "pending") {
        return {
          success: false,
          message: "No se puede aplicar un descuento a una factura ya pagada.",
        };
      }
      if (invoice.discountCodeId !== null) {
        return {
          success: false,
          message: "Esta reserva ya tiene un código de descuento aplicado.",
        };
      }

      // Lock and fetch the discount code row
      const [discountCode] = await tx
        .select()
        .from(discountCodes)
        .where(
          and(
            eq(sql`lower(${discountCodes.code})`, code.toLowerCase()),
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

      // Check expiration
      if (discountCode.expiresAt < new Date()) {
        return { success: false, message: "El código de descuento ha expirado." };
      }

      // Check usage limit
      if (
        discountCode.maxUses !== null &&
        discountCode.currentUses >= discountCode.maxUses
      ) {
        return {
          success: false,
          message: "El código de descuento ha alcanzado su límite de uso.",
        };
      }

      // Check festival scope
      if (
        discountCode.festivalId !== null &&
        discountCode.festivalId !== festivalId
      ) {
        return {
          success: false,
          message: "El código de descuento no es válido para este festival.",
        };
      }

      // Check user scope
      if (
        discountCode.userId !== null &&
        discountCode.userId !== currentUser.id
      ) {
        return {
          success: false,
          message: "El código de descuento no es válido para este usuario.",
        };
      }

      // Compute discount amount
      const originalAmount = invoice.originalAmount;
      let discountAmount: number;
      if (discountCode.discountUnit === "percentage") {
        discountAmount = originalAmount * (discountCode.discountValue / 100);
      } else {
        discountAmount = discountCode.discountValue;
      }
      const newAmount = Math.max(0, originalAmount - discountAmount);

      // Apply discount to invoice
      await tx
        .update(invoices)
        .set({
          amount: newAmount,
          discountAmount,
          discountCodeId: discountCode.id,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));

      // Increment usage count
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
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Ocurrió un error al aplicar el código de descuento.",
    };
  }
}
