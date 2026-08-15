"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  canReserveGroup,
  demandFromLines,
} from "@/app/lib/fast-pass/availability";
import {
  FAST_PASS_MAX_CHILDREN_PER_ADULT,
  FAST_PASS_POLICY_VERSION,
} from "@/app/lib/fast-pass/definitions";
import {
  fetchDayAvailabilityInTx,
  lockDaySettings,
} from "@/app/lib/fast-pass/inventory-queries";
import {
  buildDayLabel,
  sendCheckoutSecureLinkEmail,
} from "@/app/lib/fast-pass/notifications";
import {
  FAST_PASS_SALE_STATE_LABELS,
  holdExpiresAtFromNow,
  resolveFastPassSaleState,
  settingsToSaleInput,
} from "@/app/lib/fast-pass/state";
import {
  generateAccessToken,
  generateIdempotencyKey,
  hashAccessToken,
} from "@/app/lib/fast-pass/tokens";
import { roundMoney } from "@/app/lib/programs/pricing";
import { claimRateLimit } from "@/app/lib/rate-limit";
import { db } from "@/db";
import {
  fastPassEvents,
  fastPassPurchaseLines,
  fastPassPurchases,
  festivalDates,
  festivals,
} from "@/db/schema";

const holderSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(1).max(40),
  gender: z.enum(["male", "female", "non_binary", "other", "undisclosed"]),
  birthdate: z.coerce.date(),
  responsibleChildCount: z
    .number()
    .int()
    .min(0)
    .max(FAST_PASS_MAX_CHILDREN_PER_ADULT),
});

const checkoutSchema = z
  .object({
    festivalDateId: z.number().int().positive(),
    buyerName: z.string().trim().min(1).max(200),
    buyerEmail: z.string().trim().email().max(200),
    buyerPhone: z.string().trim().min(1).max(40),
    holders: z.array(holderSchema).min(1).max(1000),
    acceptsPolicy: z.literal(true),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .superRefine((data, ctx) => {
    for (const [index, holder] of data.holders.entries()) {
      if (holder.birthdate > new Date()) {
        ctx.addIssue({
          code: "custom",
          path: ["holders", index, "birthdate"],
          message: "La fecha de nacimiento no puede ser en el futuro",
        });
      }
      const cutoff = new Date();
      cutoff.setHours(23, 59, 59, 999);
      cutoff.setFullYear(cutoff.getFullYear() - 11);
      if (holder.birthdate > cutoff) {
        ctx.addIssue({
          code: "custom",
          path: ["holders", index, "birthdate"],
          message: "Cada titular debe tener 11 años o más",
        });
      }
    }
  });

export type FastPassCheckoutInput = z.input<typeof checkoutSchema>;

export type FastPassCheckoutResult =
  | {
      success: true;
      message: string;
      purchaseId: number;
      accessToken: string;
      holdExpiresAt: Date;
      totalAmount: number;
    }
  | { success: false; message: string };

const RESERVE_BLOCKER_LABELS = {
  no_demand: "Agrega al menos un titular",
  paid_inventory: "No hay suficientes Pases Rápidos disponibles",
  priority_capacity: "No hay suficiente capacidad de acceso prioritario",
  channel_paid_allocation: "No hay cupo online para más Pases Rápidos",
  channel_priority_allocation:
    "No hay cupo online para más personas con acceso prioritario",
} as const;

const CHECKOUT_COOLDOWN_MS = 5 * 60_000;
const CHECKOUT_RATE_LIMIT_RESPONSE = {
  success: false as const,
  message: "Demasiados intentos. Intenta de nuevo en unos minutos.",
};

function cooldownKey(scope: "email" | "ip", identifier: string): string {
  const digest = createHash("sha256").update(identifier).digest("hex");
  return `fast-pass-checkout:${scope}:${digest}`;
}

function claimCooldown(
  scope: "email" | "ip",
  identifier: string,
): Promise<boolean> {
  return claimRateLimit(cooldownKey(scope, identifier), CHECKOUT_COOLDOWN_MS);
}

async function getClientIp(): Promise<string | null> {
  const requestHeaders = await headers();
  const candidates = [
    requestHeaders.get("x-real-ip"),
    requestHeaders.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return null;
}

/**
 * Starts an online guest FastPass purchase: reserves capacity, opens the hold,
 * and leaves the purchase in `pending_upload` awaiting a voucher.
 */
export async function startFastPassCheckout(
  input: FastPassCheckoutInput,
): Promise<FastPassCheckoutResult> {
  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa los datos del formulario",
    };
  }

  const data = parsed.data;
  const normalizedBuyerEmail = data.buyerEmail.toLowerCase();
  const now = new Date();
  const accessToken = generateAccessToken();
  const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();

  try {
    const clientIp = await getClientIp();
    if (clientIp && !(await claimCooldown("ip", clientIp))) {
      return CHECKOUT_RATE_LIMIT_RESPONSE;
    }
    if (!(await claimCooldown("email", normalizedBuyerEmail))) {
      return CHECKOUT_RATE_LIMIT_RESPONSE;
    }

    const outcome = await db.transaction(async (tx) => {
      const [festivalDate] = await tx
        .select({
          id: festivalDates.id,
          startDate: festivalDates.startDate,
          festivalType: festivals.festivalType,
          settingsId: sql<number | null>`(
            SELECT s.id FROM fast_pass_day_settings s
            WHERE s.festival_date_id = ${festivalDates.id}
            LIMIT 1
          )`,
        })
        .from(festivalDates)
        .innerJoin(festivals, eq(festivals.id, festivalDates.festivalId))
        .where(eq(festivalDates.id, data.festivalDateId))
        .limit(1);

      if (!festivalDate?.settingsId) {
        return { kind: "error" as const, message: "Día no encontrado" };
      }

      const settings = await lockDaySettings(tx, festivalDate.settingsId);
      if (!settings) {
        return { kind: "error" as const, message: "Día no encontrado" };
      }

      const existing = await tx
        .select({ id: fastPassPurchases.id })
        .from(fastPassPurchases)
        .where(
          and(
            eq(fastPassPurchases.idempotencyKey, idempotencyKey),
            sql`lower(${fastPassPurchases.buyerEmail}) = lower(${data.buyerEmail})`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return { kind: "replayed" as const };
      }

      if (data.holders.length > settings.maxPaidPassesPerPurchase) {
        return {
          kind: "error" as const,
          message: `Puedes comprar hasta ${settings.maxPaidPassesPerPurchase} pases por compra`,
        };
      }

      const saleState = resolveFastPassSaleState(
        settingsToSaleInput(settings),
        "online",
        now,
      );

      if (!saleState.isPurchasable) {
        return {
          kind: "error" as const,
          message: FAST_PASS_SALE_STATE_LABELS[saleState.state],
        };
      }

      const { availability } = await fetchDayAvailabilityInTx(
        tx,
        settings,
        now,
      );
      const demand = demandFromLines(
        data.holders.map((holder) => ({
          responsibleChildCount: holder.responsibleChildCount,
        })),
      );

      const reserve = canReserveGroup(availability, "online", demand);
      if (!reserve.allowed) {
        return {
          kind: "error" as const,
          message: RESERVE_BLOCKER_LABELS[reserve.blocker],
        };
      }

      const unitPrice = settings.price;
      const subtotal = roundMoney(unitPrice * data.holders.length);
      const holdExpiresAt = holdExpiresAtFromNow(now);

      const [purchase] = await tx
        .insert(fastPassPurchases)
        .values({
          settingsId: settings.id,
          festivalDateId: data.festivalDateId,
          channel: "online",
          status: "pending_upload",
          paymentMethod: "bank_qr",
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          buyerPhone: data.buyerPhone,
          accessTokenHash: hashAccessToken(accessToken),
          subtotalAmount: subtotal,
          totalAmount: subtotal,
          holdExpiresAt,
          policyVersion: FAST_PASS_POLICY_VERSION,
          policyAcceptedAt: now,
          idempotencyKey,
        })
        .returning();

      await tx.insert(fastPassPurchaseLines).values(
        data.holders.map((holder) => ({
          purchaseId: purchase.id,
          unitPrice,
          pricingSnapshot: { price: unitPrice, source: "day_settings" },
          holderFirstName: holder.firstName,
          holderLastName: holder.lastName,
          holderEmail: holder.email,
          holderPhone: holder.phone,
          holderGender: holder.gender,
          holderBirthdate: holder.birthdate.toISOString().slice(0, 10),
          responsibleChildCount: holder.responsibleChildCount,
        })),
      );

      await tx.insert(fastPassEvents).values({
        purchaseId: purchase.id,
        actorType: "buyer",
        eventType: "purchase_created",
        toStatus: "pending_upload",
        changes: {
          holdExpiresAt: holdExpiresAt.toISOString(),
          paidCount: data.holders.length,
          priorityCount: demand.priorityCount,
        },
      });

      return {
        kind: "created" as const,
        purchaseId: purchase.id,
        holdExpiresAt,
        totalAmount: subtotal,
        festivalDay: festivalDate.startDate,
        festivalType: festivalDate.festivalType,
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    if (outcome.kind === "replayed") {
      return {
        success: false,
        message: "Esta compra ya se registró. Revisa tu correo.",
      };
    }

    revalidatePath("/festivals", "layout");

    try {
      const sent = await sendCheckoutSecureLinkEmail({
        purchaseId: outcome.purchaseId,
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        festivalDayLabel: buildDayLabel(outcome.festivalDay),
        holdExpiresAt: outcome.holdExpiresAt,
        totalAmount: outcome.totalAmount,
        accessToken,
        festivalType: outcome.festivalType,
      });
      if (!sent) {
        await db.insert(fastPassEvents).values({
          purchaseId: outcome.purchaseId,
          actorType: "system",
          eventType: "notification_failed",
          changes: { notification: "checkout_secure_link" },
        });
      }
    } catch (error) {
      console.error("FastPass checkout email failed", {
        purchaseId: outcome.purchaseId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }

    return {
      success: true,
      message:
        "Reservamos tu Pase Rápido. Sube tu comprobante para confirmarlo.",
      purchaseId: outcome.purchaseId,
      accessToken,
      holdExpiresAt: outcome.holdExpiresAt,
      totalAmount: outcome.totalAmount,
    };
  } catch (error) {
    console.error("FastPass checkout failed", {
      festivalDateId: data.festivalDateId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos iniciar tu compra. Intenta de nuevo.",
    };
  }
}

const recoverSchema = z.object({
  email: z.string().trim().email().max(200),
  purchaseId: z.number().int().positive(),
});

const RECOVERY_ROTATION_LIMIT = 5;

/**
 * Rotates the secure access token and emails a fresh link. Always returns a
 * generic success message so the endpoint cannot be used to enumerate purchases.
 */
export async function recoverFastPassPurchaseLink(input: {
  email: string;
  purchaseId: number;
}): Promise<
  { success: true; message: string } | { success: false; message: string }
> {
  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const parsed = recoverSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Revisa el correo y el número de compra",
    };
  }

  const genericSuccess = {
    success: true as const,
    message:
      "Si encontramos una compra con esos datos, te enviamos un enlace seguro.",
  };

  const data = parsed.data;
  const normalizedEmail = data.email.toLowerCase();

  try {
    const clientIp = await getClientIp();
    if (clientIp) {
      const ipAllowed = await claimCooldown("ip", clientIp);
      if (!ipAllowed) return genericSuccess;
    }

    const [matchingPurchase] = await db
      .select({ id: fastPassPurchases.id })
      .from(fastPassPurchases)
      .where(
        and(
          eq(fastPassPurchases.id, data.purchaseId),
          eq(fastPassPurchases.channel, "online"),
          sql`lower(${fastPassPurchases.buyerEmail}) = ${normalizedEmail}`,
        ),
      )
      .limit(1);
    if (!matchingPurchase) return genericSuccess;

    const emailAllowed = await claimCooldown("email", normalizedEmail);
    if (!emailAllowed) return genericSuccess;

    const accessToken = generateAccessToken();
    const now = new Date();

    const purchase = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: fastPassPurchases.id,
          buyerName: fastPassPurchases.buyerName,
          buyerEmail: fastPassPurchases.buyerEmail,
          holdExpiresAt: fastPassPurchases.holdExpiresAt,
          totalAmount: fastPassPurchases.totalAmount,
          festivalDay: festivalDates.startDate,
          festivalType: festivals.festivalType,
        })
        .from(fastPassPurchases)
        .innerJoin(
          festivalDates,
          eq(festivalDates.id, fastPassPurchases.festivalDateId),
        )
        .innerJoin(festivals, eq(festivals.id, festivalDates.festivalId))
        .where(
          and(
            eq(fastPassPurchases.id, matchingPurchase.id),
            eq(fastPassPurchases.channel, "online"),
            sql`lower(${fastPassPurchases.buyerEmail}) = lower(${data.email})`,
          ),
        )
        .limit(1)
        .for("update");

      if (!row?.buyerEmail || !row.buyerName) {
        return null;
      }

      const [rotationBudget] = await tx
        .select({ used: sql<number>`count(*)::int` })
        .from(fastPassEvents)
        .where(
          and(
            eq(fastPassEvents.purchaseId, row.id),
            eq(fastPassEvents.eventType, "link_resent"),
          ),
        );
      if ((rotationBudget?.used ?? 0) >= RECOVERY_ROTATION_LIMIT) {
        return null;
      }

      await tx
        .update(fastPassPurchases)
        .set({
          accessTokenHash: hashAccessToken(accessToken),
          accessTokenRevokedAt: null,
          updatedAt: now,
        })
        .where(eq(fastPassPurchases.id, row.id));

      await tx.insert(fastPassEvents).values({
        purchaseId: row.id,
        actorType: "buyer",
        eventType: "link_resent",
        changes: { recoveredAt: now.toISOString() },
      });

      return row;
    });

    if (purchase) {
      const sent = await sendCheckoutSecureLinkEmail({
        purchaseId: purchase.id,
        buyerName: purchase.buyerName!,
        buyerEmail: purchase.buyerEmail!,
        festivalDayLabel: buildDayLabel(purchase.festivalDay),
        holdExpiresAt: purchase.holdExpiresAt ?? now,
        totalAmount: purchase.totalAmount,
        accessToken,
        // Keyed to this rotation so the resend is not deduped as a replay.
        deliveryKey: `rotated-${now.toISOString()}`,
        festivalType: purchase.festivalType,
      });
      if (!sent) {
        await db.insert(fastPassEvents).values({
          purchaseId: purchase.id,
          actorType: "system",
          eventType: "notification_failed",
          changes: { notification: "recovered_secure_link" },
        });
      }
    }

    return genericSuccess;
  } catch (error) {
    console.error("FastPass link recovery failed", {
      purchaseId: data.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return genericSuccess;
  }
}
