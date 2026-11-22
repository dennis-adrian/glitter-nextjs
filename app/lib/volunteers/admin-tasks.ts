import { DateTime } from "luxon";
import { z } from "zod";

import type { BadgeVariant } from "@/app/components/ui/badge";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { capitalize } from "@/app/lib/utils";
import {
  shiftCoverageState,
  volunteerAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import { VOLUNTEER_MAX_SHIFTS_PER_DAY } from "@/app/lib/volunteers/definitions";

/**
 * The volunteer admin split by task, "Revisar" (decide on pending
 * applications) and "Asignar" (give accepted people a role and shifts):
 * paths, the review order, coverage badges and the counts the screens show.
 * Pure and client-safe.
 */

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

/** "Asignar", by shift. */
export const volunteerAssignPath = (festivalId: number) =>
  `${volunteerAdminPath(festivalId)}/asignar`;
/** "Asignar", by person. */
export const volunteerPeoplePath = (festivalId: number) =>
  `${volunteerAssignPath(festivalId)}/personas`;
/** Every application, with search and filters (the first admin's list). */
export const volunteerAllApplicationsPath = (festivalId: number) =>
  `${volunteerAdminPath(festivalId)}/todas`;
export const volunteerAvailabilityPath = (
  festivalId: number,
  applicationId: number,
) => `${volunteerAdminPath(festivalId)}/${applicationId}/disponibilidad`;

/* ------------------------------------------------------------------ */
/* Revisar: sort and order                                             */
/* ------------------------------------------------------------------ */

export const VOLUNTEER_REVIEW_SORTS = ["antiguas", "nuevas", "turnos"] as const;
export type VolunteerReviewSort = (typeof VOLUNTEER_REVIEW_SORTS)[number];

export const VOLUNTEER_REVIEW_SORT_LABELS: Record<VolunteerReviewSort, string> =
  {
    antiguas: "Fecha: más antiguas primero",
    nuevas: "Fecha: más nuevas primero",
    turnos: "Turnos que puede: más primero",
  };

export const DEFAULT_VOLUNTEER_REVIEW_SORT: VolunteerReviewSort = "antiguas";

/** The `orden` param; anything else is the default (oldest first). */
export function parseVolunteerReviewSort(raw: unknown): VolunteerReviewSort {
  return typeof raw === "string" &&
    (VOLUNTEER_REVIEW_SORTS as readonly string[]).includes(raw)
    ? (raw as VolunteerReviewSort)
    : DEFAULT_VOLUNTEER_REVIEW_SORT;
}

/** `path`, carrying the sort unless it is the default. */
export function withReviewSort(path: string, sort: VolunteerReviewSort) {
  return sort === DEFAULT_VOLUNTEER_REVIEW_SORT
    ? path
    : `${path}?orden=${sort}`;
}

/** Revisar's list, or one application in it, in `sort`'s order. */
export function volunteerReviewHref(
  festivalId: number,
  sort: VolunteerReviewSort,
  applicationId?: number,
) {
  const base = volunteerAdminPath(festivalId);
  return withReviewSort(
    applicationId === undefined ? base : `${base}/${applicationId}`,
    sort,
  );
}

export type ReviewPosition = {
  /** 1-based; 0 when `id` is not in the order. */
  position: number;
  total: number;
  previousId: number | null;
  nextId: number | null;
};

/** Where `id` sits in `ids`, and its neighbours, for "12 de 31" and arrows. */
export function reviewPosition(
  ids: readonly number[],
  id: number,
): ReviewPosition {
  const index = ids.indexOf(id);
  if (index === -1) {
    return {
      position: 0,
      total: ids.length,
      previousId: null,
      nextId: ids[0] ?? null,
    };
  }
  return {
    position: index + 1,
    total: ids.length,
    previousId: index > 0 ? ids[index - 1]! : null,
    nextId: index < ids.length - 1 ? ids[index + 1]! : null,
  };
}

/**
 * Where a decision on `id` leads: the next pending one in the order, else
 * the one before it, else none (back to the list).
 */
export function nextAfterDecision(
  ids: readonly number[],
  id: number,
): number | null {
  const { nextId, previousId, position } = reviewPosition(ids, id);
  if (position === 0) return ids[0] ?? null;
  return nextId ?? previousId;
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export type CoverageShift = {
  id: number;
  startsAt: Date;
  isActive: boolean;
  neededHeadcount: number;
  /** Accepted applications assigned to it. */
  assignedCount: number;
  /** Accepted applications that marked it and are not assigned to it. */
  acceptedUnassignedCount: number;
};

/** How many more people a shift needs; 0 when full or without a cupo. */
export function missingFor(
  shift: Pick<CoverageShift, "neededHeadcount" | "assignedCount">,
) {
  return Math.max(shift.neededHeadcount - shift.assignedCount, 0);
}

/**
 * A shift's badge: green "Completo"; amber "Faltan N"; red "Faltan N" when
 * the accepted people who marked it can no longer fill it; "Sin cupo" while
 * it needs nobody.
 */
export function coverageBadge(shift: CoverageShift): {
  label: string;
  variant: NonNullable<BadgeVariant>;
} {
  const state = shiftCoverageState({
    neededHeadcount: shift.neededHeadcount,
    assignedCount: shift.assignedCount,
    unassignedAvailableCount: shift.acceptedUnassignedCount,
  });
  switch (state.kind) {
    case "unset":
      return { label: state.label, variant: "outline" };
    case "complete":
      return { label: state.label, variant: "green" };
    case "short":
      return { label: `Faltan ${state.missing}`, variant: "red" };
    case "missing":
      return { label: `Faltan ${state.missing}`, variant: "amber" };
  }
}

/** The Progress value: assigned out of needed, 0–100. */
export function coveragePercent(
  shift: Pick<CoverageShift, "neededHeadcount" | "assignedCount">,
) {
  if (shift.neededHeadcount <= 0) return 0;
  return Math.min(
    100,
    Math.round((shift.assignedCount / shift.neededHeadcount) * 100),
  );
}

/**
 * Active shifts, the ones missing the most people first; full ones and
 * those without a cupo last; ties by start.
 */
export function shiftsByNeed<T extends CoverageShift>(shifts: readonly T[]) {
  return shifts
    .filter((shift) => shift.isActive)
    .sort(
      (a, b) =>
        missingFor(b) - missingFor(a) ||
        Number(b.neededHeadcount > 0) - Number(a.neededHeadcount > 0) ||
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.id - b.id,
    );
}

/** Places still to fill across the active shifts, and in how many shifts. */
export function remainingPlaces(shifts: readonly CoverageShift[]) {
  let places = 0;
  let shiftCount = 0;
  for (const shift of shifts) {
    if (!shift.isActive) continue;
    const missing = missingFor(shift);
    if (missing > 0) {
      places += missing;
      shiftCount += 1;
    }
  }
  return { places, shifts: shiftCount };
}

/* ------------------------------------------------------------------ */
/* Wording                                                             */
/* ------------------------------------------------------------------ */

/** "1 lugar", "24 lugares": `count` and the noun in its number. */
export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function laPaz(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).setLocale("es");
}

/** "Sáb 10:00": the weekday and start, for "No marcó: …". */
export function formatShiftWeekdayStart(shift: { startsAt: Date }) {
  const start = laPaz(shift.startsAt);
  return `${capitalize(start.toFormat("ccc").replace(".", ""))} ${start.toFormat("HH:mm")}`;
}

/** "22 nov", La Paz's calendar. */
export function formatShortDate(date: Date) {
  return laPaz(date).toFormat("d LLL").replace(".", "");
}

/** "el sábado" for the over-limit badge: "3 turnos el sábado". */
export function formatWeekdayName(day: string) {
  return DateTime.fromISO(day, { zone: STORE_TIMEZONE })
    .setLocale("es")
    .toFormat("cccc");
}

/** "Cierran el lunes 30 de noviembre, 23:59", or "Cerraron …" once past. */
export function volunteerCloseLine(
  closeAt: Date,
  now: Date = new Date(),
  { long = false }: { long?: boolean } = {},
) {
  const close = laPaz(closeAt);
  const verb = closeAt.getTime() <= now.getTime() ? "Cerraron" : "Cierran";
  const day = close.toFormat("cccc d 'de' LLLL");
  const time = close.toFormat("HH:mm");
  return long
    ? `${verb} el ${day} a las ${time}.`
    : `${verb} el ${day}, ${time}`;
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

export function laPazDay(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toISODate()!;
}

/** Shifts in `held` on `day`'s La Paz day, `day` included if it is one. */
export function shiftsOnDay(
  held: ReadonlyArray<{ startsAt: Date }>,
  day: Date,
) {
  const target = laPazDay(day);
  return held.filter((shift) => laPazDay(shift.startsAt) === target).length;
}

/** The first La Paz day with more than the per-day limit, with its count. */
export function busiestDayOverLimit(
  held: ReadonlyArray<{ startsAt: Date }>,
  max = VOLUNTEER_MAX_SHIFTS_PER_DAY,
): { day: string; count: number } | null {
  const perDay = new Map<string, number>();
  for (const shift of held) {
    const day = laPazDay(shift.startsAt);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const over = [...perDay.entries()]
    .filter(([, count]) => count > max)
    .sort(([a], [b]) => a.localeCompare(b));
  if (over.length === 0) return null;
  const [day, count] = over[0]!;
  return { day, count };
}

/* ------------------------------------------------------------------ */
/* Availability edits                                                  */
/* ------------------------------------------------------------------ */

export type AvailabilityDiff = {
  added: number[];
  removed: number[];
  /** Removed shifts the person is assigned to: the save unassigns them. */
  unassigned: number[];
};

/** What saving `selected` changes against the shifts marked today. */
export function availabilityDiff(
  current: readonly number[],
  selected: readonly number[],
  assigned: readonly number[],
): AvailabilityDiff {
  const before = new Set(current);
  const after = new Set(selected);
  const held = new Set(assigned);
  const added = [...after]
    .filter((id) => !before.has(id))
    .sort((a, b) => a - b);
  const removed = [...before]
    .filter((id) => !after.has(id))
    .sort((a, b) => a - b);
  return { added, removed, unassigned: removed.filter((id) => held.has(id)) };
}

/** "Agregás 1 turno y quitás 1", or "Sin cambios". */
export function availabilitySummary({ added, removed }: AvailabilityDiff) {
  const parts: string[] = [];
  if (added.length > 0) {
    parts.push(`agregás ${plural(added.length, "turno", "turnos")}`);
  }
  if (removed.length > 0) {
    parts.push(
      added.length > 0
        ? `quitás ${removed.length}`
        : `quitás ${plural(removed.length, "turno", "turnos")}`,
    );
  }
  if (parts.length === 0) return "Sin cambios";
  return capitalize(parts.join(" y "));
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

const POSTGRES_INT_MAX = 2_147_483_647;
const id = z.coerce.number().int().positive().max(POSTGRES_INT_MAX);
const shiftIds = z
  .array(id)
  .max(50)
  .transform((ids) => [...new Set(ids)]);

export const VOLUNTEER_NOTE_MAX_LENGTH = 2000;
export const VOLUNTEER_AVAILABILITY_REASON_MAX_LENGTH = 300;

const noteBody = z
  .string()
  .trim()
  .max(VOLUNTEER_NOTE_MAX_LENGTH, "La nota es demasiado larga.");

/** Revisar's bottom bar, with the note being typed, if any. */
export const volunteerDecisionInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  status: z.enum(["pending", "accepted", "waitlist", "rejected"]),
  note: noteBody.optional().transform((value) => value || null),
});
export type VolunteerDecisionInput = z.input<
  typeof volunteerDecisionInputSchema
>;

export const volunteerNoteInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  body: noteBody.min(1, "Escribí la nota."),
});
export type VolunteerNoteInput = z.input<typeof volunteerNoteInputSchema>;

/** "Asignar N personas" on one shift, each with the role they get. */
export const volunteerShiftBatchInputSchema = z.object({
  festivalId: id,
  shiftId: id,
  people: z
    .array(z.object({ applicationId: id, roleId: id.nullable() }))
    .min(1, "Elegí al menos una persona.")
    .max(100)
    .refine(
      (people) =>
        new Set(people.map((person) => person.applicationId)).size ===
        people.length,
      "Cada persona va una sola vez.",
    ),
});
export type VolunteerShiftBatchInput = z.input<
  typeof volunteerShiftBatchInputSchema
>;

/** "Guardar asignación": one accepted person's role and shifts. */
export const volunteerPersonAssignmentInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  roleId: id.nullable(),
  shiftIds,
  loadedUpdatedAt: z.iso.datetime(),
});
export type VolunteerPersonAssignmentInput = z.input<
  typeof volunteerPersonAssignmentInputSchema
>;

/** "Turnos que puede": the full new set, and why. */
export const volunteerAvailabilityInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  shiftIds,
  reason: z
    .string()
    .trim()
    .max(
      VOLUNTEER_AVAILABILITY_REASON_MAX_LENGTH,
      "El motivo es demasiado largo.",
    )
    .optional()
    .transform((value) => value || null),
  loadedUpdatedAt: z.iso.datetime(),
});
export type VolunteerAvailabilityInput = z.input<
  typeof volunteerAvailabilityInputSchema
>;

export const volunteerListPageInputSchema = z.object({
  festivalId: id,
  offset: z.coerce.number().int().min(0).max(100_000),
});
export const volunteerReviewPageInputSchema =
  volunteerListPageInputSchema.extend({ sort: z.enum(VOLUNTEER_REVIEW_SORTS) });
export type VolunteerReviewPageInput = z.input<
  typeof volunteerReviewPageInputSchema
>;
export type VolunteerListPageInput = z.input<
  typeof volunteerListPageInputSchema
>;

/** Batch size of the infinite lists. */
export const VOLUNTEER_LIST_BATCH = 20;
