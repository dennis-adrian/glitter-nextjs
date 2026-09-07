"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasPromoRedemptions } from "@/app/lib/programs/promo-code-queries";
import {
  isValidPromoCodeFormat,
  normalizePromoCode,
  PROMO_INTERNAL_NOTES_MAX_LENGTH,
  PROMO_PARTNER_NAME_MAX_LENGTH,
} from "@/app/lib/programs/promo-codes";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programPromoCodeEvents,
  programPromoCodes,
  programs,
} from "@/db/schema";

const promoCodeAdminSchema = z
  .object({
    programId: z.number().int().positive(),
    code: z.string().trim().min(1).max(64),
    partnerName: z.string().trim().min(1).max(PROMO_PARTNER_NAME_MAX_LENGTH),
    discountPercent: z.number().int().min(1).max(100),
    startsAt: z.coerce.date().nullish(),
    expiresAt: z.coerce.date().nullish(),
    maxUses: z.number().int().positive().nullish(),
    isActive: z.boolean(),
    internalNotes: z
      .string()
      .trim()
      .max(PROMO_INTERNAL_NOTES_MAX_LENGTH)
      .nullish(),
  })
  .refine(
    (value) =>
      !value.startsAt || !value.expiresAt || value.expiresAt >= value.startsAt,
    { message: "La fecha final no puede ser anterior a la inicial" },
  );

export type PromoCodeAdminInput = z.input<typeof promoCodeAdminSchema>;

function revalidatePromoCodes(programId: number) {
  revalidatePath("/dashboard/programs", "layout");
  revalidatePath("/programs", "layout");
  revalidatePath(`/dashboard/programs/${programId}`);
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

export async function createProgramPromoCode(input: PromoCodeAdminInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = promoCodeAdminSchema.safeParse(input);
  if (!parsed.success || !isValidPromoCodeFormat(parsed.data.code)) {
    return {
      success: false,
      message: parsed.success
        ? "Usa 3–32 letras, números, guiones o guiones bajos"
        : (parsed.error.issues[0]?.message ?? "Datos inválidos"),
    } as const;
  }

  const data = parsed.data;
  const program = await db.query.programs.findFirst({
    where: eq(programs.id, data.programId),
    columns: { id: true },
  });
  if (!program) {
    return { success: false, message: "Programa no encontrado" } as const;
  }

  try {
    const promoCode = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(programPromoCodes)
        .values({
          programId: data.programId,
          code: normalizePromoCode(data.code),
          partnerName: data.partnerName,
          discountPercent: data.discountPercent,
          startsAt: data.startsAt ?? null,
          expiresAt: data.expiresAt ?? null,
          maxUses: data.maxUses ?? null,
          isActive: data.isActive,
          internalNotes: data.internalNotes?.trim() || null,
          createdByUserId: profile.id,
        })
        .returning();

      await tx.insert(programPromoCodeEvents).values({
        promoCodeId: created.id,
        actorUserId: profile.id,
        eventType: "created",
        changes: {
          code: created.code,
          partnerName: created.partnerName,
          discountPercent: created.discountPercent,
          isActive: created.isActive,
        },
      });

      return created;
    });

    revalidatePromoCodes(data.programId);
    return {
      success: true,
      message: "Código creado",
      promoCodeId: promoCode.id,
    } as const;
  } catch (error) {
    return {
      success: false,
      message:
        databaseCode(error) === "23505"
          ? "Ese código ya existe en el programa"
          : "No se pudo crear el código",
    } as const;
  }
}

export async function updateProgramPromoCode(
  promoCodeId: number,
  input: PromoCodeAdminInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = promoCodeAdminSchema.safeParse(input);
  if (!parsed.success || !isValidPromoCodeFormat(parsed.data.code)) {
    return {
      success: false,
      message: parsed.success
        ? "Usa 3–32 letras, números, guiones o guiones bajos"
        : (parsed.error.issues[0]?.message ?? "Datos inválidos"),
    } as const;
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(programPromoCodes)
        .where(eq(programPromoCodes.id, promoCodeId))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "missing" as const };

      const data = parsed.data;
      const redeemed = await hasPromoRedemptions(tx, promoCodeId);
      const normalizedCode = normalizePromoCode(data.code);
      if (
        redeemed &&
        (existing.programId !== data.programId ||
          existing.code !== normalizedCode ||
          existing.partnerName !== data.partnerName ||
          existing.discountPercent !== data.discountPercent)
      ) {
        return {
          kind: "immutable" as const,
          programId: existing.programId,
        };
      }

      const changes = {
        programId: data.programId,
        code: normalizedCode,
        partnerName: data.partnerName,
        discountPercent: data.discountPercent,
        startsAt: data.startsAt ?? null,
        expiresAt: data.expiresAt ?? null,
        maxUses: data.maxUses ?? null,
        isActive: data.isActive,
        internalNotes: data.internalNotes?.trim() || null,
      };
      await tx
        .update(programPromoCodes)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(programPromoCodes.id, promoCodeId));

      await tx.insert(programPromoCodeEvents).values({
        promoCodeId,
        actorUserId: profile.id,
        eventType:
          existing.isActive === data.isActive
            ? "updated"
            : data.isActive
              ? "activated"
              : "deactivated",
        changes,
      });

      return {
        kind: "updated" as const,
        programId: data.programId,
        previousProgramId: existing.programId,
      };
    });

    if (outcome.kind === "missing") {
      return { success: false, message: "Código no encontrado" } as const;
    }
    if (outcome.kind === "immutable") {
      return {
        success: false,
        message:
          "Este código ya fue usado. Crea otro para cambiar programa, código, aliado o porcentaje.",
      } as const;
    }

    revalidatePromoCodes(outcome.programId);
    if (outcome.previousProgramId !== outcome.programId) {
      revalidatePromoCodes(outcome.previousProgramId);
    }
    return { success: true, message: "Código actualizado" } as const;
  } catch (error) {
    return {
      success: false,
      message:
        databaseCode(error) === "23505"
          ? "Ese código ya existe en el programa"
          : "No se pudo actualizar el código",
    } as const;
  }
}
