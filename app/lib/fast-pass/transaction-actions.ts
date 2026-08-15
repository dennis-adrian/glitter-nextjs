"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  requireFastPassRefundAdmin,
  requireFastPassSettingsAdmin,
  requireFastPassTransactionAdmin,
} from "@/app/lib/fast-pass/admin-auth";
import { FAST_PASS_REASON_MAX } from "@/app/lib/fast-pass/definitions";
import { lockDaySettings } from "@/app/lib/fast-pass/inventory-queries";
import { resolveTransactionCancellation } from "@/app/lib/fast-pass/state";
import { sendCancellationNotification } from "@/app/lib/fast-pass/notifications";
import { formatFullDate } from "@/app/lib/formatters";
import { db } from "@/db";
import {
  fastPassActivations,
  fastPassDaySettings,
  fastPassEvents,
  fastPassNotificationRecipients,
  fastPassPurchaseLines,
  fastPassPurchases,
  fastPassRefunds,
  fastPassTickets,
  fastPassTransactions,
  festivalDates,
  festivals,
} from "@/db/schema";

const cancelSchema = z.object({
  saleTransactionId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(FAST_PASS_REASON_MAX),
  wristbandsRecovered: z.boolean(),
});

export async function cancelFastPassSale(input: z.input<typeof cancelSchema>) {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ??
        "Escribe el motivo de la cancelación",
    };
  }

  const data = parsed.data;
  const admin = await requireFastPassTransactionAdmin(data.saleTransactionId);
  if (!admin) return { success: false, message: "No autorizado" };

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(fastPassTransactions)
        .where(eq(fastPassTransactions.id, data.saleTransactionId))
        .for("update")
        .limit(1);

      if (!sale) {
        return { kind: "error" as const, message: "Transacción no encontrada" };
      }

      const reversals = await tx
        .select({ amount: fastPassTransactions.amount })
        .from(fastPassTransactions)
        .where(
          and(
            eq(fastPassTransactions.relatedTransactionId, sale.id),
            inArray(fastPassTransactions.type, ["cancellation", "refund"]),
          ),
        );

      const existingCancellationAmount = reversals.reduce(
        (sum, row) => sum + Math.abs(row.amount),
        0,
      );

      const activations = await tx
        .select({ id: fastPassActivations.id })
        .from(fastPassActivations)
        .innerJoin(
          fastPassTickets,
          eq(fastPassTickets.id, fastPassActivations.ticketId),
        )
        .innerJoin(
          fastPassPurchaseLines,
          eq(fastPassPurchaseLines.id, fastPassTickets.purchaseLineId),
        )
        .where(eq(fastPassPurchaseLines.purchaseId, sale.purchaseId))
        .limit(1);

      const check = resolveTransactionCancellation({
        transactionType: sale.type,
        existingCancellationAmount,
        requestedCancellationAmount: sale.amount,
        saleAmount: sale.amount,
        hasActivation: activations.length > 0,
        wristbandsRecovered: data.wristbandsRecovered,
      });

      if (!check.allowed) {
        return {
          kind: "error" as const,
          message:
            check.blocker === "already_cancelled"
              ? "Esta venta ya fue cancelada"
              : "No se puede cancelar esta transacción",
        };
      }

      const [purchase] = await tx
        .select()
        .from(fastPassPurchases)
        .where(eq(fastPassPurchases.id, sale.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) {
        return { kind: "error" as const, message: "Compra no encontrada" };
      }

      const [cancellation] = await tx
        .insert(fastPassTransactions)
        .values({
          purchaseId: sale.purchaseId,
          type: "cancellation",
          amount: -sale.amount,
          paymentMethod: sale.paymentMethod,
          relatedTransactionId: sale.id,
          actorUserId: admin.id,
          reason: data.reason,
        })
        .returning();

      await tx
        .update(fastPassPurchases)
        .set({
          status: "cancelled",
          cancelledAt: now,
          allocationRestored: check.restoresAllocation,
          updatedAt: now,
        })
        .where(eq(fastPassPurchases.id, purchase.id));

      const tickets = await tx
        .select({ id: fastPassTickets.id })
        .from(fastPassTickets)
        .innerJoin(
          fastPassPurchaseLines,
          eq(fastPassPurchaseLines.id, fastPassTickets.purchaseLineId),
        )
        .where(eq(fastPassPurchaseLines.purchaseId, purchase.id));

      for (const ticket of tickets) {
        await tx
          .update(fastPassTickets)
          .set({
            status: "cancelled",
            cancelledAt: now,
            cancelledReason: data.reason,
            cancelledByUserId: admin.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(fastPassTickets.id, ticket.id),
              sql`${fastPassTickets.status} <> 'cancelled'`,
            ),
          );
      }

      await tx.insert(fastPassEvents).values({
        purchaseId: purchase.id,
        actorType: "admin",
        actorUserId: admin.id,
        eventType: "cancellation_transaction",
        fromStatus: purchase.status,
        toStatus: "cancelled",
        reason: data.reason,
        changes: {
          transactionId: cancellation.id,
          restoresAllocation: check.restoresAllocation,
        },
      });

      const [settings] = await tx
        .select({
          notifyOnCancellation: fastPassDaySettings.notifyOnCancellation,
        })
        .from(fastPassDaySettings)
        .where(eq(fastPassDaySettings.id, purchase.settingsId))
        .limit(1);
      const recipients = settings?.notifyOnCancellation
        ? await tx
            .select({ email: fastPassNotificationRecipients.email })
            .from(fastPassNotificationRecipients)
            .where(
              eq(
                fastPassNotificationRecipients.settingsId,
                purchase.settingsId,
              ),
            )
        : [];

      return {
        kind: "cancelled" as const,
        purchaseId: purchase.id,
        festivalDateId: purchase.festivalDateId,
        originalTransactionId: sale.id,
        cancellationTransactionId: cancellation.id,
        amount: cancellation.amount,
        reason: data.reason,
        recipients: recipients.map((recipient) => recipient.email),
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/festivals", "layout");

    if (outcome.recipients.length > 0) {
      const [festivalDate] = await db
        .select({
          startDate: festivalDates.startDate,
          festivalType: festivals.festivalType,
        })
        .from(festivalDates)
        .innerJoin(festivals, eq(festivals.id, festivalDates.festivalId))
        .where(eq(festivalDates.id, outcome.festivalDateId))
        .limit(1);
      const sent = await sendCancellationNotification({
        recipients: outcome.recipients,
        purchaseId: outcome.purchaseId,
        originalTransactionId: outcome.originalTransactionId,
        cancellationTransactionId: outcome.cancellationTransactionId,
        festivalDayLabel: festivalDate
          ? formatFullDate(festivalDate.startDate)
          : "Día de festival",
        amount: outcome.amount,
        reason: outcome.reason,
        adminName: admin.displayName ?? `Usuario #${admin.id}`,
        occurredAt: now,
        festivalType: festivalDate?.festivalType ?? "glitter",
      });
      if (!sent) {
        await db.insert(fastPassEvents).values({
          purchaseId: outcome.purchaseId,
          actorType: "system",
          eventType: "notification_failed",
          changes: { notification: "cancellation" },
        });
      }
    }

    return {
      success: true,
      message: "Venta cancelada",
      purchaseId: outcome.purchaseId,
    };
  } catch (error) {
    console.error("FastPass sale cancellation failed", {
      saleTransactionId: data.saleTransactionId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos cancelar la venta. Intenta de nuevo.",
    };
  }
}

const festivalCancelSchema = z.object({
  settingsId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(FAST_PASS_REASON_MAX),
});

const FESTIVAL_CANCELLATION_BATCH_SIZE = 100;

const FESTIVAL_CANCELLATION_ACTIVE_STATUSES = [
  "pending_upload",
  "under_verification",
  "changes_requested",
  "approved",
] as const;

/**
 * Festival-day cancellation: disables offering, invalidates passes, creates
 * pending refund work items for approved online bank-QR sales.
 */
export async function cancelFestivalDayFastPass(
  input: z.input<typeof festivalCancelSchema>,
) {
  const parsed = festivalCancelSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Escribe el motivo de la cancelación" };
  }

  const data = parsed.data;
  const admin = await requireFastPassSettingsAdmin(data.settingsId);
  if (!admin) return { success: false, message: "No autorizado" };

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const now = new Date();

  try {
    const start = await db.transaction(async (tx) => {
      const settings = await lockDaySettings(tx, data.settingsId);
      if (!settings) {
        return { kind: "error" as const, message: "Día no encontrado" };
      }

      if (settings.cancelledAt) {
        const [remainingPurchase] = await tx
          .select({ id: fastPassPurchases.id })
          .from(fastPassPurchases)
          .where(
            and(
              eq(fastPassPurchases.settingsId, settings.id),
              inArray(
                fastPassPurchases.status,
                FESTIVAL_CANCELLATION_ACTIVE_STATUSES,
              ),
            ),
          )
          .limit(1);

        const [cancellationEvent] = await tx
          .select({ id: fastPassEvents.id })
          .from(fastPassEvents)
          .where(
            and(
              eq(fastPassEvents.settingsId, settings.id),
              eq(fastPassEvents.eventType, "festival_cancelled"),
            ),
          )
          .limit(1);

        if (remainingPurchase || !cancellationEvent) {
          return {
            kind: "started" as const,
          };
        }

        return {
          kind: "error" as const,
          message: "Este día ya fue cancelado",
        };
      }

      await tx
        .update(fastPassDaySettings)
        .set({
          offeringEnabled: false,
          onlineSalesEnabled: false,
          onSiteSalesEnabled: false,
          cancelledAt: now,
          updatedByUserId: admin.id,
          updatedAt: now,
        })
        .where(eq(fastPassDaySettings.id, settings.id));

      return {
        kind: "started" as const,
      };
    });

    if (start.kind === "error") {
      return { success: false, message: start.message };
    }

    let purchasesAffected = 0;
    let refundsCreated = 0;

    while (true) {
      const batch = await db.transaction(async (tx) => {
        const settings = await lockDaySettings(tx, data.settingsId);
        if (!settings?.cancelledAt) {
          throw new Error("Fast Pass day cancellation state was lost");
        }

        const affectedPurchases = await tx
          .select()
          .from(fastPassPurchases)
          .where(
            and(
              eq(fastPassPurchases.settingsId, settings.id),
              inArray(
                fastPassPurchases.status,
                FESTIVAL_CANCELLATION_ACTIVE_STATUSES,
              ),
            ),
          )
          .for("update")
          .limit(FESTIVAL_CANCELLATION_BATCH_SIZE);

        let batchRefundsCreated = 0;

        for (const purchase of affectedPurchases) {
          await tx
            .update(fastPassPurchases)
            .set({
              status: "cancelled",
              cancelledAt: now,
              allocationRestored: true,
              updatedAt: now,
            })
            .where(eq(fastPassPurchases.id, purchase.id));

          const tickets = await tx
            .select({ id: fastPassTickets.id })
            .from(fastPassTickets)
            .innerJoin(
              fastPassPurchaseLines,
              eq(fastPassPurchaseLines.id, fastPassTickets.purchaseLineId),
            )
            .where(eq(fastPassPurchaseLines.purchaseId, purchase.id));

          for (const ticket of tickets) {
            await tx
              .update(fastPassTickets)
              .set({
                status: "cancelled",
                cancelledAt: now,
                cancelledReason: data.reason,
                cancelledByUserId: admin.id,
                updatedAt: now,
              })
              .where(
                and(
                  eq(fastPassTickets.id, ticket.id),
                  sql`${fastPassTickets.status} <> 'cancelled'`,
                ),
              );
          }

          const [sale] =
            purchase.status === "approved" && purchase.channel === "online"
              ? await tx
                  .select()
                  .from(fastPassTransactions)
                  .where(
                    and(
                      eq(fastPassTransactions.purchaseId, purchase.id),
                      eq(fastPassTransactions.type, "sale"),
                      eq(fastPassTransactions.paymentMethod, "bank_qr"),
                    ),
                  )
                  .limit(1)
              : [];

          if (sale) {
            const inserted = await tx
              .insert(fastPassRefunds)
              .values({
                purchaseId: purchase.id,
                saleTransactionId: sale.id,
                trigger: "festival_cancellation",
                status: "pending",
                amount: sale.amount,
                paymentMethod: sale.paymentMethod,
                createdByUserId: admin.id,
              })
              .onConflictDoNothing({
                target: [
                  fastPassRefunds.saleTransactionId,
                  fastPassRefunds.trigger,
                ],
              })
              .returning({ id: fastPassRefunds.id });

            if (inserted.length > 0) {
              batchRefundsCreated += 1;
              await tx.insert(fastPassEvents).values({
                purchaseId: purchase.id,
                actorType: "admin",
                actorUserId: admin.id,
                eventType: "refund_created",
                reason: data.reason,
                changes: { refundId: inserted[0].id, amount: sale.amount },
              });
            }
          }

          await tx.insert(fastPassEvents).values({
            purchaseId: purchase.id,
            actorType: "admin",
            actorUserId: admin.id,
            eventType: "festival_cancelled",
            fromStatus: purchase.status,
            toStatus: "cancelled",
            reason: data.reason,
          });
        }

        return {
          purchasesAffected: affectedPurchases.length,
          refundsCreated: batchRefundsCreated,
        };
      });

      purchasesAffected += batch.purchasesAffected;
      refundsCreated += batch.refundsCreated;

      if (batch.purchasesAffected < FESTIVAL_CANCELLATION_BATCH_SIZE) break;
    }

    await db.transaction(async (tx) => {
      const settings = await lockDaySettings(tx, data.settingsId);
      if (!settings?.cancelledAt) {
        throw new Error("Fast Pass day cancellation state was lost");
      }

      const [existingEvent] = await tx
        .select({ id: fastPassEvents.id })
        .from(fastPassEvents)
        .where(
          and(
            eq(fastPassEvents.settingsId, settings.id),
            eq(fastPassEvents.eventType, "festival_cancelled"),
          ),
        )
        .limit(1);

      if (!existingEvent) {
        await tx.insert(fastPassEvents).values({
          settingsId: settings.id,
          actorType: "admin",
          actorUserId: admin.id,
          eventType: "festival_cancelled",
          reason: data.reason,
          changes: { purchasesAffected, refundsCreated },
        });
      }
    });

    revalidatePath("/dashboard/festivals", "layout");

    return {
      success: true,
      message: "Día cancelado. Se crearon tareas de reembolso pendientes.",
      purchasesAffected,
      refundsCreated,
    };
  } catch (error) {
    console.error("FastPass festival cancellation failed", {
      settingsId: data.settingsId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos cancelar el día. Intenta de nuevo.",
    };
  }
}

const resolveRefundSchema = z.object({
  refundId: z.number().int().positive(),
  resolutionNotes: z.string().trim().min(3).max(FAST_PASS_REASON_MAX),
  resolutionReference: z.string().trim().max(200).optional(),
});

/** Marks a festival-cancellation refund as paid with audit notes. */
export async function resolveFastPassRefund(
  input: z.input<typeof resolveRefundSchema>,
) {
  const parsed = resolveRefundSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Escribe las notas de resolución del reembolso",
    };
  }

  const data = parsed.data;
  const admin = await requireFastPassRefundAdmin(data.refundId);
  if (!admin) return { success: false, message: "No autorizado" };

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [refund] = await tx
        .select()
        .from(fastPassRefunds)
        .where(eq(fastPassRefunds.id, data.refundId))
        .for("update")
        .limit(1);

      if (!refund) {
        return { kind: "error" as const, message: "Reembolso no encontrado" };
      }
      if (refund.status === "paid") {
        return {
          kind: "error" as const,
          message: "Este reembolso ya fue pagado",
        };
      }

      await tx
        .update(fastPassRefunds)
        .set({
          status: "paid",
          resolutionNotes: data.resolutionNotes,
          resolutionReference: data.resolutionReference ?? null,
          resolvedByUserId: admin.id,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(fastPassRefunds.id, refund.id));

      const [refundTransaction] = await tx
        .insert(fastPassTransactions)
        .values({
          purchaseId: refund.purchaseId,
          type: "refund",
          amount: -refund.amount,
          paymentMethod: refund.paymentMethod,
          relatedTransactionId: refund.saleTransactionId,
          actorUserId: admin.id,
          reason: data.resolutionNotes,
        })
        .returning({ id: fastPassTransactions.id });

      await tx.insert(fastPassEvents).values({
        purchaseId: refund.purchaseId,
        actorType: "admin",
        actorUserId: admin.id,
        eventType: "refund_resolved",
        reason: data.resolutionNotes,
        changes: {
          refundId: refund.id,
          transactionId: refundTransaction.id,
          resolutionReference: data.resolutionReference ?? null,
        },
      });

      return { kind: "done" as const, purchaseId: refund.purchaseId };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/festivals", "layout");
    return { success: true, message: "Reembolso marcado como pagado" };
  } catch (error) {
    console.error("FastPass refund resolution failed", {
      refundId: data.refundId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos registrar el reembolso. Intenta de nuevo.",
    };
  }
}
