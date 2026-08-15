"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  requireFastPassFestivalDateAdmin,
  requireFastPassPurchaseAdmin,
} from "@/app/lib/fast-pass/admin-auth";
import { lockDaySettings } from "@/app/lib/fast-pass/inventory-queries";
import {
  buildBuyerLandingUrl,
  buildDayLabel,
  sendPaymentApprovedEmail,
  sendVoucherChangesEmail,
} from "@/app/lib/fast-pass/notifications";
import {
  ACTIVATION_BLOCKER_LABELS,
  holdExpiresAtFromNow,
  resolveActivation,
  REVIEW_BLOCKER_LABELS,
  REVIEW_DECISION_STATUS,
  reviewDecisionRequiresReason,
  resolveReviewDecision,
  type ReviewDecision,
} from "@/app/lib/fast-pass/state";
import { buildTicketInsertPayload } from "@/app/lib/fast-pass/tickets";
import {
  allocateFestivalTicketNumber,
  lockFestivalTicketAllocation,
} from "@/app/lib/tickets/number-allocation";
import { db } from "@/db";
import {
  festivalDates,
  festivals,
  fastPassActivations,
  fastPassEvents,
  fastPassPurchaseLines,
  fastPassPurchases,
  fastPassTickets,
  fastPassTransactions,
  fastPassVouchers,
  tickets,
  visitors,
} from "@/db/schema";

function normalizeVisitorEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DEFAULT_APPROVAL_AUDIT_REASON = "Pago verificado sin observaciones";

const reviewSchema = z
  .object({
    purchaseId: z.number().int().positive(),
    decision: z.enum(["approve", "reject", "request_changes"]),
    reason: z.string().trim().max(500).default(""),
  })
  .superRefine((data, context) => {
    if (reviewDecisionRequiresReason(data.decision) && data.reason.length < 3) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Escribe el motivo de tu decisión",
      });
    }
  });

export type ReviewFastPassPurchaseInput = z.input<typeof reviewSchema>;

export type ReviewFastPassPurchaseResult =
  | { success: true; message: string; ticketsIssued: number }
  | { success: false; message: string };

const DECISION_EVENT = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
} as const;

const DECISION_MESSAGE: Record<ReviewDecision, string> = {
  approve: "Pago aprobado y pases emitidos",
  reject: "Pago rechazado y cupo liberado",
  request_changes: "Le pedimos un nuevo comprobante",
};

export async function reviewFastPassPurchase(
  input: ReviewFastPassPurchaseInput,
): Promise<ReviewFastPassPurchaseResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Escribe el motivo de tu decisión",
    };
  }

  const data = parsed.data;
  const admin = await requireFastPassPurchaseAdmin(data.purchaseId);
  if (!admin) return { success: false, message: "No autorizado" };

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [unlockedPurchase] = await tx
        .select()
        .from(fastPassPurchases)
        .where(eq(fastPassPurchases.id, data.purchaseId))
        .limit(1);

      if (!unlockedPurchase) {
        return { kind: "error" as const, message: "Compra no encontrada" };
      }

      const settings = await lockDaySettings(tx, unlockedPurchase.settingsId);
      if (!settings || settings.cancelledAt) {
        return { kind: "error" as const, message: "El día fue cancelado" };
      }

      const [purchase] = await tx
        .select()
        .from(fastPassPurchases)
        .where(eq(fastPassPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) {
        return { kind: "error" as const, message: "Compra no encontrada" };
      }
      if (purchase.settingsId !== settings.id) {
        return { kind: "error" as const, message: "La compra cambió de día" };
      }

      const vouchers = await tx
        .select({ id: fastPassVouchers.id })
        .from(fastPassVouchers)
        .where(eq(fastPassVouchers.purchaseId, purchase.id));

      const check = resolveReviewDecision(
        { ...purchase, voucherCount: vouchers.length },
        data.decision,
      );

      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: REVIEW_BLOCKER_LABELS[check.blocker],
        };
      }

      const toStatus = REVIEW_DECISION_STATUS[data.decision];

      const correctionExpiresAt =
        data.decision === "request_changes" ? holdExpiresAtFromNow(now) : null;

      await tx
        .update(fastPassPurchases)
        .set({
          status: toStatus,
          ...(data.decision === "approve" ? { approvedAt: now } : {}),
          ...(data.decision === "reject" ? { rejectedAt: now } : {}),
          correctionExpiresAt:
            data.decision === "request_changes"
              ? correctionExpiresAt
              : purchase.status === "changes_requested" &&
                  data.decision === "approve"
                ? null
                : purchase.correctionExpiresAt,
          updatedAt: now,
        })
        .where(eq(fastPassPurchases.id, purchase.id));

      let ticketsIssued = 0;

      if (data.decision === "approve") {
        const [festivalInfo] = await tx
          .select({
            startDate: festivalDates.startDate,
            festivalId: festivalDates.festivalId,
          })
          .from(festivalDates)
          .where(eq(festivalDates.id, purchase.festivalDateId))
          .limit(1);
        if (!festivalInfo) {
          return { kind: "error" as const, message: "Día no encontrado" };
        }
        await lockFestivalTicketAllocation(tx, festivalInfo.festivalId);

        const lines = await tx
          .select()
          .from(fastPassPurchaseLines)
          .where(eq(fastPassPurchaseLines.purchaseId, purchase.id));

        const identityLines = lines.filter(
          (
            line,
          ): line is typeof line & {
            holderEmail: string;
            holderBirthdate: string;
            holderPhone: string;
          } =>
            Boolean(
              line.holderEmail && line.holderBirthdate && line.holderPhone,
            ),
        );

        const visitorIdByEmail = new Map<string, number>();
        const uniqueEmails = [
          ...new Set(
            identityLines.map((line) =>
              normalizeVisitorEmail(line.holderEmail),
            ),
          ),
        ];

        if (uniqueEmails.length > 0) {
          const existingVisitors = await tx
            .select({ id: visitors.id, email: visitors.email })
            .from(visitors)
            .where(
              sql`lower(${visitors.email}) in (${sql.join(
                uniqueEmails.map((email) => sql`${email}`),
                sql`, `,
              )})`,
            );

          for (const visitor of existingVisitors) {
            visitorIdByEmail.set(
              normalizeVisitorEmail(visitor.email),
              visitor.id,
            );
          }

          const visitorsToInsert: Array<{
            firstName: string | null;
            lastName: string | null;
            email: string;
            phoneNumber: string;
            gender: "male" | "female" | "non_binary" | "other" | "undisclosed";
            birthdate: Date;
            eventDiscovery: "other";
          }> = [];
          const emailsQueuedForInsert = new Set<string>();

          for (const line of identityLines) {
            const emailKey = normalizeVisitorEmail(line.holderEmail);
            if (
              visitorIdByEmail.has(emailKey) ||
              emailsQueuedForInsert.has(emailKey)
            ) {
              continue;
            }
            emailsQueuedForInsert.add(emailKey);
            visitorsToInsert.push({
              firstName: line.holderFirstName,
              lastName: line.holderLastName,
              email: line.holderEmail,
              phoneNumber: line.holderPhone,
              gender: line.holderGender ?? "undisclosed",
              birthdate: new Date(`${line.holderBirthdate}T12:00:00`),
              eventDiscovery: "other",
            });
          }

          if (visitorsToInsert.length > 0) {
            const insertedVisitors = await tx
              .insert(visitors)
              .values(visitorsToInsert)
              .onConflictDoNothing({ target: visitors.email })
              .returning({ id: visitors.id, email: visitors.email });

            for (const visitor of insertedVisitors) {
              visitorIdByEmail.set(
                normalizeVisitorEmail(visitor.email),
                visitor.id,
              );
            }

            const racedEmails = [...emailsQueuedForInsert].filter(
              (email) => !visitorIdByEmail.has(email),
            );
            if (racedEmails.length > 0) {
              const racedVisitors = await tx
                .select({ id: visitors.id, email: visitors.email })
                .from(visitors)
                .where(
                  sql`lower(${visitors.email}) in (${sql.join(
                    racedEmails.map((email) => sql`${email}`),
                    sql`, `,
                  )})`,
                );
              for (const visitor of racedVisitors) {
                visitorIdByEmail.set(
                  normalizeVisitorEmail(visitor.email),
                  visitor.id,
                );
              }
            }
          }
        }

        const visitorIdByLineId = new Map<number, number | null>();
        for (const line of identityLines) {
          visitorIdByLineId.set(
            line.id,
            visitorIdByEmail.get(normalizeVisitorEmail(line.holderEmail)) ??
              null,
          );
        }

        const resolvedVisitorIds = [
          ...new Set(
            [...visitorIdByLineId.values()].filter(
              (id): id is number => id != null,
            ),
          ),
        ];

        const festivalTicketIdByVisitorId = new Map<number, number>();
        if (resolvedVisitorIds.length > 0) {
          const existingFestivalTickets = await tx
            .select({ id: tickets.id, visitorId: tickets.visitorId })
            .from(tickets)
            .where(
              and(
                inArray(tickets.visitorId, resolvedVisitorIds),
                eq(tickets.festivalId, festivalInfo.festivalId),
                eq(tickets.date, festivalInfo.startDate),
                isNull(tickets.retiredAt),
              ),
            );

          for (const ticket of existingFestivalTickets) {
            festivalTicketIdByVisitorId.set(ticket.visitorId, ticket.id);
          }

          const visitorsNeedingTickets = resolvedVisitorIds.filter(
            (visitorId) => !festivalTicketIdByVisitorId.has(visitorId),
          );

          if (visitorsNeedingTickets.length > 0) {
            const childCountByVisitorId = new Map<number, number>();
            for (const line of identityLines) {
              const visitorId = visitorIdByLineId.get(line.id);
              if (
                visitorId == null ||
                childCountByVisitorId.has(visitorId) ||
                festivalTicketIdByVisitorId.has(visitorId)
              ) {
                continue;
              }
              childCountByVisitorId.set(visitorId, line.responsibleChildCount);
            }

            const firstTicketNumber = await allocateFestivalTicketNumber(
              tx,
              festivalInfo.festivalId,
            );

            const createdFestivalTickets = await tx
              .insert(tickets)
              .values(
                visitorsNeedingTickets.map((visitorId, index) => ({
                  date: festivalInfo.startDate,
                  visitorId,
                  festivalId: festivalInfo.festivalId,
                  ticketNumber: firstTicketNumber + index,
                  numberOfVisitors:
                    1 + (childCountByVisitorId.get(visitorId) ?? 0),
                  createdByFastPass: true,
                })),
              )
              .returning({ id: tickets.id, visitorId: tickets.visitorId });

            for (const ticket of createdFestivalTickets) {
              festivalTicketIdByVisitorId.set(ticket.visitorId, ticket.id);
            }
          }
        }

        for (const line of lines) {
          let visitorId = line.visitorId;
          let festivalTicketId = line.festivalTicketId;

          if (line.holderEmail && line.holderBirthdate && line.holderPhone) {
            visitorId = visitorIdByLineId.get(line.id) ?? null;
            if (visitorId) {
              festivalTicketId =
                festivalTicketIdByVisitorId.get(visitorId) ?? null;

              await tx
                .update(fastPassPurchaseLines)
                .set({ visitorId, festivalTicketId, updatedAt: now })
                .where(eq(fastPassPurchaseLines.id, line.id));
            }
          }

          const payload = buildTicketInsertPayload(
            { ...line, festivalTicketId },
            purchase.festivalDateId,
            { status: "valid", now },
          );

          const issued = await tx
            .insert(fastPassTickets)
            .values(payload)
            .onConflictDoNothing({ target: fastPassTickets.purchaseLineId })
            .returning({ id: fastPassTickets.id, code: fastPassTickets.code });

          if (issued.length > 0) {
            ticketsIssued += 1;
            await tx.insert(fastPassEvents).values({
              purchaseId: purchase.id,
              actorType: "system",
              eventType: "ticket_issued",
              changes: {
                ticketId: issued[0].id,
                purchaseLineId: line.id,
              },
            });
          }
        }

        const existingSale = await tx
          .select({ id: fastPassTransactions.id })
          .from(fastPassTransactions)
          .where(
            and(
              eq(fastPassTransactions.purchaseId, purchase.id),
              eq(fastPassTransactions.type, "sale"),
            ),
          )
          .limit(1);

        if (existingSale.length === 0) {
          const [sale] = await tx
            .insert(fastPassTransactions)
            .values({
              purchaseId: purchase.id,
              type: "sale",
              amount: purchase.totalAmount,
              paymentMethod: purchase.paymentMethod,
              actorUserId: admin.id,
            })
            .returning();

          await tx.insert(fastPassEvents).values({
            purchaseId: purchase.id,
            actorType: "admin",
            actorUserId: admin.id,
            eventType: "sale_transaction",
            changes: { transactionId: sale.id, amount: sale.amount },
          });
        }
      }

      await tx.insert(fastPassEvents).values({
        purchaseId: purchase.id,
        actorType: "admin",
        actorUserId: admin.id,
        eventType: DECISION_EVENT[data.decision],
        fromStatus: purchase.status,
        toStatus,
        reason: data.reason || DEFAULT_APPROVAL_AUDIT_REASON,
        changes: { ticketsIssued },
      });

      const notifyLines =
        data.decision === "approve"
          ? await tx
              .select({
                holderFirstName: fastPassPurchaseLines.holderFirstName,
                holderLastName: fastPassPurchaseLines.holderLastName,
                responsibleChildCount:
                  fastPassPurchaseLines.responsibleChildCount,
                ticketCode: fastPassTickets.code,
              })
              .from(fastPassPurchaseLines)
              .leftJoin(
                fastPassTickets,
                eq(fastPassTickets.purchaseLineId, fastPassPurchaseLines.id),
              )
              .where(eq(fastPassPurchaseLines.purchaseId, purchase.id))
          : [];

      const [festivalDate] = await tx
        .select({
          startDate: festivalDates.startDate,
          festivalType: festivals.festivalType,
        })
        .from(festivalDates)
        .innerJoin(festivals, eq(festivals.id, festivalDates.festivalId))
        .where(
          eq(
            festivalDates.id,
            settings.festivalDateId ?? purchase.festivalDateId,
          ),
        )
        .limit(1);

      return {
        kind: "done" as const,
        ticketsIssued,
        purchase,
        notifyLines,
        correctionExpiresAt,
        festivalDay: festivalDate?.startDate ?? null,
        festivalType: festivalDate?.festivalType ?? "glitter",
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/festivals", "layout");
    revalidatePath(`/fast-pass/purchases/${data.purchaseId}`);

    try {
      const festivalDayLabel = outcome.festivalDay
        ? buildDayLabel(outcome.festivalDay)
        : "";

      if (data.decision === "request_changes" && outcome.purchase.buyerEmail) {
        const sent = await sendVoucherChangesEmail({
          purchaseId: outcome.purchase.id,
          buyerName: outcome.purchase.buyerName ?? "Cliente",
          buyerEmail: outcome.purchase.buyerEmail,
          festivalDayLabel,
          reason: data.reason,
          landingUrl: buildBuyerLandingUrl({ purchaseId: outcome.purchase.id }),
          correctionExpiresAt: outcome.correctionExpiresAt ?? new Date(),
          festivalType: outcome.festivalType,
        });
        if (!sent) {
          await db.insert(fastPassEvents).values({
            purchaseId: outcome.purchase.id,
            actorType: "system",
            eventType: "notification_failed",
            changes: { notification: "voucher_changes" },
          });
        }
      }

      if (data.decision === "approve" && outcome.purchase.buyerEmail) {
        for (const line of outcome.notifyLines) {
          if (!line.ticketCode) continue;

          const holderLabel = [line.holderFirstName, line.holderLastName]
            .filter(Boolean)
            .join(" ")
            .trim();

          const sent = await sendPaymentApprovedEmail({
            purchaseId: outcome.purchase.id,
            buyerName: outcome.purchase.buyerName ?? "Cliente",
            buyerEmail: outcome.purchase.buyerEmail,
            festivalDayLabel,
            holderLabel: holderLabel || "Titular",
            childCount: line.responsibleChildCount,
            ticketCode: line.ticketCode,
            landingUrl: buildBuyerLandingUrl({
              purchaseId: outcome.purchase.id,
            }),
            festivalType: outcome.festivalType,
          });
          if (!sent) {
            await db.insert(fastPassEvents).values({
              purchaseId: outcome.purchase.id,
              actorType: "system",
              eventType: "notification_failed",
              changes: {
                notification: "payment_approved",
                ticketCode: line.ticketCode,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error("FastPass review notification failed", {
        purchaseId: data.purchaseId,
        decision: data.decision,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      try {
        await db.insert(fastPassEvents).values({
          purchaseId: data.purchaseId,
          actorType: "system",
          eventType: "notification_failed",
          changes: { notification: `review_${data.decision}` },
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

    return {
      success: true,
      message: DECISION_MESSAGE[data.decision],
      ticketsIssued: outcome.ticketsIssued,
    };
  } catch (error) {
    console.error("FastPass review failed", {
      purchaseId: data.purchaseId,
      decision: data.decision,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos registrar tu decisión. Intenta de nuevo.",
    };
  }
}

const activateSchema = z.object({
  ticketId: z.number().int().positive().optional(),
  code: z.string().trim().min(1).max(200).optional(),
  festivalDateId: z.number().int().positive(),
  method: z.enum(["qr_scan", "manual"]).default("qr_scan"),
});

export async function activateFastPassTicket(
  input: z.input<typeof activateSchema>,
) {
  const parsed = activateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" };
  }

  const data = parsed.data;
  const admin = await requireFastPassFestivalDateAdmin(data.festivalDateId);
  if (!admin) return { success: false, message: "No autorizado" };

  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  if (!data.ticketId && !data.code) {
    return { success: false, message: "Indica el pase a activar" };
  }

  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const ticketQuery = data.ticketId
        ? eq(fastPassTickets.id, data.ticketId)
        : eq(fastPassTickets.code, data.code!);

      const [ticket] = await tx
        .select()
        .from(fastPassTickets)
        .where(ticketQuery)
        .for("update")
        .limit(1);

      if (!ticket) {
        return { kind: "error" as const, message: "Pase no encontrado" };
      }

      const check = resolveActivation(ticket, data.festivalDateId);
      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: ACTIVATION_BLOCKER_LABELS[check.blocker],
        };
      }

      const activation = await tx
        .insert(fastPassActivations)
        .values({
          ticketId: ticket.id,
          festivalDateId: data.festivalDateId,
          method: data.method,
          operatorUserId: admin.id,
        })
        .onConflictDoNothing({ target: fastPassActivations.ticketId })
        .returning({ id: fastPassActivations.id });

      if (activation.length === 0) {
        return { kind: "error" as const, message: "Ya activado" };
      }

      await tx
        .update(fastPassTickets)
        .set({ status: "activated", activatedAt: now, updatedAt: now })
        .where(eq(fastPassTickets.id, ticket.id));

      const [purchaseLine] = await tx
        .select({ purchaseId: fastPassPurchaseLines.purchaseId })
        .from(fastPassPurchaseLines)
        .where(eq(fastPassPurchaseLines.id, ticket.purchaseLineId))
        .limit(1);

      if (purchaseLine) {
        await tx.insert(fastPassEvents).values({
          purchaseId: purchaseLine.purchaseId,
          actorType: "admin",
          actorUserId: admin.id,
          eventType: "ticket_activated",
          changes: {
            ticketId: ticket.id,
            activationId: activation[0].id,
            method: data.method,
          },
        });
      }

      return { kind: "activated" as const, ticketId: ticket.id };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/festivals", "layout");

    return {
      success: true,
      message: "Pase activado. Pulsera emitida.",
      ticketId: outcome.ticketId,
    };
  } catch (error) {
    console.error("FastPass activation failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos activar el pase. Intenta de nuevo.",
    };
  }
}
