"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import type {
  ClaimTicketResult,
  RegisterVisitorResult,
  RegistrationFailure,
  RegistrationMode,
  StartRegistrationResult,
  TicketHistoryLinkResult,
} from "@/app/lib/visitors/registration-definitions";
import {
  bookableFestivalDate,
  festivalDateOn,
  findVisitorIdByEmail,
  loadRegistrationFestival,
  normalizeVisitorEmail,
  registrationBlocker,
  visitorRegistrationView,
} from "@/app/lib/visitors/registration-data";
import {
  allowVisitorRequest,
  currentVisitorId,
  endVisitorSession,
  holdPendingVisitorEmail,
  pendingVisitorEmail,
  startVisitorSession,
} from "@/app/lib/visitors/session";
import {
  issueTicket,
  sendTicketHistoryLinkEmail,
  sendTicketIssuedEmail,
} from "@/app/lib/visitors/tickets";
import {
  birthdateForStorage,
  visitorDetailsSchema,
} from "@/app/lib/visitors/visitor-details-schema";
import { loggableError } from "@/app/lib/errors/loggable-error";
import { db } from "@/db";
import { visitors } from "@/db/schema";

/**
 * The public side of visitor registration: the online form and the door form
 * call these. Server actions are reachable by anyone, so every one of them
 * re-checks the festival's switches and works out who the visitor is from
 * their signed cookie, never from an id or email the browser sends.
 */

const MINUTE = 60 * 1000;

/**
 * Per network address, sized for a festival entrance: a door rush shares one
 * venue Wi-Fi or carrier address, and staff register people from one desk.
 * They only stop floods; the per-email and per-visitor limits are the ones
 * that bound what one identity can do.
 */
const PER_ADDRESS_LIMIT = { limit: 300, windowMs: 10 * MINUTE };
const TOO_MANY_REQUESTS =
  "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
const SESSION_EXPIRED: RegistrationFailure = {
  success: false,
  message: "Tu sesión expiró. Ingresa tu correo nuevamente.",
  restart: true,
};
const GENERIC_ERROR = "Algo salió mal. Intenta nuevamente.";
const MAX_PARTY_SIZE = 10;

const festivalIdSchema = z.number().int().positive();
const modeSchema = z.enum(["online", "door"]);
const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ error: "El correo electrónico no es válido" }));

function revalidateRegistrationPages(festivalId: number) {
  revalidatePath(`/festivals/${festivalId}/registration`);
  revalidatePath(`/festivals/${festivalId}/event_day_registration`);
  revalidatePath(`/dashboard/festivals/${festivalId}`);
}

/**
 * The email step. A visitor we already know is recognised by their email and
 * goes straight to their tickets; a new one goes on to the form, with the
 * email held server-side so the form cannot be pointed at another address.
 */
export async function startVisitorRegistration(input: {
  festivalId: number;
  email: string;
  mode: RegistrationMode;
}): Promise<StartRegistrationResult> {
  const festivalId = festivalIdSchema.safeParse(input?.festivalId);
  const mode = modeSchema.safeParse(input?.mode);
  const email = emailSchema.safeParse(input?.email);
  if (!festivalId.success || !mode.success) {
    return { success: false, message: GENERIC_ERROR };
  }
  if (!email.success) {
    return { success: false, message: "El correo electrónico no es válido" };
  }
  const normalizedEmail = normalizeVisitorEmail(email.data);

  const allowed =
    (await allowVisitorRequest({ scope: "start", ...PER_ADDRESS_LIMIT })) &&
    (await allowVisitorRequest({
      scope: "start-email",
      limit: 10,
      windowMs: 10 * MINUTE,
      subject: normalizedEmail,
    }));
  if (!allowed) return { success: false, message: TOO_MANY_REQUESTS };

  try {
    const festival = await loadRegistrationFestival(festivalId.data);
    if (!festival) return { success: false, message: GENERIC_ERROR };
    const blocker = registrationBlocker(festival, mode.data);
    if (blocker) return { success: false, message: blocker };

    const visitorId = await findVisitorIdByEmail(normalizedEmail);
    if (visitorId === null) {
      await holdPendingVisitorEmail(normalizedEmail);
      return { success: true, status: "new" };
    }

    const view = await visitorRegistrationView(visitorId, festival);
    if (!view) return { success: false, message: GENERIC_ERROR };
    await startVisitorSession(visitorId);
    return { success: true, status: "returning", view };
  } catch (error) {
    console.error("Error starting visitor registration", loggableError(error));
    return { success: false, message: GENERIC_ERROR };
  }
}

/**
 * Saves a new visitor's details under the email held from the email step.
 * An email that turns out to be taken by then (a second tab, a double
 * submit) signs in as that visitor and leaves their stored details alone.
 */
export async function registerVisitor(input: {
  festivalId: number;
  mode: RegistrationMode;
  /** The email the form showed, which must still be the one held. */
  email: string;
  details: z.input<typeof visitorDetailsSchema>;
}): Promise<RegisterVisitorResult> {
  const festivalId = festivalIdSchema.safeParse(input?.festivalId);
  const mode = modeSchema.safeParse(input?.mode);
  if (!festivalId.success || !mode.success) {
    return { success: false, message: GENERIC_ERROR };
  }
  const details = visitorDetailsSchema.safeParse(input?.details);
  if (!details.success) {
    return {
      success: false,
      message: details.error.issues[0]?.message ?? "Revisa tus datos",
    };
  }

  const email = await pendingVisitorEmail();
  // Another tab may have entered a different email since this form loaded;
  // saving these details under that one would hand them to someone else.
  if (
    !email ||
    typeof input?.email !== "string" ||
    normalizeVisitorEmail(input.email) !== email
  ) {
    return SESSION_EXPIRED;
  }

  const allowed =
    (await allowVisitorRequest({ scope: "register", ...PER_ADDRESS_LIMIT })) &&
    (await allowVisitorRequest({
      scope: "register-email",
      limit: 5,
      windowMs: 10 * MINUTE,
      subject: email,
    }));
  if (!allowed) return { success: false, message: TOO_MANY_REQUESTS };

  try {
    const festival = await loadRegistrationFestival(festivalId.data);
    if (!festival) return { success: false, message: GENERIC_ERROR };
    const blocker = registrationBlocker(festival, mode.data);
    if (blocker) return { success: false, message: blocker };

    let visitorId = await findVisitorIdByEmail(email);
    if (visitorId === null) {
      const [created] = await db
        .insert(visitors)
        .values({
          email,
          firstName: details.data.firstName,
          lastName: details.data.lastName,
          birthdate: birthdateForStorage(details.data.birthdate),
          phoneNumber: details.data.phoneNumber,
          gender: details.data.gender,
        })
        .onConflictDoNothing({ target: visitors.email })
        .returning({ id: visitors.id });
      visitorId = created?.id ?? (await findVisitorIdByEmail(email));
    }
    if (visitorId === null) return { success: false, message: GENERIC_ERROR };

    const view = await visitorRegistrationView(visitorId, festival);
    if (!view) return { success: false, message: GENERIC_ERROR };
    await startVisitorSession(visitorId);
    return { success: true, view };
  } catch (error) {
    console.error("Error registering visitor", loggableError(error));
    return { success: false, message: GENERIC_ERROR };
  }
}

async function claim(input: {
  festivalId: unknown;
  mode: RegistrationMode;
  pickDate: (
    festival: NonNullable<Awaited<ReturnType<typeof loadRegistrationFestival>>>,
    now: Date,
  ) => Date | null;
  numberOfVisitors: number;
}): Promise<ClaimTicketResult> {
  const festivalId = festivalIdSchema.safeParse(input.festivalId);
  if (!festivalId.success) return { success: false, message: GENERIC_ERROR };

  const visitorId = await currentVisitorId();
  if (visitorId === null) return SESSION_EXPIRED;

  if (
    !(await allowVisitorRequest({
      scope: "claim",
      limit: 20,
      windowMs: 10 * MINUTE,
      subject: visitorId,
    }))
  ) {
    return { success: false, message: TOO_MANY_REQUESTS };
  }

  try {
    const festival = await loadRegistrationFestival(festivalId.data);
    if (!festival) return { success: false, message: GENERIC_ERROR };
    const now = new Date();
    const blocker = registrationBlocker(festival, input.mode, now);
    if (blocker) return { success: false, message: blocker };

    const date = input.pickDate(festival, now);
    if (!date) {
      return {
        success: false,
        message: "Esa fecha ya no está disponible. Elige otra.",
      };
    }

    const result = await issueTicket({
      visitorId,
      festivalId: festival.id,
      date,
      numberOfVisitors: input.numberOfVisitors,
      isEventDayCreation: input.mode === "door",
    });

    const view = await visitorRegistrationView(visitorId, festival);
    if (!view) return SESSION_EXPIRED;

    if (result.status === "exists") {
      return {
        success: true,
        message: "Ya tenías una entrada para este día",
        view,
        issued: false,
      };
    }

    after(() => sendTicketIssuedEmail(result.ticket, festival));
    revalidateRegistrationPages(festival.id);
    return {
      success: true,
      message: "¡Listo! Te enviamos tu entrada por correo",
      view,
      issued: true,
    };
  } catch (error) {
    console.error("Error claiming ticket", loggableError(error));
    return { success: false, message: "No se pudo crear la entrada" };
  }
}

/** Online: one ticket for a festival day the visitor picks, today or later. */
export async function claimTicket(input: {
  festivalId: number;
  /** The festival day's `startDate`, as an ISO string. */
  date: string;
}): Promise<ClaimTicketResult> {
  const requested =
    typeof input?.date === "string" && input.date.length <= 40
      ? new Date(input.date)
      : null;
  if (!requested || Number.isNaN(requested.getTime())) {
    return { success: false, message: "La fecha seleccionada no es válida" };
  }
  return claim({
    festivalId: input.festivalId,
    mode: "online",
    pickDate: (festival, now) =>
      bookableFestivalDate(festival, requested, now)?.startDate ?? null,
    numberOfVisitors: 1,
  });
}

/**
 * At the door: today's ticket, for the visitor and anyone in their care. The
 * day is the server's, in the store's time zone, so a phone with the wrong
 * date cannot book another day.
 */
export async function claimDoorTicket(input: {
  festivalId: number;
  numberOfVisitors: number;
}): Promise<ClaimTicketResult> {
  const numberOfVisitors = z
    .number()
    .int()
    .min(1)
    .max(MAX_PARTY_SIZE)
    .safeParse(input?.numberOfVisitors);
  if (!numberOfVisitors.success) {
    return {
      success: false,
      message: `Una entrada es para 1 a ${MAX_PARTY_SIZE} personas`,
    };
  }
  return claim({
    festivalId: input.festivalId,
    mode: "door",
    pickDate: (festival, now) =>
      festivalDateOn(festival, now)?.startDate ?? null,
    numberOfVisitors: numberOfVisitors.data,
  });
}

/** "¿No eres tú?": forget the visitor this browser was acting as. */
export async function forgetVisitor() {
  await endVisitorSession();
}

/**
 * Mails the link to a visitor's ticket history. Says the same thing whether
 * or not the email is registered, so this form cannot be used to find out.
 */
export async function requestTicketHistoryLink(input: {
  email: string;
}): Promise<TicketHistoryLinkResult> {
  const email = emailSchema.safeParse(input?.email);
  if (!email.success) {
    return { success: false, message: "El correo electrónico no es válido" };
  }
  const normalizedEmail = normalizeVisitorEmail(email.data);

  const allowed =
    (await allowVisitorRequest({
      scope: "history-link",
      limit: 30,
      windowMs: 15 * MINUTE,
    })) &&
    (await allowVisitorRequest({
      scope: "history-link-email",
      limit: 3,
      windowMs: 60 * MINUTE,
      subject: normalizedEmail,
    }));
  if (!allowed) return { success: false, message: TOO_MANY_REQUESTS };

  try {
    const visitorId = await findVisitorIdByEmail(normalizedEmail);
    if (visitorId !== null) {
      after(() => sendTicketHistoryLinkEmail(visitorId));
    }
  } catch (error) {
    console.error("Error requesting ticket history link", loggableError(error));
    return { success: false, message: GENERIC_ERROR };
  }

  return {
    success: true,
    message:
      "Si ese correo tiene entradas, te enviamos un enlace para verlas. Revisa tu bandeja de entrada y la carpeta de spam.",
  };
}
