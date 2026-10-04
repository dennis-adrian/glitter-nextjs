import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type {
  RegistrationMode,
  VisitorRegistrationView,
  VisitorTicketView,
} from "@/app/lib/visitors/registration-definitions";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getTicketCode } from "@/app/lib/tickets/utils";
import { db } from "@/db";
import { festivals, tickets, visitors } from "@/db/schema";

export const REGISTRATION_CLOSED_MESSAGE =
  "El registro para este evento no se encuentra activo";
export const DOOR_REGISTRATION_OFF_MESSAGE =
  "El registro en puerta no está habilitado para este festival.";
export const DOOR_REGISTRATION_NOT_TODAY_MESSAGE =
  "El registro en puerta abre los días del festival. Mientras tanto, puedes obtener tu entrada en línea.";

export function normalizeVisitorEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * The visitor an email belongs to. Emails were stored as typed, so one person
 * can own several rows ("Ana@…" and "ana@…"); the oldest one is theirs.
 */
export async function findVisitorIdByEmail(email: string) {
  const [row] = await db
    .select({ id: visitors.id })
    .from(visitors)
    .where(sql`lower(trim(${visitors.email})) = ${normalizeVisitorEmail(email)}`)
    .orderBy(asc(visitors.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * `tickets.visitor_id` belongs to the same person as `visitorId`: any row
 * with their email, whatever its case. The old form stored emails as typed,
 * so one person can hold tickets under "Ana@…" and "ana@…".
 */
export function ticketHolderIs(visitorId: number) {
  return sql`${tickets.visitorId} in (
    select ${visitors.id} from ${visitors}
    where lower(trim(${visitors.email})) = (
      select lower(trim(${visitors.email})) from ${visitors}
      where ${visitors.id} = ${visitorId}
    )
  )`;
}

export async function loadRegistrationFestival(festivalId: number) {
  if (!Number.isInteger(festivalId) || festivalId <= 0) return null;
  const festival = await db.query.festivals.findFirst({
    where: eq(festivals.id, festivalId),
    with: { festivalDates: true },
  });
  if (!festival) return null;
  festival.festivalDates.sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  return festival as FestivalWithDates;
}

/** The festival day that falls on `now` in the store's time zone, if any. */
export function festivalDateOn(festival: FestivalWithDates, now: Date) {
  const today = formatDate(now).startOf("day");
  return (
    festival.festivalDates.find((date) =>
      formatDate(date.startDate).startOf("day").equals(today),
    ) ?? null
  );
}

/**
 * Why visitors cannot register through `mode` right now, or null when they
 * can. The online form needs an active festival with acreditación open; the
 * door form also needs "registro en puerta" on and a festival day today.
 */
export function registrationBlocker(
  festival: FestivalWithDates,
  mode: RegistrationMode,
  now: Date = new Date(),
) {
  if (festival.status !== "active" || !festival.publicRegistration) {
    return REGISTRATION_CLOSED_MESSAGE;
  }
  if (mode === "door") {
    if (!festival.eventDayRegistration) return DOOR_REGISTRATION_OFF_MESSAGE;
    if (!festivalDateOn(festival, now)) return DOOR_REGISTRATION_NOT_TODAY_MESSAGE;
  }
  return null;
}

/**
 * The festival day a visitor asked for online, when they may still book it:
 * one of the festival's days, today or later in the store's time zone.
 */
export function bookableFestivalDate(
  festival: FestivalWithDates,
  requested: Date,
  now: Date = new Date(),
) {
  const today = formatDate(now).startOf("day");
  const match = festival.festivalDates.find(
    (date) => date.startDate.getTime() === requested.getTime(),
  );
  if (!match) return null;
  if (formatDate(match.startDate).startOf("day") < today) return null;
  return match;
}

function displayName(firstName: string | null, lastName: string | null) {
  const first = firstName?.trim() || "Visitante";
  const initial = lastName?.trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

function toTicketView(
  ticket: typeof tickets.$inferSelect,
  festivalCode: string | null,
): VisitorTicketView {
  return {
    id: ticket.id,
    festivalId: ticket.festivalId,
    date: ticket.date,
    code: getTicketCode(festivalCode ?? "", ticket.ticketNumber ?? 0),
    numberOfVisitors: ticket.numberOfVisitors,
    status: ticket.status,
    isEventDayCreation: ticket.isEventDayCreation,
  };
}

/** What the registration pages may show about a visitor, for one festival. */
export async function visitorRegistrationView(
  visitorId: number,
  festival: Pick<FestivalWithDates, "id" | "festivalCode">,
): Promise<VisitorRegistrationView | null> {
  const visitor = await db.query.visitors.findFirst({
    columns: { firstName: true, lastName: true },
    where: eq(visitors.id, visitorId),
  });
  if (!visitor) return null;

  const rows = await db
    .select()
    .from(tickets)
    .where(and(ticketHolderIs(visitorId), eq(tickets.festivalId, festival.id)))
    .orderBy(asc(tickets.date));

  return {
    firstName: visitor.firstName?.trim() || "Visitante",
    displayName: displayName(visitor.firstName, visitor.lastName),
    tickets: rows.map((row) => toTicketView(row, festival.festivalCode)),
  };
}

export type VisitorTicketHistoryEntry = VisitorTicketView & {
  festival: {
    id: number;
    name: string;
    festivalCode: string | null;
    mascotUrl: string | null;
    locationLabel: string | null;
    address: string | null;
  };
};

/** Every ticket a visitor holds, across festivals, newest first. */
export async function visitorTicketHistory(visitorId: number) {
  const visitor = await db.query.visitors.findFirst({
    columns: { firstName: true, lastName: true },
    where: eq(visitors.id, visitorId),
  });
  if (!visitor) return null;

  const rows = await db
    .select({
      ticket: tickets,
      festival: {
        id: festivals.id,
        name: festivals.name,
        festivalCode: festivals.festivalCode,
        mascotUrl: festivals.mascotUrl,
        locationLabel: festivals.locationLabel,
        address: festivals.address,
      },
    })
    .from(tickets)
    .innerJoin(festivals, eq(festivals.id, tickets.festivalId))
    .where(ticketHolderIs(visitorId))
    .orderBy(sql`${tickets.date} desc`);

  return {
    firstName: visitor.firstName?.trim() || "Visitante",
    displayName: displayName(visitor.firstName, visitor.lastName),
    entries: rows.map(
      (row): VisitorTicketHistoryEntry => ({
        ...toTicketView(row.ticket, row.festival.festivalCode),
        festival: row.festival,
      }),
    ),
  };
}
