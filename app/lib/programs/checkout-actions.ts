"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { getBuyerEligibility } from "@/app/lib/programs/eligibility-queries";
import {
  fetchOccurrenceAvailability,
  hasValidTicketFor,
  lockOccurrences,
} from "@/app/lib/programs/inventory-queries";
import {
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
} from "@/app/lib/programs/pricing";
import {
  REGISTRATION_BLOCKER_LABELS,
  resolveAttendeeIdentity,
  resolveRegistrationCheck,
} from "@/app/lib/programs/registration";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import {
  generateAccessToken,
  generateIdempotencyKey,
  hashAccessToken,
} from "@/app/lib/programs/tokens";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSettings,
  programSessions,
  programs,
  sessionOccurrences,
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchases,
} from "@/db/schema";

const checkoutSchema = z.object({
  occurrenceId: z.number().int().positive(),
  /** Required for guests, forbidden for signed-in buyers (server decides). */
  guestName: z.string().trim().min(1).max(200).optional(),
  guestEmail: z.string().trim().email().max(200).optional(),
  guestPhone: z.string().trim().min(1).max(40).optional(),
  /** Collected only from buyers with no account, as in free registration. */
  guestGender: z
    .enum(["male", "female", "non_binary", "other", "undisclosed"])
    .optional(),
  guestBirthdate: z.coerce.date().optional(),
  /** PRD §12.1: the no-refund policy needs an explicit acknowledgement. */
  acceptsNoRefundPolicy: z.literal(true),
  /** Supplied by the client so a double submit cannot take two seats. */
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export type PaidCheckoutInput = z.input<typeof checkoutSchema>;

export type PaidCheckoutResult =
  | {
      success: true;
      message: string;
      purchaseId: number;
      /** Raw token — returned once, never stored. */
      accessToken: string;
      /** Deadline for uploading the voucher; the seat is released after it. */
      holdExpiresAt: Date;
      totalAmount: number;
    }
  | { success: false; message: string };

/**
 * Starts a paid single-session purchase: reserves the seat, opens the hold, and
 * leaves the purchase in `pending_upload` awaiting a voucher.
 *
 * No ticket and no QR are issued here. That happens only on approval, which is
 * what keeps "ticket issuance and delivery only after approval" (roadmap
 * Phase 3) true by construction rather than by convention.
 *
 * Everything that decides the outcome is re-evaluated inside the transaction,
 * after the occurrence row is locked, so a page rendered ten minutes ago cannot
 * carry a stale price, audience, or seat count past these checks.
 *
 * Free sessions are refused: they have no hold and no voucher, and routing one
 * through here would create a purchase demanding payment of zero.
 */
export async function startPaidCheckout(
  input: PaidCheckoutInput,
): Promise<PaidCheckoutResult> {
  const blocked = await featureFlagGuard("paid_programs");
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
  const profile = await getCurrentUserProfile();

  const buyer = resolveAttendeeIdentity(
    profile,
    profile
      ? null
      : data.guestName && data.guestEmail
        ? { name: data.guestName, email: data.guestEmail }
        : null,
  );

  if (!buyer) {
    return {
      success: false,
      message: "Necesitamos tu nombre y correo para continuar",
    };
  }

  if (!profile && !data.guestPhone) {
    return { success: false, message: "Necesitamos un teléfono de contacto" };
  }

  if (!profile && (!data.guestGender || !data.guestBirthdate)) {
    return {
      success: false,
      message: "Necesitamos tu fecha de nacimiento y género",
    };
  }

  if (data.guestBirthdate && data.guestBirthdate > new Date()) {
    return {
      success: false,
      message: "La fecha de nacimiento no puede ser en el futuro",
    };
  }

  const now = new Date();
  const { eligibility, snapshot } = await getBuyerEligibility(profile, { now });
  const idempotencyKey = data.idempotencyKey ?? generateIdempotencyKey();

  // Generated outside the transaction so a retry never reuses a token that a
  // rolled-back attempt already handed to someone.
  const accessToken = generateAccessToken();

  try {
    const outcome = await db.transaction(async (tx) => {
      const buyerPredicate = profile
        ? eq(sessionPurchases.userId, profile.id)
        : eq(sessionPurchases.guestEmail, buyer.email);

      const existing = await tx
        .select({ id: sessionPurchases.id })
        .from(sessionPurchases)
        .innerJoin(
          sessionPurchaseLines,
          eq(sessionPurchaseLines.purchaseId, sessionPurchases.id),
        )
        .where(
          and(
            eq(sessionPurchases.idempotencyKey, idempotencyKey),
            buyerPredicate,
            eq(sessionPurchaseLines.occurrenceId, data.occurrenceId),
          ),
        )
        .limit(1);

      // A retried submit returns what the first one produced rather than
      // opening a second hold. The token is not recoverable, so the caller has
      // to fall back to the recovery flow for the link.
      if (existing.length > 0) {
        return { kind: "replayed" as const };
      }

      await lockOccurrences(tx, [data.occurrenceId]);

      const [context] = await tx
        .select({
          occurrence: sessionOccurrences,
          session: programSessions,
          program: programs,
        })
        .from(sessionOccurrences)
        .innerJoin(
          programSessions,
          eq(programSessions.id, sessionOccurrences.sessionId),
        )
        .innerJoin(programs, eq(programs.id, programSessions.programId))
        .where(eq(sessionOccurrences.id, data.occurrenceId))
        .limit(1);

      if (!context) {
        return { kind: "error" as const, message: "Horario no encontrado" };
      }

      const [settings] = await tx
        .select()
        .from(programSettings)
        .where(eq(programSettings.key, "global"))
        .limit(1);

      if (!settings) {
        return {
          kind: "error" as const,
          message: "Falta la configuración de programas",
        };
      }

      const occurrenceState = resolveOccurrenceState(
        {
          programStatus: context.program.status,
          sessionStatus: context.session.status,
          lifecycleStatus: context.occurrence.lifecycleStatus,
          salesStartAt: context.occurrence.salesStartAt,
          salesEndAt: context.occurrence.salesEndAt,
          salesClosedAt: context.occurrence.salesClosedAt,
          rescheduledAt: context.occurrence.rescheduledAt,
        },
        now,
      );

      const price = resolvePrice(
        {
          publicPrice: context.session.publicPrice,
          participantPrice: context.session.participantPrice,
          programDiscount: programDiscountFrom(context.program),
          globalDiscount: globalDiscountFrom(settings),
        },
        eligibility,
      );

      const [availability, hasExistingTicket] = await Promise.all([
        fetchOccurrenceAvailability(tx, data.occurrenceId, { now }),
        hasValidTicketFor(tx, data.occurrenceId, buyer),
      ]);

      const check = resolveRegistrationCheck({
        occurrenceState,
        audience: context.session.audience,
        eligibility,
        price: price.amount,
        availability,
        hasExistingTicket,
        mode: "paid",
      });

      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: REGISTRATION_BLOCKER_LABELS[check.blocker],
        };
      }

      // Program override first, global default second — the same resolution
      // order the architecture defines for every program-scoped setting.
      const holdMinutes =
        context.program.holdMinutes ?? settings.defaultHoldMinutes;
      const holdExpiresAt = new Date(now.getTime() + holdMinutes * 60_000);

      const [purchase] = await tx
        .insert(sessionPurchases)
        .values({
          programId: context.program.id,
          userId: profile?.id ?? null,
          guestName: profile ? null : (data.guestName ?? null),
          guestEmail: profile ? null : (data.guestEmail ?? null),
          guestPhone: profile ? null : (data.guestPhone ?? null),
          guestGender: profile ? null : (data.guestGender ?? null),
          guestBirthdate:
            profile || !data.guestBirthdate
              ? null
              : data.guestBirthdate.toISOString().slice(0, 10),
          accessTokenHash: hashAccessToken(accessToken),
          status: "pending_upload",
          paymentMode: "bank_qr",
          buyerEligibility: eligibility,
          eligibilityEvaluatedAt: now,
          eligibilitySnapshot: snapshot,
          subtotalAmount: price.amount,
          totalAmount: price.amount,
          holdExpiresAt,
          noRefundPolicyVersion: settings.noRefundPolicyVersion,
          noRefundPolicyAcceptedAt: now,
          idempotencyKey,
        })
        .returning();

      await tx.insert(sessionPurchaseLines).values({
        purchaseId: purchase.id,
        occurrenceId: context.occurrence.id,
        sessionId: context.session.id,
        source: "individual_session",
        unitPrice: price.amount,
        priceBasis: price.basis,
        pricingSnapshot: price.snapshot,
        sessionTitleSnapshot: context.session.title,
        occurrenceStartsAtSnapshot: context.occurrence.startsAt,
      });

      await tx.insert(sessionPurchaseEvents).values({
        purchaseId: purchase.id,
        actorType: "buyer",
        actorUserId: profile?.id ?? null,
        eventType: "created",
        toStatus: "pending_upload",
        changes: { holdExpiresAt: holdExpiresAt.toISOString(), holdMinutes },
      });

      return {
        kind: "created" as const,
        purchaseId: purchase.id,
        holdExpiresAt,
        totalAmount: price.amount,
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/programs", "layout");
    revalidatePath("/dashboard/programs", "layout");

    if (outcome.kind === "replayed") {
      return {
        success: false,
        message: "Esta compra ya se registró. Revisa tu correo.",
      };
    }

    return {
      success: true,
      message: "Reservamos tu cupo. Sube tu comprobante para confirmarlo.",
      purchaseId: outcome.purchaseId,
      accessToken,
      holdExpiresAt: outcome.holdExpiresAt,
      totalAmount: outcome.totalAmount,
    };
  } catch (error) {
    // Never log the raw error: it can carry driver details and the buyer's
    // own data. The message is generic for the same reason.
    console.error("Paid checkout failed", {
      occurrenceId: data.occurrenceId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos iniciar tu compra. Intenta de nuevo.",
    };
  }
}
