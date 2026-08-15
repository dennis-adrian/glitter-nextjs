"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { resolvePurchaseAccessFromSubject } from "@/app/lib/fast-pass/access";
import { requireFastPassPurchaseAdmin } from "@/app/lib/fast-pass/admin-auth";
import { FAST_PASS_REASON_MAX } from "@/app/lib/fast-pass/definitions";
import { lockDaySettings } from "@/app/lib/fast-pass/inventory-queries";
import {
  buildBuyerLandingUrl,
  buildDayLabel,
  sendVoucherReceivedEmail,
} from "@/app/lib/fast-pass/notifications";
import {
  isAuthorizedVoucherUrl,
  resolveVoucherSubmission,
  VOUCHER_BLOCKER_LABELS,
} from "@/app/lib/fast-pass/vouchers";
import {
  BUYER_CANCELLATION_BLOCKER_LABELS,
  resolveBuyerCancellation,
} from "@/app/lib/fast-pass/state";
import { db } from "@/db";
import {
  festivalDates,
  fastPassEvents,
  fastPassPurchaseLines,
  fastPassPurchases,
  fastPassVouchers,
  festivals,
} from "@/db/schema";

const submitSchema = z
  .object({
    purchaseId: z.number().int().positive(),
    fileUrl: z.string().trim().url().max(2000),
    fileKey: z.string().trim().min(1).max(200),
    token: z.string().trim().min(1).max(200).optional(),
    /** When an admin submits on behalf of the buyer. */
    asAdmin: z.boolean().optional(),
  })
  .refine((value) => isAuthorizedVoucherUrl(value.fileUrl, value.fileKey), {
    path: ["fileUrl"],
    message: "El comprobante no corresponde a un archivo subido",
  });

export type SubmitFastPassVoucherInput = z.input<typeof submitSchema>;

export type SubmitFastPassVoucherResult =
  | { success: true; message: string; version: number }
  | { success: false; message: string };

export async function submitFastPassVoucher(
  input: SubmitFastPassVoucherInput,
): Promise<SubmitFastPassVoucherResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "No pudimos registrar el comprobante" };
  }

  const data = parsed.data;
  const admin = data.asAdmin
    ? await requireFastPassPurchaseAdmin(data.purchaseId)
    : null;
  if (data.asAdmin && !admin) {
    return { success: false, message: "No autorizado" };
  }

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(fastPassPurchases)
        .where(eq(fastPassPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) return { kind: "denied" as const };

      const settings = await lockDaySettings(tx, purchase.settingsId);
      if (!settings || settings.cancelledAt) {
        return { kind: "error" as const, message: "El día fue cancelado" };
      }

      if (!data.asAdmin) {
        const access = resolvePurchaseAccessFromSubject(purchase, data.token);
        if (!access.granted) return { kind: "denied" as const };
      }

      const check = resolveVoucherSubmission(purchase, now);
      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: VOUCHER_BLOCKER_LABELS[check.blocker],
        };
      }

      const [{ max }] = await tx
        .select({
          max: sql<number>`coalesce(max(${fastPassVouchers.version}), 0)`,
        })
        .from(fastPassVouchers)
        .where(eq(fastPassVouchers.purchaseId, purchase.id));

      const version = Number(max) + 1;
      const fromStatus = purchase.status;

      await tx.insert(fastPassVouchers).values({
        purchaseId: purchase.id,
        version,
        fileUrl: data.fileUrl,
        uploadedVia: data.asAdmin ? "admin" : "buyer",
        uploadedByUserId: admin?.id ?? null,
      });

      await tx
        .update(fastPassPurchases)
        .set({
          status: "under_verification",
          voucherSubmittedAt: purchase.voucherSubmittedAt ?? now,
          correctionExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(fastPassPurchases.id, purchase.id));

      await tx.insert(fastPassEvents).values({
        purchaseId: purchase.id,
        actorType: data.asAdmin ? "admin" : "buyer",
        actorUserId: admin?.id ?? null,
        eventType: version === 1 ? "voucher_uploaded" : "voucher_replaced",
        fromStatus,
        toStatus: "under_verification",
        changes: { version },
      });

      const lines = await tx
        .select({ id: fastPassPurchaseLines.id })
        .from(fastPassPurchaseLines)
        .where(eq(fastPassPurchaseLines.purchaseId, purchase.id));

      const [festivalDate] = await tx
        .select({
          startDate: festivalDates.startDate,
          festivalType: festivals.festivalType,
        })
        .from(fastPassPurchases)
        .innerJoin(
          festivalDates,
          eq(festivalDates.id, fastPassPurchases.festivalDateId),
        )
        .innerJoin(festivals, eq(festivals.id, festivalDates.festivalId))
        .where(eq(fastPassPurchases.id, purchase.id))
        .limit(1);

      return {
        kind: "recorded" as const,
        version,
        purchase,
        festivalDay: festivalDate!.startDate,
        festivalType: festivalDate!.festivalType,
        paidCount: lines.length,
        accessVia: data.asAdmin ? ("admin" as const) : ("token" as const),
      };
    });

    if (outcome.kind === "denied") {
      return { success: false, message: "No pudimos registrar el comprobante" };
    }
    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath(`/fast-pass/purchases/${data.purchaseId}`);
    revalidatePath("/dashboard/festivals", "layout");

    if (outcome.purchase.buyerEmail) {
      try {
        const landingUrl = buildBuyerLandingUrl({
          purchaseId: outcome.purchase.id,
          accessToken:
            outcome.accessVia === "token" ? (data.token ?? null) : null,
        });
        const sent = await sendVoucherReceivedEmail({
          purchaseId: outcome.purchase.id,
          buyerName: outcome.purchase.buyerName ?? "Cliente",
          buyerEmail: outcome.purchase.buyerEmail,
          festivalDayLabel: buildDayLabel(outcome.festivalDay),
          paidCount: outcome.paidCount,
          totalAmount: outcome.purchase.totalAmount,
          version: outcome.version,
          landingUrl,
          festivalType: outcome.festivalType,
        });
        if (!sent) {
          await db.insert(fastPassEvents).values({
            purchaseId: outcome.purchase.id,
            actorType: "system",
            eventType: "notification_failed",
            changes: { notification: "voucher_received" },
          });
        }
      } catch (error) {
        console.error("FastPass voucher email failed", {
          purchaseId: data.purchaseId,
          errorType: error instanceof Error ? error.name : typeof error,
        });
        try {
          await db.insert(fastPassEvents).values({
            purchaseId: outcome.purchase.id,
            actorType: "system",
            eventType: "notification_failed",
            changes: { notification: "voucher_received" },
          });
        } catch (recordError) {
          console.error("FastPass notification failure audit failed", {
            purchaseId: data.purchaseId,
            errorType:
              recordError instanceof Error
                ? recordError.name
                : typeof recordError,
          });
        }
      }
    }

    return {
      success: true,
      version: outcome.version,
      message:
        outcome.version === 1
          ? "Recibimos tu comprobante. Lo revisaremos pronto."
          : "Reemplazamos tu comprobante. Revisaremos el nuevo.",
    };
  } catch (error) {
    console.error("FastPass voucher submission failed", {
      purchaseId: data.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos registrar el comprobante. Intenta de nuevo.",
    };
  }
}

const cancelSchema = z.object({
  purchaseId: z.number().int().positive(),
  token: z.string().trim().min(1).max(200),
});

export async function cancelFastPassPurchaseByBuyer(
  input: z.input<typeof cancelSchema>,
) {
  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "No pudimos cancelar la compra" };
  }

  const data = parsed.data;
  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(fastPassPurchases)
        .where(eq(fastPassPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) return { kind: "denied" as const };

      const access = resolvePurchaseAccessFromSubject(purchase, data.token);
      if (!access.granted) return { kind: "denied" as const };

      const check = resolveBuyerCancellation(purchase, now);
      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: BUYER_CANCELLATION_BLOCKER_LABELS[check.blocker],
        };
      }

      await tx
        .update(fastPassPurchases)
        .set({
          status: "cancelled",
          cancelledAt: now,
          allocationRestored: true,
          updatedAt: now,
        })
        .where(eq(fastPassPurchases.id, purchase.id));

      await tx.insert(fastPassEvents).values({
        purchaseId: purchase.id,
        actorType: "buyer",
        eventType: "cancelled_by_buyer",
        fromStatus: purchase.status,
        toStatus: "cancelled",
      });

      return { kind: "cancelled" as const };
    });

    if (outcome.kind === "denied") {
      return { success: false, message: "No pudimos cancelar la compra" };
    }
    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath(`/fast-pass/purchases/${data.purchaseId}`);

    return {
      success: true,
      message: "Cancelamos tu reserva. El cupo quedó liberado.",
    };
  } catch (error) {
    console.error("FastPass buyer cancellation failed", {
      purchaseId: data.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos cancelar la compra. Intenta de nuevo.",
    };
  }
}

export async function revokePurchaseAccessToken(
  purchaseId: number,
  reason: string,
) {
  const admin = await requireFastPassPurchaseAdmin(purchaseId);
  if (!admin) return { success: false, message: "No autorizado" };

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > FAST_PASS_REASON_MAX) {
    return { success: false, message: "Escribe el motivo de la revocación" };
  }

  const now = new Date();

  const purchase = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(fastPassPurchases)
      .set({ accessTokenRevokedAt: now, updatedAt: now })
      .where(eq(fastPassPurchases.id, purchaseId))
      .returning();

    if (!updated) return null;

    await tx.insert(fastPassEvents).values({
      purchaseId,
      actorType: "admin",
      actorUserId: admin.id,
      eventType: "link_revoked",
      reason: trimmed,
      changes: { accessTokenRevoked: true },
    });

    return updated;
  });

  if (!purchase) {
    return { success: false, message: "Compra no encontrada" };
  }

  return { success: true, message: "Enlace anterior revocado" };
}
