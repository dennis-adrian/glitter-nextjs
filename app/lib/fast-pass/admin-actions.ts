"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  type SettingsAllocationBlocker,
  validateSettingsAgainstUsage,
} from "@/app/lib/fast-pass/availability";
import {
  requireFastPassFestivalDateAdmin,
  requireFastPassPosOperatorAdmin,
  requireFastPassSettingsAdmin,
} from "@/app/lib/fast-pass/admin-auth";
import { fetchDayAvailabilityInTx } from "@/app/lib/fast-pass/inventory-queries";
import {
  generateAccessToken,
  hashAccessToken,
} from "@/app/lib/fast-pass/tokens";
import { db } from "@/db";
import {
  fastPassDaySettings,
  fastPassEvents,
  fastPassNotificationRecipients,
  fastPassPosOperators,
  festivalDates,
} from "@/db/schema";

const SETTINGS_BLOCKER_LABELS: Record<SettingsAllocationBlocker, string> = {
  invalid_limits: "Los límites deben ser números positivos",
  allocations_exceed_totals:
    "Las asignaciones por canal superan el inventario total",
  paid_limit_below_usage:
    "El inventario pagado no puede ser menor que las ventas actuales",
  priority_limit_below_usage:
    "La capacidad prioritaria no puede ser menor que el uso actual",
  online_paid_below_usage:
    "La asignación online pagada no puede ser menor que el uso actual",
  on_site_paid_below_usage:
    "La asignación en sitio pagada no puede ser menor que el uso actual",
  online_priority_below_usage:
    "La asignación online prioritaria no puede ser menor que el uso actual",
  on_site_priority_below_usage:
    "La asignación en sitio prioritaria no puede ser menor que el uso actual",
};

const daySettingsSchema = z
  .object({
    offeringEnabled: z.boolean(),
    onlineSalesEnabled: z.boolean(),
    onSiteSalesEnabled: z.boolean(),
    price: z.number().positive(),
    salesStartAt: z.coerce.date().nullish(),
    salesEndAt: z.coerce.date().nullish(),
    paidInventoryLimit: z.number().int().positive(),
    priorityCapacityLimit: z.number().int().positive(),
    onlinePaidAllocation: z.number().int().min(0),
    onSitePaidAllocation: z.number().int().min(0),
    onlinePriorityAllocation: z.number().int().min(0),
    onSitePriorityAllocation: z.number().int().min(0),
    maxPaidPassesPerPurchase: z.number().int().positive().max(50),
    bankQrImageUrl: z
      .string()
      .trim()
      .url()
      .max(2000)
      .nullish()
      .or(z.literal("")),
    onSiteBankQrEnabled: z.boolean(),
    onSiteCashEnabled: z.boolean(),
    onSiteProofRequired: z.boolean(),
    onSiteVisitorDetailsRequired: z.boolean(),
    notifyOnSale: z.boolean(),
    notifyOnCancellation: z.boolean(),
    notificationEmails: z
      .array(z.string().trim().email().max(200))
      .max(20)
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.onSiteBankQrEnabled && !data.bankQrImageUrl?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["bankQrImageUrl"],
        message: "Agrega la imagen del QR bancario",
      });
    }
  });

export type FastPassDaySettingsInput = z.input<typeof daySettingsSchema>;

function blankToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** The fast-pass route is keyed by festival id, not by festival date id. */
async function revalidateFastPass(festivalDateId: number) {
  try {
    revalidatePath("/dashboard/festivals", "layout");

    const [date] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(festivalDates)
      .where(eq(festivalDates.id, festivalDateId))
      .limit(1);

    if (date) {
      revalidatePath(
        `/dashboard/festivals/${date.festivalId}/fast-pass`,
        "layout",
      );
    }
  } catch (error) {
    console.error("FastPass cache revalidation failed", {
      festivalDateId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
}

async function syncNotificationRecipients(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  settingsId: number,
  emails: string[],
) {
  await tx
    .delete(fastPassNotificationRecipients)
    .where(eq(fastPassNotificationRecipients.settingsId, settingsId));

  const normalized = [
    ...new Set(emails.map((email) => email.trim().toLowerCase())),
  ].filter(Boolean);

  if (normalized.length === 0) return;

  await tx.insert(fastPassNotificationRecipients).values(
    normalized.map((email) => ({
      settingsId,
      email,
    })),
  );
}

/**
 * Normalize values for equivalence checks so Dates and plain objects/arrays
 * compare by content, not reference identity. Audit output still stores the
 * original from/to values.
 */
function normalizeSettingsValue(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(normalizeSettingsValue));
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, normalizeSettingsValue(nested)]);
    return JSON.stringify(Object.fromEntries(entries));
  }
  return value;
}

function settingsDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (normalizeSettingsValue(from) !== normalizeSettingsValue(to)) {
      changes[key] = { from, to };
    }
  }
  return changes;
}

export async function upsertDaySettings(
  festivalDateId: number,
  input: FastPassDaySettingsInput,
) {
  const admin = await requireFastPassFestivalDateAdmin(festivalDateId);
  if (!admin) return { success: false, message: "No autorizado" } as const;

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const parsed = daySettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const data = parsed.data;
  if (
    data.onlinePaidAllocation + data.onSitePaidAllocation >
      data.paidInventoryLimit ||
    data.onlinePriorityAllocation + data.onSitePriorityAllocation >
      data.priorityCapacityLimit
  ) {
    return {
      success: false,
      message: SETTINGS_BLOCKER_LABELS.allocations_exceed_totals,
    } as const;
  }
  if (
    data.salesStartAt &&
    data.salesEndAt &&
    data.salesEndAt < data.salesStartAt
  ) {
    return {
      success: false,
      message: "La fecha de fin de ventas no puede ser anterior al inicio",
    } as const;
  }

  if (
    data.onSiteSalesEnabled &&
    !data.onSiteBankQrEnabled &&
    !data.onSiteCashEnabled
  ) {
    return {
      success: false,
      message: "Habilita al menos un método de pago en sitio",
    } as const;
  }

  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(fastPassDaySettings)
        .where(eq(fastPassDaySettings.festivalDateId, festivalDateId))
        .for("update")
        .limit(1);

      const proposed = {
        paidInventoryLimit: data.paidInventoryLimit,
        priorityCapacityLimit: data.priorityCapacityLimit,
        onlinePaidAllocation: data.onlinePaidAllocation,
        onSitePaidAllocation: data.onSitePaidAllocation,
        onlinePriorityAllocation: data.onlinePriorityAllocation,
        onSitePriorityAllocation: data.onSitePriorityAllocation,
      };

      if (existing) {
        const { availability } = await fetchDayAvailabilityInTx(
          tx,
          existing,
          now,
        );
        const check = validateSettingsAgainstUsage(
          proposed,
          availability.usage,
        );
        if (!check.allowed) {
          return {
            kind: "error" as const,
            message: SETTINGS_BLOCKER_LABELS[check.blocker],
          };
        }

        const before = { ...existing };
        const [updated] = await tx
          .update(fastPassDaySettings)
          .set({
            offeringEnabled: data.offeringEnabled,
            onlineSalesEnabled: data.onlineSalesEnabled,
            onSiteSalesEnabled: data.onSiteSalesEnabled,
            price: data.price,
            salesStartAt: data.salesStartAt ?? null,
            salesEndAt: data.salesEndAt ?? null,
            ...proposed,
            maxPaidPassesPerPurchase: data.maxPaidPassesPerPurchase,
            bankQrImageUrl: blankToNull(data.bankQrImageUrl),
            onSiteBankQrEnabled: data.onSiteBankQrEnabled,
            onSiteCashEnabled: data.onSiteCashEnabled,
            onSiteProofRequired: data.onSiteProofRequired,
            onSiteVisitorDetailsRequired: data.onSiteVisitorDetailsRequired,
            notifyOnSale: data.notifyOnSale,
            notifyOnCancellation: data.notifyOnCancellation,
            updatedByUserId: admin.id,
            updatedAt: now,
          })
          .where(eq(fastPassDaySettings.id, existing.id))
          .returning();

        await syncNotificationRecipients(
          tx,
          updated.id,
          data.notificationEmails,
        );

        await tx.insert(fastPassEvents).values({
          settingsId: updated.id,
          actorType: "admin",
          actorUserId: admin.id,
          eventType: "settings_updated",
          changes: settingsDiff(before as Record<string, unknown>, {
            ...updated,
            notificationEmails: data.notificationEmails,
          }),
        });

        return { kind: "updated" as const, settingsId: updated.id };
      }

      const [created] = await tx
        .insert(fastPassDaySettings)
        .values({
          festivalDateId,
          offeringEnabled: data.offeringEnabled,
          onlineSalesEnabled: data.onlineSalesEnabled,
          onSiteSalesEnabled: data.onSiteSalesEnabled,
          price: data.price,
          salesStartAt: data.salesStartAt ?? null,
          salesEndAt: data.salesEndAt ?? null,
          ...proposed,
          maxPaidPassesPerPurchase: data.maxPaidPassesPerPurchase,
          bankQrImageUrl: blankToNull(data.bankQrImageUrl),
          onSiteBankQrEnabled: data.onSiteBankQrEnabled,
          onSiteCashEnabled: data.onSiteCashEnabled,
          onSiteProofRequired: data.onSiteProofRequired,
          onSiteVisitorDetailsRequired: data.onSiteVisitorDetailsRequired,
          notifyOnSale: data.notifyOnSale,
          notifyOnCancellation: data.notifyOnCancellation,
          updatedByUserId: admin.id,
        })
        .returning();

      await syncNotificationRecipients(tx, created.id, data.notificationEmails);

      await tx.insert(fastPassEvents).values({
        settingsId: created.id,
        actorType: "admin",
        actorUserId: admin.id,
        eventType: "settings_updated",
        changes: { created: true },
      });

      return { kind: "created" as const, settingsId: created.id };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    await revalidateFastPass(festivalDateId);

    return {
      success: true,
      message:
        outcome.kind === "created"
          ? "Configuración de Pase Rápido creada"
          : "Configuración actualizada",
      settingsId: outcome.settingsId,
    } as const;
  } catch (error) {
    console.error("FastPass settings upsert failed", {
      festivalDateId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos guardar la configuración. Intenta de nuevo.",
    };
  }
}

export async function updateDaySettings(
  settingsId: number,
  input: FastPassDaySettingsInput,
) {
  const admin = await requireFastPassSettingsAdmin(settingsId);
  if (!admin) return { success: false, message: "No autorizado" } as const;

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const [settings] = await db
    .select({ festivalDateId: fastPassDaySettings.festivalDateId })
    .from(fastPassDaySettings)
    .where(eq(fastPassDaySettings.id, settingsId))
    .limit(1);

  if (!settings) {
    return { success: false, message: "Configuración no encontrada" };
  }

  return upsertDaySettings(settings.festivalDateId, input);
}

async function toggleChannelPause(
  settingsId: number,
  channel: "online" | "on_site",
  pause: boolean,
) {
  const admin = await requireFastPassSettingsAdmin(settingsId);
  if (!admin) return { success: false, message: "No autorizado" } as const;

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const now = new Date();
  const pausedAt = pause ? now : null;
  const column =
    channel === "online"
      ? { onlineSalesPausedAt: pausedAt }
      : { onSiteSalesPausedAt: pausedAt };

  const updated = await db.transaction(async (tx) => {
    const [settings] = await tx
      .update(fastPassDaySettings)
      .set({ ...column, updatedByUserId: admin.id, updatedAt: now })
      .where(eq(fastPassDaySettings.id, settingsId))
      .returning();

    if (!settings) return null;

    await tx.insert(fastPassEvents).values({
      settingsId,
      actorType: "admin",
      actorUserId: admin.id,
      eventType: "settings_updated",
      changes: { channel, paused: pause },
    });

    return settings;
  });

  if (!updated) {
    return { success: false, message: "Configuración no encontrada" };
  }

  await revalidateFastPass(updated.festivalDateId);

  return {
    success: true,
    message: pause
      ? channel === "online"
        ? "Ventas online pausadas"
        : "Ventas en sitio pausadas"
      : channel === "online"
        ? "Ventas online reanudadas"
        : "Ventas en sitio reanudadas",
  } as const;
}

export async function pauseOnlineSales(settingsId: number) {
  return toggleChannelPause(settingsId, "online", true);
}

export async function resumeOnlineSales(settingsId: number) {
  return toggleChannelPause(settingsId, "online", false);
}

export async function pauseOnSiteSales(settingsId: number) {
  return toggleChannelPause(settingsId, "on_site", true);
}

export async function resumeOnSiteSales(settingsId: number) {
  return toggleChannelPause(settingsId, "on_site", false);
}

export async function setOfferingEnabled(settingsId: number, enabled: boolean) {
  const admin = await requireFastPassSettingsAdmin(settingsId);
  if (!admin) return { success: false, message: "No autorizado" } as const;

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const [settings] = await tx
      .update(fastPassDaySettings)
      .set({
        offeringEnabled: enabled,
        updatedByUserId: admin.id,
        updatedAt: now,
      })
      .where(eq(fastPassDaySettings.id, settingsId))
      .returning();

    if (!settings) return null;

    await tx.insert(fastPassEvents).values({
      settingsId,
      actorType: "admin",
      actorUserId: admin.id,
      eventType: "settings_updated",
      changes: { offeringEnabled: enabled },
    });

    return settings;
  });

  if (!updated) {
    return { success: false, message: "Configuración no encontrada" };
  }

  await revalidateFastPass(updated.festivalDateId);

  return {
    success: true,
    message: enabled ? "Oferta habilitada" : "Oferta deshabilitada",
  } as const;
}

const posOperatorSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  expiresAt: z.coerce.date(),
});

export async function createPosOperator(
  settingsId: number,
  input: z.input<typeof posOperatorSchema>,
) {
  const admin = await requireFastPassSettingsAdmin(settingsId);
  if (!admin) return { success: false, message: "No autorizado" } as const;

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const parsed = posOperatorSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" };
  }

  const data = parsed.data;
  if (data.expiresAt <= new Date()) {
    return {
      success: false,
      message: "La credencial debe expirar en el futuro",
    };
  }

  const [targetSettings] = await db
    .select({ festivalDateId: fastPassDaySettings.festivalDateId })
    .from(fastPassDaySettings)
    .where(eq(fastPassDaySettings.id, settingsId))
    .limit(1);

  if (!targetSettings) {
    return { success: false, message: "Configuración no encontrada" };
  }

  const credential = generateAccessToken();
  const operator = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(fastPassPosOperators)
      .values({
        settingsId,
        displayName: data.displayName,
        accessTokenHash: hashAccessToken(credential),
        expiresAt: data.expiresAt,
        createdByUserId: admin.id,
      })
      .returning();

    await tx.insert(fastPassEvents).values({
      settingsId,
      actorType: "admin",
      actorUserId: admin.id,
      eventType: "pos_operator_created",
      changes: { operatorId: created.id, displayName: data.displayName },
    });

    return created;
  });

  await revalidateFastPass(targetSettings.festivalDateId);

  return {
    success: true,
    message: "Operador POS creado",
    operatorId: operator.id,
    /** Raw credential — returned once, never stored. */
    credential,
  } as const;
}

export async function revokePosOperator(operatorId: number, reason: string) {
  const admin = await requireFastPassPosOperatorAdmin(operatorId);
  if (!admin) return { success: false, message: "No autorizado" } as const;

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    return { success: false, message: "Escribe el motivo de la revocación" };
  }

  const now = new Date();

  const operator = await db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(fastPassPosOperators)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(fastPassPosOperators.id, operatorId),
          sql`${fastPassPosOperators.revokedAt} IS NULL`,
        ),
      )
      .returning();

    if (!revoked) return null;

    await tx.insert(fastPassEvents).values({
      settingsId: revoked.settingsId,
      actorType: "admin",
      actorUserId: admin.id,
      eventType: "pos_operator_revoked",
      reason: trimmedReason,
      changes: { operatorId },
    });

    return revoked;
  });

  if (!operator) {
    return { success: false, message: "Operador no encontrado o ya revocado" };
  }

  const [settings] = await db
    .select({ festivalDateId: fastPassDaySettings.festivalDateId })
    .from(fastPassDaySettings)
    .where(eq(fastPassDaySettings.id, operator.settingsId))
    .limit(1);

  if (settings) await revalidateFastPass(settings.festivalDateId);

  return { success: true, message: "Credencial revocada" } as const;
}
