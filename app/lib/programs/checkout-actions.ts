"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { lockOrder } from "@/app/lib/programs/inventory";
import { getBuyerEligibility } from "@/app/lib/programs/eligibility-queries";
import { sendFreeRegistrationEmail } from "@/app/lib/programs/notifications";
import {
  fetchAvailabilityForOccurrences,
  hasValidTicketFor,
  lockOccurrences,
} from "@/app/lib/programs/inventory-queries";
import {
  fetchPromoConsumingUses,
  lockProgramPromoCode,
} from "@/app/lib/programs/promo-code-queries";
import {
  buildProgramPriceSnapshot,
  isValidPromoCodeFormat,
  normalizePromoCode,
  resolvePromoCodeValidity,
  resolvePromoPrice,
} from "@/app/lib/programs/promo-codes";
import {
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
  roundMoney,
} from "@/app/lib/programs/pricing";
import {
  REGISTRATION_BLOCKER_LABELS,
  resolveAttendeeIdentity,
  resolveRegistrationCheck,
} from "@/app/lib/programs/registration";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import { resolveInvitationUse } from "@/app/lib/programs/waitlist";
import {
  generateAccessToken,
  generateIdempotencyKey,
  generateTicketCode,
  hashAccessToken,
} from "@/app/lib/programs/tokens";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSettings,
  programPromoCodeRedemptions,
  programSessions,
  programs,
  sessionOccurrences,
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchases,
  sessionTickets,
  sessionWaitlistEntries,
  sessionWaitlistInvitations,
  venues,
} from "@/db/schema";

/** A cart is capped so one submit cannot lock an unbounded row set. */
const MAX_CART_LINES = 10;

const checkoutSchema = z
  .object({
    /** Preferred. `occurrenceId` remains for single-session callers. */
    occurrenceIds: z.array(z.number().int().positive()).optional(),
    occurrenceId: z.number().int().positive().optional(),
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
    /**
     * A waitlist invitation token. Grants capacity for exactly one seat in the
     * occurrence it was issued for, and nothing else.
     */
    invitationToken: z.string().trim().min(1).max(200).optional(),
    promoCode: z.string().trim().max(64).optional(),
    /** Required when the promo price is higher than the existing price. */
    acceptsHigherPromoPrice: z.boolean().optional(),
  })
  .transform((value) => ({
    ...value,
    // Deduped and ordered here so the lock order, the line order, and the
    // replay lookup all see the same set regardless of how it was submitted.
    occurrenceIds: lockOrder([
      ...(value.occurrenceIds ?? []),
      ...(value.occurrenceId === undefined ? [] : [value.occurrenceId]),
    ]),
  }))
  .refine((value) => value.occurrenceIds.length > 0, {
    path: ["occurrenceIds"],
    message: "Elige al menos un horario",
  })
  .refine((value) => value.occurrenceIds.length <= MAX_CART_LINES, {
    path: ["occurrenceIds"],
    message: `Puedes llevar hasta ${MAX_CART_LINES} sesiones por compra`,
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
      holdExpiresAt: Date | null;
      totalAmount: number;
      paymentMode: "bank_qr" | "free";
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
 * Catalog-free sessions are refused and use the dedicated registration action.
 * A paid session whose accepted promo floors to zero stays here: it creates an
 * approved free-mode purchase and issues its ticket atomically.
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
  const requestedPromoCode = data.promoCode?.trim()
    ? normalizePromoCode(data.promoCode)
    : null;
  if (requestedPromoCode && !isValidPromoCodeFormat(requestedPromoCode)) {
    return {
      success: false,
      message: "Este código no está disponible para esta sesión",
    };
  }
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
  const idempotencyKey = data.idempotencyKey ?? generateIdempotencyKey();

  // Generated outside the transaction so a retry never reuses a token that a
  // rolled-back attempt already handed to someone.
  const accessToken = generateAccessToken();

  const runCheckoutTransaction = async () => {
    // This reads the database for a signed-in buyer (ban sanctions in effect),
    // so it stays inside the guarded transactional phase.
    const { eligibility, snapshot } = await getBuyerEligibility(profile, {
      now,
    });

    const outcome = await db.transaction(async (tx) => {
      /**
       * Locked before the replay lookup, not after. Two retries carrying the
       * same key would otherwise both read an empty result, both proceed, and
       * the loser would die on the `idempotencyKey` unique index — surfacing
       * as a generic failure instead of a clean `replayed`. Taking the lock
       * first makes the second attempt wait, then read committed state.
       */
      await lockOccurrences(tx, data.occurrenceIds);

      const buyerPredicate = profile
        ? eq(sessionPurchases.userId, profile.id)
        : // Case-insensitive, matching `hasValidTicketFor`. Without it the same
          // guest retrying with a differently-cased address reads as a new
          // buyer here but a duplicate there.
          sql`lower(${sessionPurchases.guestEmail}) = lower(${buyer.email})`;

      // Keyed on the idempotency key alone (plus the buyer, as defence in
      // depth): the key identifies the whole cart, so joining to a single line
      // would miss a replay whose first line differs.
      const existing = await tx
        .select({ id: sessionPurchases.id })
        .from(sessionPurchases)
        .where(
          and(
            eq(sessionPurchases.idempotencyKey, idempotencyKey),
            buyerPredicate,
          ),
        )
        .limit(1);

      // A retried submit returns what the first one produced rather than
      // opening a second hold. The token is not recoverable, so the caller has
      // to fall back to the recovery flow for the link.
      if (existing.length > 0) {
        return { kind: "replayed" as const };
      }

      const contexts = await tx
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
        .where(inArray(sessionOccurrences.id, data.occurrenceIds));

      if (contexts.length !== data.occurrenceIds.length) {
        return { kind: "error" as const, message: "Horario no encontrado" };
      }

      /**
       * A purchase carries a single `programId`, so a cart cannot span
       * programs. Rejecting here keeps that column honest rather than silently
       * attributing the whole purchase to whichever program came back first.
       */
      const programId = contexts[0].program.id;
      if (contexts.some((entry) => entry.program.id !== programId)) {
        return {
          kind: "error" as const,
          message: "Solo puedes comprar sesiones de un mismo programa a la vez",
        };
      }

      const context = contexts[0];

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

      const promoCode = requestedPromoCode
        ? await lockProgramPromoCode(tx, programId, requestedPromoCode)
        : null;

      if (requestedPromoCode && !promoCode) {
        return {
          kind: "error" as const,
          message: "Este código no está disponible para esta sesión",
        };
      }

      if (promoCode) {
        const consumingUses = await fetchPromoConsumingUses(
          tx,
          promoCode.id,
          now,
        );
        const validity = resolvePromoCodeValidity(
          { ...promoCode, consumingUses },
          now,
        );
        if (!validity.allowed) {
          return {
            kind: "error" as const,
            message: "Este código no está disponible para esta sesión",
          };
        }
      }

      const availabilityByOccurrence = await fetchAvailabilityForOccurrences(
        tx,
        data.occurrenceIds,
        { now },
      );

      /**
       * A live invitation covers exactly one seat, in exactly the occurrence it
       * was issued for. Resolved once here so the per-line loop below can ask a
       * boolean, and scoped by occurrence so a token for one session cannot let
       * someone past a different sold-out one.
       */
      let invitedOccurrenceId: number | null = null;
      let invitationId: number | null = null;
      let invitedEntryId: number | null = null;

      if (data.invitationToken) {
        const [invitation] = await tx
          .select({
            id: sessionWaitlistInvitations.id,
            status: sessionWaitlistInvitations.status,
            expiresAt: sessionWaitlistInvitations.expiresAt,
            entryStatus: sessionWaitlistEntries.status,
            occurrenceId: sessionWaitlistEntries.occurrenceId,
            entryId: sessionWaitlistEntries.id,
          })
          .from(sessionWaitlistInvitations)
          .innerJoin(
            sessionWaitlistEntries,
            eq(
              sessionWaitlistEntries.id,
              sessionWaitlistInvitations.waitlistEntryId,
            ),
          )
          .where(
            eq(
              sessionWaitlistInvitations.tokenHash,
              hashAccessToken(data.invitationToken),
            ),
          )
          .for("update")
          .limit(1);

        if (invitation) {
          const usable = resolveInvitationUse(invitation, now);
          if (usable.allowed) {
            invitedOccurrenceId = invitation.occurrenceId;
            invitationId = invitation.id;
            invitedEntryId = invitation.entryId;
          }
        }
      }

      /**
       * Every line is validated before anything is written. One unavailable
       * session fails the whole purchase — "if one line lacks capacity, no line
       * is held" (roadmap Phase 4), which the single transaction guarantees.
       */
      const priced: {
        occurrenceId: number;
        sessionId: number;
        title: string;
        sessionType: (typeof programSessions.$inferSelect)["type"];
        startsAt: Date;
        endsAt: Date;
        venueId: number | null;
        room: string | null;
        basePrice: number;
        existingPrice: number;
        finalPrice: number;
        discountAmount: number;
        promoWasHigher: boolean;
        basis: (typeof sessionPurchaseLines.$inferInsert)["priceBasis"];
        snapshot: unknown;
      }[] = [];

      for (const entry of contexts) {
        const occurrenceState = resolveOccurrenceState(
          {
            programStatus: entry.program.status,
            sessionStatus: entry.session.status,
            lifecycleStatus: entry.occurrence.lifecycleStatus,
            salesStartAt: entry.occurrence.salesStartAt,
            salesEndAt: entry.occurrence.salesEndAt,
            salesClosedAt: entry.occurrence.salesClosedAt,
            rescheduledAt: entry.occurrence.rescheduledAt,
          },
          now,
        );

        const existingPrice = resolvePrice(
          {
            publicPrice: entry.session.publicPrice,
            participantPrice: entry.session.participantPrice,
            programDiscount: programDiscountFrom(entry.program),
            globalDiscount: globalDiscountFrom(settings),
          },
          eligibility,
        );

        const promoPrice = promoCode
          ? resolvePromoPrice({
              basePrice: entry.session.publicPrice,
              existingPrice: existingPrice.amount,
              discountPercent: promoCode.discountPercent,
            })
          : null;

        if (
          promoPrice?.isHigherThanExisting &&
          data.acceptsHigherPromoPrice !== true
        ) {
          return {
            kind: "error" as const,
            message:
              "Este código deja un precio mayor. Confirma cuál precio quieres usar.",
          };
        }

        const finalPrice = promoPrice?.promoPrice ?? existingPrice.amount;

        const availability = availabilityByOccurrence.get(entry.occurrence.id);
        if (!availability) {
          return { kind: "error" as const, message: "Horario no encontrado" };
        }

        const hasExistingTicket = await hasValidTicketFor(
          tx,
          entry.occurrence.id,
          buyer,
        );

        const check = resolveRegistrationCheck({
          occurrenceState,
          audience: entry.session.audience,
          eligibility,
          // This is a paid catalogue session even when its accepted promo
          // floors the final amount to zero. Mode selection happens below.
          price: existingPrice.amount,
          availability,
          hasExistingTicket,
          mode: "paid",
          waitlistInvitationCoversSeat:
            invitedOccurrenceId === entry.occurrence.id,
        });

        if (!check.allowed) {
          // Named, because a cart failure the buyer cannot locate is unfixable.
          return {
            kind: "error" as const,
            message: `${entry.session.title}: ${REGISTRATION_BLOCKER_LABELS[check.blocker]}`,
          };
        }

        priced.push({
          occurrenceId: entry.occurrence.id,
          sessionId: entry.session.id,
          title: entry.session.title,
          sessionType: entry.session.type,
          startsAt: entry.occurrence.startsAt,
          endsAt: entry.occurrence.endsAt,
          venueId:
            entry.occurrence.venueId ??
            entry.session.venueId ??
            entry.program.defaultVenueId,
          room: entry.occurrence.room,
          basePrice: roundMoney(entry.session.publicPrice),
          existingPrice: existingPrice.amount,
          finalPrice,
          discountAmount: roundMoney(entry.session.publicPrice - finalPrice),
          promoWasHigher: promoPrice?.isHigherThanExisting ?? false,
          basis: existingPrice.basis,
          snapshot: buildProgramPriceSnapshot({
            eligibilityPrice: existingPrice.snapshot,
            basePrice: entry.session.publicPrice,
            existingPrice: existingPrice.amount,
            finalPrice,
            promo: promoCode
              ? {
                  promoCodeId: promoCode.id,
                  code: normalizePromoCode(promoCode.code),
                  partnerName: promoCode.partnerName,
                  discountPercent: promoCode.discountPercent,
                  rounding: "floor_whole_bob",
                  higherPriceAccepted:
                    promoPrice?.isHigherThanExisting ?? false,
                }
              : null,
          }),
        });
      }

      const subtotal = roundMoney(
        priced.reduce((sum, line) => sum + line.basePrice, 0),
      );
      const existingTotal = roundMoney(
        priced.reduce((sum, line) => sum + line.existingPrice, 0),
      );
      const total = roundMoney(
        priced.reduce((sum, line) => sum + line.finalPrice, 0),
      );
      const isZeroTotal = total <= 0;

      // Program override first, global default second — the same resolution
      // order the architecture defines for every program-scoped setting.
      const holdMinutes =
        context.program.holdMinutes ?? settings.defaultHoldMinutes;
      const holdExpiresAt = isZeroTotal
        ? null
        : new Date(now.getTime() + holdMinutes * 60_000);

      const [purchase] = await tx
        .insert(sessionPurchases)
        .values({
          programId,
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
          status: isZeroTotal ? "approved" : "pending_upload",
          paymentMode: isZeroTotal ? "free" : "bank_qr",
          buyerEligibility: eligibility,
          eligibilityEvaluatedAt: now,
          eligibilitySnapshot: snapshot,
          subtotalAmount: subtotal,
          totalAmount: total,
          holdExpiresAt,
          approvedAt: isZeroTotal ? now : null,
          noRefundPolicyVersion: settings.noRefundPolicyVersion,
          noRefundPolicyAcceptedAt: now,
          idempotencyKey,
        })
        .returning();

      const insertedLines = await tx
        .insert(sessionPurchaseLines)
        .values(
          priced.map((line) => ({
            purchaseId: purchase.id,
            occurrenceId: line.occurrenceId,
            sessionId: line.sessionId,
            source: "individual_session" as const,
            unitPrice: line.finalPrice,
            basePrice: line.basePrice,
            existingPrice: line.existingPrice,
            discountAmount: line.discountAmount,
            priceBasis: line.basis,
            pricingSnapshot: line.snapshot,
            sessionTitleSnapshot: line.title,
            occurrenceStartsAtSnapshot: line.startsAt,
          })),
        )
        .returning({
          id: sessionPurchaseLines.id,
          occurrenceId: sessionPurchaseLines.occurrenceId,
        });

      if (promoCode) {
        await tx.insert(programPromoCodeRedemptions).values({
          promoCodeId: promoCode.id,
          purchaseId: purchase.id,
          codeSnapshot: normalizePromoCode(promoCode.code),
          partnerNameSnapshot: promoCode.partnerName,
          discountPercentSnapshot: promoCode.discountPercent,
          baseAmountSnapshot: subtotal,
          existingPriceAmountSnapshot: existingTotal,
          discountAmountSnapshot: roundMoney(subtotal - total),
          totalAmountSnapshot: total,
          higherPriceAcceptedAt: priced.some((line) => line.promoWasHigher)
            ? now
            : null,
        });
      }

      const issuedTickets = isZeroTotal
        ? await tx
            .insert(sessionTickets)
            .values(
              insertedLines.map((line) => ({
                purchaseLineId: line.id,
                occurrenceId: line.occurrenceId,
                code: generateTicketCode(),
                attendeeUserId: buyer.userId,
                attendeeName: buyer.name,
                attendeeEmail: buyer.email,
                issuedAt: now,
              })),
            )
            .returning({
              id: sessionTickets.id,
              occurrenceId: sessionTickets.occurrenceId,
              code: sessionTickets.code,
            })
        : [];

      /**
       * Only when the invited occurrence is actually in this purchase. A buyer
       * holding an invitation for session A who checks out session B would
       * otherwise burn it without ever taking the seat it was issued for — the
       * token is scoped to one occurrence, so spending it elsewhere is wrong.
       */
      const delivered =
        invitationId !== null &&
        invitedEntryId !== null &&
        priced.some((line) => line.occurrenceId === invitedOccurrenceId)
          ? { invitationId, entryId: invitedEntryId }
          : null;

      if (delivered) {
        await tx
          .update(sessionWaitlistInvitations)
          .set({
            status: "converted",
            convertedAt: now,
            purchaseId: purchase.id,
            updatedAt: now,
          })
          .where(eq(sessionWaitlistInvitations.id, delivered.invitationId));

        // The invited entry only. Scoping by occurrence would mark everyone
        // still waiting for this session as converted.
        await tx
          .update(sessionWaitlistEntries)
          .set({ status: "converted", updatedAt: now })
          .where(eq(sessionWaitlistEntries.id, delivered.entryId));
      }

      await tx.insert(sessionPurchaseEvents).values([
        {
          purchaseId: purchase.id,
          actorType: "buyer" as const,
          actorUserId: profile?.id ?? null,
          eventType: "created" as const,
          toStatus: isZeroTotal
            ? ("approved" as const)
            : ("pending_upload" as const),
          changes: {
            holdExpiresAt: holdExpiresAt?.toISOString() ?? null,
            holdMinutes: isZeroTotal ? null : holdMinutes,
            lineCount: priced.length,
            subtotalAmount: subtotal,
            existingPriceAmount: existingTotal,
            totalAmount: total,
            promoCodeId: promoCode?.id ?? null,
            promoCode: promoCode ? normalizePromoCode(promoCode.code) : null,
            higherPriceAccepted: priced.some((line) => line.promoWasHigher),
          },
        },
        ...issuedTickets.map((ticket) => ({
          purchaseId: purchase.id,
          actorType: "system" as const,
          eventType: "ticket_issued" as const,
          changes: {
            ticketId: ticket.id,
            occurrenceId: ticket.occurrenceId,
          },
        })),
      ]);

      return {
        kind: "created" as const,
        purchaseId: purchase.id,
        holdExpiresAt,
        totalAmount: total,
        paymentMode: isZeroTotal ? ("free" as const) : ("bank_qr" as const),
        emailLines: isZeroTotal
          ? issuedTickets.map((ticket) => {
              const line = priced.find(
                (entry) => entry.occurrenceId === ticket.occurrenceId,
              );
              if (!line) throw new Error("Missing zero-total email line");

              return {
                ...line,
                ticketCode: ticket.code,
                programName: context.program.name,
              };
            })
          : [],
      };
    });

    return outcome;
  };

  let outcome: Awaited<ReturnType<typeof runCheckoutTransaction>>;
  try {
    outcome = await runCheckoutTransaction();
  } catch (error) {
    // Never log the raw error: it can carry driver details and the buyer's
    // own data. The message is generic for the same reason.
    console.error("Paid checkout failed", {
      occurrenceIds: data.occurrenceIds,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos iniciar tu compra. Intenta de nuevo.",
    };
  }

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

  let zeroTotalEmailsSent = true;
  if (outcome.paymentMode === "free") {
    for (const line of outcome.emailLines) {
      let venueName: string | null = null;
      if (line.venueId) {
        try {
          const venue = await db.query.venues.findFirst({
            where: eq(venues.id, line.venueId),
            columns: { name: true },
          });
          venueName = venue?.name ?? null;
        } catch {
          zeroTotalEmailsSent = false;
        }
      }

      try {
        const sent = await sendFreeRegistrationEmail({
          purchaseId: outcome.purchaseId,
          attendeeName: buyer.name,
          attendeeEmail: buyer.email,
          programName: line.programName,
          sessionTitle: line.title,
          sessionType: line.sessionType,
          startsAt: line.startsAt,
          endsAt: line.endsAt,
          venueName,
          room: line.room,
          ticketCode: line.ticketCode,
          accessToken,
        });
        zeroTotalEmailsSent = zeroTotalEmailsSent && sent;
      } catch {
        zeroTotalEmailsSent = false;
      }
    }
  }

  return {
    success: true,
    message:
      outcome.paymentMode === "free"
        ? zeroTotalEmailsSent
          ? "¡Listo! Tu código dejó la inscripción en Bs 0 y tu entrada está confirmada."
          : "¡Listo! Tu entrada está confirmada. Guarda el enlace de esta página."
        : "Reservamos tu cupo. Sube tu comprobante para confirmarlo.",
    purchaseId: outcome.purchaseId,
    accessToken,
    holdExpiresAt: outcome.holdExpiresAt,
    totalAmount: outcome.totalAmount,
    paymentMode: outcome.paymentMode,
  };
}
