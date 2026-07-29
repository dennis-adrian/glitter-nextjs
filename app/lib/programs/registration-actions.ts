"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { getBuyerEligibility } from "@/app/lib/programs/eligibility-queries";
import { sendFreeRegistrationEmail } from "@/app/lib/programs/notifications";
import {
  fetchAvailabilityForOccurrences,
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
  generateTicketCode,
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
  sessionTickets,
  venues,
} from "@/db/schema";

const registrationSchema = z.object({
  occurrenceId: z.number().int().positive(),
  /** Required for guests, forbidden for signed-in buyers (server decides). */
  guestName: z.string().trim().min(1).max(200).optional(),
  guestEmail: z.string().trim().email().max(200).optional(),
  guestPhone: z.string().trim().min(1).max(40).optional(),
  /** PRD §12.1: the no-refund policy needs an explicit acknowledgement. */
  acceptsNoRefundPolicy: z.literal(true),
  /** Supplied by the client so a double submit cannot take two seats. */
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export type FreeRegistrationInput = z.input<typeof registrationSchema>;

export type FreeRegistrationResult =
  | {
      success: true;
      message: string;
      purchaseId: number;
      /** Raw token — returned once, never stored. */
      accessToken: string;
      ticketCode: string;
    }
  | { success: false; message: string };

function isDuplicateAttendeeTicketError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = Reflect.get(current, "code");
    const constraint = Reflect.get(current, "constraint");
    if (
      code === "23505" &&
      typeof constraint === "string" &&
      constraint.includes("session_tickets_occurrence_attendee")
    ) {
      return true;
    }
    current = Reflect.get(current, "cause");
  }
  return false;
}

/**
 * Registers one attendee for one free occurrence.
 *
 * Everything that decides the outcome is re-evaluated inside the transaction,
 * after the occurrence row is locked: a page rendered ten minutes ago cannot
 * carry a stale price, audience, or seat count past these checks.
 *
 * Paid sessions are deliberately refused here — they need the hold-and-voucher
 * flow that arrives with Phase 3.
 */
export async function registerForFreeSession(
  input: FreeRegistrationInput,
): Promise<FreeRegistrationResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa los datos del formulario",
    };
  }

  const data = parsed.data;
  const profile = await getCurrentUserProfile();

  const attendee = resolveAttendeeIdentity(
    profile,
    profile
      ? null
      : data.guestName && data.guestEmail
        ? { name: data.guestName, email: data.guestEmail }
        : null,
  );

  if (!attendee) {
    return {
      success: false,
      message: "Necesitamos tu nombre y correo para inscribirte",
    };
  }

  if (!profile && !data.guestPhone) {
    return { success: false, message: "Necesitamos un teléfono de contacto" };
  }

  const now = new Date();
  const { eligibility, snapshot } = await getBuyerEligibility(profile, { now });
  const idempotencyKey = data.idempotencyKey ?? generateIdempotencyKey();

  // Generated outside the transaction so a retry never reuses a token that a
  // rolled-back attempt already handed to someone.
  const accessToken = generateAccessToken();
  const ticketCode = generateTicketCode();

  try {
    const outcome = await db.transaction(async (tx) => {
      const buyerPredicate = profile
        ? eq(sessionPurchases.userId, profile.id)
        : eq(sessionPurchases.guestEmail, attendee.email);

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
      // taking a second seat. The token is not recoverable, so the caller has
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
        hasValidTicketFor(tx, data.occurrenceId, attendee),
      ]);

      const check = resolveRegistrationCheck({
        occurrenceState,
        audience: context.session.audience,
        eligibility,
        price: price.amount,
        availability,
        hasExistingTicket,
      });

      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: REGISTRATION_BLOCKER_LABELS[check.blocker],
        };
      }

      const [purchase] = await tx
        .insert(sessionPurchases)
        .values({
          programId: context.program.id,
          userId: profile?.id ?? null,
          guestName: profile ? null : (data.guestName ?? null),
          guestEmail: profile ? null : (data.guestEmail ?? null),
          guestPhone: profile ? null : (data.guestPhone ?? null),
          accessTokenHash: hashAccessToken(accessToken),
          // Free registration skips the voucher entirely and is approved on
          // the spot, which is what lets the QR be issued immediately.
          status: "approved",
          approvedAt: now,
          paymentMode: "free",
          buyerEligibility: eligibility,
          eligibilityEvaluatedAt: now,
          eligibilitySnapshot: snapshot,
          subtotalAmount: 0,
          totalAmount: 0,
          noRefundPolicyVersion: settings.noRefundPolicyVersion,
          noRefundPolicyAcceptedAt: now,
          idempotencyKey,
        })
        .returning();

      const [line] = await tx
        .insert(sessionPurchaseLines)
        .values({
          purchaseId: purchase.id,
          occurrenceId: context.occurrence.id,
          sessionId: context.session.id,
          source: "individual_session",
          unitPrice: 0,
          priceBasis: price.basis,
          pricingSnapshot: price.snapshot,
          sessionTitleSnapshot: context.session.title,
          occurrenceStartsAtSnapshot: context.occurrence.startsAt,
        })
        .returning();

      const [ticket] = await tx
        .insert(sessionTickets)
        .values({
          purchaseLineId: line.id,
          occurrenceId: context.occurrence.id,
          code: ticketCode,
          attendeeUserId: attendee.userId,
          attendeeName: attendee.name,
          attendeeEmail: attendee.email,
          issuedAt: now,
        })
        .returning();

      await tx.insert(sessionPurchaseEvents).values([
        {
          purchaseId: purchase.id,
          actorType: "buyer",
          actorUserId: profile?.id ?? null,
          eventType: "created",
          toStatus: "approved",
        },
        {
          purchaseId: purchase.id,
          actorType: "system",
          eventType: "ticket_issued",
          changes: { ticketId: ticket.id, occurrenceId: context.occurrence.id },
        },
      ]);

      return {
        kind: "created" as const,
        purchaseId: purchase.id,
        ticketCode: ticket.code,
        email: {
          programName: context.program.name,
          sessionTitle: context.session.title,
          sessionType: context.session.type,
          startsAt: context.occurrence.startsAt,
          endsAt: context.occurrence.endsAt,
          venueId:
            context.occurrence.venueId ??
            context.session.venueId ??
            context.program.defaultVenueId,
          room: context.occurrence.room,
        },
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
        message: "Esta inscripción ya se registró. Revisa tu correo.",
      };
    }

    // Dispatched only after the transaction has committed. The seat is already
    // the attendee's; a mail failure must never look like a failed
    // registration, so this cannot throw and does not gate the result.
    // Venue enrichment is best-effort too: a lookup failure falls back to a
    // null name so the confirmation email is still attempted.
    let venueName: string | null = null;
    if (outcome.email.venueId) {
      try {
        const venue = await db.query.venues.findFirst({
          where: eq(venues.id, outcome.email.venueId),
          columns: { name: true },
        });
        venueName = venue?.name ?? null;
      } catch (error) {
        // Log only a code/type — never the raw error (message/stack/driver
        // details). purchaseId and venueId are numeric correlation ids.
        const errorType =
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : error instanceof Error
              ? error.name
              : typeof error;
        console.error("Venue lookup for registration email failed", {
          purchaseId: outcome.purchaseId,
          venueId: outcome.email.venueId,
          errorType,
        });
      }
    }

    const emailed = await sendFreeRegistrationEmail({
      purchaseId: outcome.purchaseId,
      attendeeName: attendee.name,
      attendeeEmail: attendee.email,
      programName: outcome.email.programName,
      sessionTitle: outcome.email.sessionTitle,
      sessionType: outcome.email.sessionType,
      startsAt: outcome.email.startsAt,
      endsAt: outcome.email.endsAt,
      venueName,
      room: outcome.email.room,
      ticketCode: outcome.ticketCode,
      accessToken,
    });

    return {
      success: true,
      message: emailed
        ? "¡Listo! Tu inscripción quedó confirmada. Te enviamos el QR por correo."
        : "¡Listo! Tu inscripción quedó confirmada. No pudimos enviarte el correo, guarda el enlace de esta página.",
      purchaseId: outcome.purchaseId,
      accessToken,
      ticketCode: outcome.ticketCode,
    };
  } catch (error) {
    // The partial unique indexes on `session_tickets` are the last line of
    // defence when two requests race past the in-transaction duplicate check.
    if (isDuplicateAttendeeTicketError(error)) {
      return {
        success: false,
        message: REGISTRATION_BLOCKER_LABELS.already_registered,
      };
    }

    console.error("Free registration failed");
    return {
      success: false,
      message: "No pudimos completar tu inscripción. Intenta de nuevo.",
    };
  }
}

/** Availability for the public page, outside any transaction. */
export async function getOccurrenceAvailability(occurrenceId: number) {
  return fetchOccurrenceAvailability(db, occurrenceId);
}

/** Availability for every occurrence on a session page, in one round trip. */
export async function getAvailabilityForOccurrences(occurrenceIds: number[]) {
  return fetchAvailabilityForOccurrences(db, occurrenceIds);
}
