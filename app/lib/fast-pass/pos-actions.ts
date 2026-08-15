"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  canReserveGroup,
  demandFromLines,
} from "@/app/lib/fast-pass/availability";
import {
  FAST_PASS_MAX_CHILDREN_PER_ADULT,
  FAST_PASS_PAYMENT_METHOD_LABELS,
} from "@/app/lib/fast-pass/definitions";
import {
  fetchDayAvailability,
  fetchDayAvailabilityInTx,
  lockDaySettings,
} from "@/app/lib/fast-pass/inventory-queries";
import {
  resolvePosOperatorByCredential,
  resolvePosOperatorForSettings,
  touchPosOperatorLastUsed,
} from "@/app/lib/fast-pass/pos-access";
import { resolveRecoveredPosSale } from "@/app/lib/fast-pass/pos-recovery";
import {
  FAST_PASS_SALE_STATE_LABELS,
  resolveFastPassSaleState,
  settingsToSaleInput,
  validateOnSiteVisitorData,
} from "@/app/lib/fast-pass/state";
import { buildTicketInsertPayload } from "@/app/lib/fast-pass/tickets";
import { sendOnSiteSaleNotification } from "@/app/lib/fast-pass/notifications";
import { generateIdempotencyKey } from "@/app/lib/fast-pass/tokens";
import { roundMoney } from "@/app/lib/programs/pricing";
import { isAuthorizedVoucherUrl } from "@/app/lib/fast-pass/vouchers";
import { formatFullDate } from "@/app/lib/formatters";
import { db } from "@/db";
import {
  festivalDates,
  festivals,
  fastPassActivations,
  fastPassDaySettings,
  fastPassEvents,
  fastPassNotificationRecipients,
  fastPassPurchaseLines,
  fastPassPurchases,
  fastPassTickets,
  fastPassTransactions,
  fastPassVouchers,
} from "@/db/schema";

const holderSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  responsibleChildCount: z
    .number()
    .int()
    .min(0)
    .max(FAST_PASS_MAX_CHILDREN_PER_ADULT),
});

const posSaleSchema = z
  .object({
    settingsId: z.number().int().positive(),
    posCredential: z.string().trim().min(1).max(200),
    paymentMethod: z.enum(["bank_qr", "cash"]),
    holders: z.array(holderSchema).min(1).max(1000),
    buyerEmail: z.string().trim().email().max(200).optional(),
    buyerPhone: z.string().trim().min(1).max(40).optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
    cashReceivedAmount: z.number().min(0).optional(),
    voucherFileUrl: z.string().trim().url().max(2000).optional(),
    voucherFileKey: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === "cash") {
      if (data.cashReceivedAmount === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["cashReceivedAmount"],
          message: "Indica el efectivo recibido",
        });
      }
    }
    if (data.voucherFileUrl && !data.voucherFileKey) {
      ctx.addIssue({
        code: "custom",
        path: ["voucherFileKey"],
        message: "Comprobante inválido",
      });
    } else if (
      data.voucherFileUrl &&
      data.voucherFileKey &&
      !isAuthorizedVoucherUrl(data.voucherFileUrl, data.voucherFileKey)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["voucherFileUrl"],
        message: "Comprobante inválido",
      });
    }
  });

export type CreateOnSiteSaleInput = z.input<typeof posSaleSchema>;

const posRecoverySchema = z.object({
  settingsId: z.number().int().positive(),
  posCredential: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type RecoveredOnSiteSale = {
  purchaseId: number;
  total: number;
  paidCount: number;
  wristbandCount: number;
};

export type RecoverOnSiteSaleResult =
  | { status: "found"; sale: RecoveredOnSiteSale }
  | { status: "absent" }
  | { status: "unknown" };

export async function recoverOnSiteSale(
  input: z.input<typeof posRecoverySchema>,
): Promise<RecoverOnSiteSaleResult> {
  const parsed = posRecoverySchema.safeParse(input);
  if (!parsed.success) return { status: "unknown" };

  const data = parsed.data;
  try {
    const blocked = await featureFlagGuard("fast_pass");
    if (blocked) return { status: "unknown" };

    const access = await resolvePosOperatorForSettings(
      data.posCredential,
      data.settingsId,
      new Date(),
    );
    if (!access.granted) return { status: "unknown" };

    const purchase = await db.query.fastPassPurchases.findFirst({
      where: and(
        eq(fastPassPurchases.idempotencyKey, data.idempotencyKey),
        eq(fastPassPurchases.settingsId, data.settingsId),
        eq(fastPassPurchases.posOperatorId, access.operator.id),
        eq(fastPassPurchases.channel, "on_site"),
      ),
      with: { lines: true },
    });
    if (!purchase) return { status: "absent" };

    const sale = resolveRecoveredPosSale(data.idempotencyKey, [
      {
        id: purchase.id,
        idempotencyKey: purchase.idempotencyKey,
        totalAmount: purchase.totalAmount,
        paidCount: purchase.lines.length,
        childCount: purchase.lines.reduce(
          (sum, line) => sum + line.responsibleChildCount,
          0,
        ),
      },
    ]);
    return sale ? { status: "found", sale } : { status: "unknown" };
  } catch (error) {
    console.error("FastPass POS sale recovery failed", {
      settingsId: data.settingsId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { status: "unknown" };
  }
}

/**
 * Atomic on-site sale: approved purchase, sale transaction, activated tickets,
 * and activations with method `on_site_sale`.
 */
export async function createOnSiteSale(input: CreateOnSiteSaleInput) {
  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const parsed = posSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa los datos de la venta",
    };
  }

  const data = parsed.data;
  const now = new Date();
  const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();
  const operatorAccess = await resolvePosOperatorForSettings(
    data.posCredential,
    data.settingsId,
    now,
  );
  if (!operatorAccess.granted) {
    return { success: false, message: "Credencial POS inválida" } as const;
  }
  const operator = operatorAccess.operator;

  try {
    const outcome = await db.transaction(async (tx) => {
      const settings = await lockDaySettings(tx, data.settingsId);
      if (!settings) {
        return { kind: "error" as const, message: "Día no encontrado" };
      }

      const existing = await tx.query.fastPassPurchases.findFirst({
        where: and(
          eq(fastPassPurchases.idempotencyKey, idempotencyKey),
          eq(fastPassPurchases.settingsId, settings.id),
          eq(fastPassPurchases.posOperatorId, operator.id),
        ),
        with: { lines: true },
      });

      if (existing) {
        const childCount = existing.lines.reduce(
          (sum, line) => sum + line.responsibleChildCount,
          0,
        );
        return {
          kind: "replayed" as const,
          purchaseId: existing.id,
          total: existing.totalAmount,
          ticketsIssued: existing.lines.length,
          wristbandCount: existing.lines.length + childCount,
        };
      }

      if (data.holders.length > settings.maxPaidPassesPerPurchase) {
        return {
          kind: "error" as const,
          message: `Máximo ${settings.maxPaidPassesPerPurchase} pases por venta`,
        };
      }

      const saleState = resolveFastPassSaleState(
        settingsToSaleInput(settings),
        "on_site",
        now,
      );
      if (!saleState.isPurchasable) {
        return {
          kind: "error" as const,
          message: FAST_PASS_SALE_STATE_LABELS[saleState.state],
        };
      }

      if (data.paymentMethod === "bank_qr" && !settings.onSiteBankQrEnabled) {
        return {
          kind: "error" as const,
          message: "QR bancario no habilitado en sitio",
        };
      }
      if (data.paymentMethod === "cash" && !settings.onSiteCashEnabled) {
        return {
          kind: "error" as const,
          message: "Efectivo no habilitado en sitio",
        };
      }

      const proofRequired = settings.onSiteProofRequired;
      const visitorRequired = settings.onSiteVisitorDetailsRequired;

      if (
        proofRequired &&
        data.paymentMethod === "bank_qr" &&
        !data.voucherFileUrl
      ) {
        return {
          kind: "error" as const,
          message: "Se requiere comprobante para esta venta",
        };
      }

      const visitorDataError = validateOnSiteVisitorData({
        required: visitorRequired,
        holders: data.holders,
        buyerEmail: data.buyerEmail,
        buyerPhone: data.buyerPhone,
      });
      if (visitorDataError) {
        return {
          kind: "error" as const,
          message:
            visitorDataError === "holder_name"
              ? "Completa el nombre de cada titular"
              : "Indica un correo o teléfono de contacto",
        };
      }

      const { availability } = await fetchDayAvailabilityInTx(
        tx,
        settings,
        now,
      );
      const demand = demandFromLines(
        data.holders.map((h) => ({
          responsibleChildCount: h.responsibleChildCount,
        })),
      );

      const reserve = canReserveGroup(availability, "on_site", demand);
      if (!reserve.allowed) {
        return {
          kind: "error" as const,
          message: "No hay cupo suficiente para esta venta",
        };
      }

      const unitPrice = settings.price;
      const total = roundMoney(unitPrice * data.holders.length);
      const cashChange =
        data.paymentMethod === "cash" && data.cashReceivedAmount !== undefined
          ? roundMoney(data.cashReceivedAmount - total)
          : null;

      if (
        data.paymentMethod === "cash" &&
        (data.cashReceivedAmount === undefined ||
          data.cashReceivedAmount < total)
      ) {
        return {
          kind: "error" as const,
          message: "El efectivo recibido es insuficiente",
        };
      }

      const [purchase] = await tx
        .insert(fastPassPurchases)
        .values({
          settingsId: settings.id,
          festivalDateId: settings.festivalDateId,
          channel: "on_site",
          status: "approved",
          paymentMethod: data.paymentMethod,
          buyerEmail: data.buyerEmail ?? null,
          buyerPhone: data.buyerPhone ?? null,
          approvedAt: now,
          subtotalAmount: total,
          totalAmount: total,
          posOperatorId: operator.id,
          onSiteProofRequiredSnapshot: proofRequired,
          onSiteVisitorDetailsRequiredSnapshot: visitorRequired,
          idempotencyKey,
        })
        .returning();

      const lineRows = await tx
        .insert(fastPassPurchaseLines)
        .values(
          data.holders.map((holder) => ({
            purchaseId: purchase.id,
            unitPrice,
            pricingSnapshot: { price: unitPrice, source: "day_settings" },
            holderFirstName: holder.firstName ?? null,
            holderLastName: holder.lastName ?? null,
            responsibleChildCount: holder.responsibleChildCount,
          })),
        )
        .returning();

      if (data.voucherFileUrl) {
        await tx.insert(fastPassVouchers).values({
          purchaseId: purchase.id,
          version: 1,
          fileUrl: data.voucherFileUrl,
          uploadedVia: "pos_operator",
          uploadedByPosOperatorId: operator.id,
        });
      }

      const [saleTx] = await tx
        .insert(fastPassTransactions)
        .values({
          purchaseId: purchase.id,
          type: "sale",
          amount: total,
          paymentMethod: data.paymentMethod,
          posOperatorId: operator.id,
          ...(data.paymentMethod === "cash"
            ? {
                cashReceivedAmount: data.cashReceivedAmount!,
                cashChangeAmount: cashChange!,
              }
            : {}),
        })
        .returning();

      const ticketPayloads = lineRows.map((line) =>
        buildTicketInsertPayload(line, settings.festivalDateId, {
          status: "activated",
          now,
        }),
      );

      const ticketRows = await tx
        .insert(fastPassTickets)
        .values(ticketPayloads)
        .onConflictDoNothing({ target: fastPassTickets.purchaseLineId })
        .returning({ id: fastPassTickets.id });

      if (ticketRows.length > 0) {
        await tx
          .insert(fastPassActivations)
          .values(
            ticketRows.map((ticket) => ({
              ticketId: ticket.id,
              festivalDateId: settings.festivalDateId,
              method: "on_site_sale" as const,
              posOperatorId: operator.id,
            })),
          )
          .onConflictDoNothing({ target: fastPassActivations.ticketId });
      }

      const ticketsIssued = lineRows.length;

      await tx.insert(fastPassEvents).values([
        {
          purchaseId: purchase.id,
          actorType: "pos_operator",
          posOperatorId: operator.id,
          eventType: "on_site_sale",
          toStatus: "approved",
          changes: {
            paidCount: data.holders.length,
            priorityCount: demand.priorityCount,
            ticketsIssued,
          },
        },
        {
          purchaseId: purchase.id,
          actorType: "pos_operator",
          posOperatorId: operator.id,
          eventType: "sale_transaction",
          changes: { transactionId: saleTx.id, amount: total },
        },
      ]);

      await touchPosOperatorLastUsed(operator.id, now, tx);

      const recipients = settings.notifyOnSale
        ? await tx
            .select({ email: fastPassNotificationRecipients.email })
            .from(fastPassNotificationRecipients)
            .where(eq(fastPassNotificationRecipients.settingsId, settings.id))
        : [];

      return {
        kind: "created" as const,
        purchaseId: purchase.id,
        total,
        ticketsIssued,
        wristbandCount: demand.priorityCount,
        childCount: demand.childCount,
        saleTransactionId: saleTx.id,
        sellerName: operator.displayName,
        festivalDay: settings.festivalDateId,
        notificationEmails: recipients.map((recipient) => recipient.email),
        paymentMethod: data.paymentMethod,
        hasProof: Boolean(data.voucherFileUrl),
        occurredAt: now,
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    if (outcome.kind === "replayed") {
      return {
        success: true,
        message: "Esta venta ya se registró",
        purchaseId: outcome.purchaseId,
        total: outcome.total,
        ticketsIssued: outcome.ticketsIssued,
        wristbandCount: outcome.wristbandCount,
        replayed: true,
      } as const;
    }

    revalidatePath("/dashboard/festivals", "layout");

    if (outcome.notificationEmails.length > 0) {
      try {
        const [festivalDate] = await db
          .select({
            startDate: festivalDates.startDate,
            festivalType: festivals.festivalType,
          })
          .from(festivalDates)
          .innerJoin(festivals, eq(festivals.id, festivalDates.festivalId))
          .where(eq(festivalDates.id, outcome.festivalDay))
          .limit(1);
        const sent = await sendOnSiteSaleNotification({
          recipients: outcome.notificationEmails,
          purchaseId: outcome.purchaseId,
          transactionId: outcome.saleTransactionId,
          festivalDayLabel: festivalDate
            ? formatFullDate(festivalDate.startDate)
            : "Día de festival",
          amount: outcome.total,
          paymentMethodLabel:
            FAST_PASS_PAYMENT_METHOD_LABELS[outcome.paymentMethod],
          paidCount: outcome.ticketsIssued,
          childCount: outcome.childCount,
          sellerName: outcome.sellerName,
          occurredAt: outcome.occurredAt,
          hasProof: outcome.hasProof,
          festivalType: festivalDate?.festivalType ?? "glitter",
        });
        if (!sent) {
          await db.insert(fastPassEvents).values({
            purchaseId: outcome.purchaseId,
            actorType: "system",
            eventType: "notification_failed",
            changes: { notification: "on_site_sale" },
          });
        }
      } catch (error) {
        console.error("FastPass POS sale notification failed", {
          purchaseId: outcome.purchaseId,
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }

    return {
      success: true,
      message: "Venta registrada",
      purchaseId: outcome.purchaseId,
      total: outcome.total,
      ticketsIssued: outcome.ticketsIssued,
      wristbandCount: outcome.wristbandCount,
    } as const;
  } catch (error) {
    console.error("FastPass POS sale failed", {
      settingsId: data.settingsId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos registrar la venta. Intenta de nuevo.",
    };
  }
}

export type FastPassPosContext = {
  settingsId: number;
  operatorName: string;
  festivalDateLabel: string;
  price: number;
  remainingPaid: number;
  remainingPriority: number;
  onSiteBankQrEnabled: boolean;
  onSiteCashEnabled: boolean;
  onSiteProofRequired: boolean;
  onSiteVisitorDetailsRequired: boolean;
  recentSales: {
    id: number;
    totalAmount: number;
    paidCount: number;
    childCount: number;
    idempotencyKey: string;
    createdAt: Date;
  }[];
};

export async function fetchFastPassPosContext(
  credential: string,
): Promise<FastPassPosContext | null> {
  const access = await resolvePosOperatorByCredential(credential);
  if (!access.granted) return null;

  const settings = await db.query.fastPassDaySettings.findFirst({
    where: eq(fastPassDaySettings.id, access.operator.settingsId),
    with: { festivalDate: true },
  });
  if (!settings) return null;

  const day = await fetchDayAvailability(settings.id);
  if (!day) return null;

  const recent = await db.query.fastPassPurchases.findMany({
    where: and(
      eq(fastPassPurchases.settingsId, settings.id),
      eq(fastPassPurchases.posOperatorId, access.operator.id),
      eq(fastPassPurchases.channel, "on_site"),
      eq(fastPassPurchases.status, "approved"),
    ),
    with: { lines: true },
    orderBy: [desc(fastPassPurchases.createdAt)],
    limit: 10,
  });

  return {
    settingsId: settings.id,
    operatorName: access.operator.displayName,
    festivalDateLabel: formatFullDate(settings.festivalDate.startDate),
    price: settings.price,
    remainingPaid: Math.min(
      day.availability.remainingPaid,
      day.availability.remainingOnSitePaid,
    ),
    remainingPriority: Math.min(
      day.availability.remainingPriority,
      day.availability.remainingOnSitePriority,
    ),
    onSiteBankQrEnabled: settings.onSiteBankQrEnabled,
    onSiteCashEnabled: settings.onSiteCashEnabled,
    onSiteProofRequired: settings.onSiteProofRequired,
    onSiteVisitorDetailsRequired: settings.onSiteVisitorDetailsRequired,
    recentSales: recent.map((purchase) => ({
      id: purchase.id,
      totalAmount: purchase.totalAmount,
      paidCount: purchase.lines.length,
      childCount: purchase.lines.reduce(
        (sum, line) => sum + line.responsibleChildCount,
        0,
      ),
      idempotencyKey: purchase.idempotencyKey,
      createdAt: purchase.createdAt,
    })),
  };
}
