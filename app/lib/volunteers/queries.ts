import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { cache } from "react";

import type {
  VolunteerCall,
  VolunteerRole,
  VolunteerShift,
} from "@/app/lib/volunteers/definitions";
import { volunteerAgeCutoffDate } from "@/app/lib/volunteers/schema";
import { db } from "@/db";
import {
  festivalDates,
  festivals,
  volunteerCallSettings,
  volunteerRoles,
  volunteerShifts,
} from "@/db/schema";

/**
 * Reads for the volunteer call. Roles and shifts always come from the
 * festival's own rows, active ones only: the public page, the form and the
 * server action's validation all see the same lists.
 */

export async function fetchActiveVolunteerRoles(
  festivalId: number,
): Promise<VolunteerRole[]> {
  return db
    .select({
      id: volunteerRoles.id,
      name: volunteerRoles.name,
      description: volunteerRoles.description,
    })
    .from(volunteerRoles)
    .where(
      and(
        eq(volunteerRoles.festivalId, festivalId),
        eq(volunteerRoles.isActive, true),
      ),
    )
    .orderBy(asc(volunteerRoles.sortOrder), asc(volunteerRoles.id));
}

export async function fetchActiveVolunteerShifts(
  festivalId: number,
): Promise<VolunteerShift[]> {
  return db
    .select({
      id: volunteerShifts.id,
      label: volunteerShifts.label,
      startsAt: volunteerShifts.startsAt,
      endsAt: volunteerShifts.endsAt,
    })
    .from(volunteerShifts)
    .where(
      and(
        eq(volunteerShifts.festivalId, festivalId),
        eq(volunteerShifts.isActive, true),
      ),
    )
    .orderBy(
      asc(volunteerShifts.sortOrder),
      asc(volunteerShifts.startsAt),
      asc(volunteerShifts.id),
    );
}

async function loadCall(
  settings: typeof volunteerCallSettings.$inferSelect,
): Promise<VolunteerCall | null> {
  const [festival] = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      locationLabel: festivals.locationLabel,
      address: festivals.address,
    })
    .from(festivals)
    .where(eq(festivals.id, settings.festivalId))
    .limit(1);
  if (!festival) return null;

  const [roles, shifts, days] = await Promise.all([
    fetchActiveVolunteerRoles(festival.id),
    fetchActiveVolunteerShifts(festival.id),
    db
      .select({ startDate: festivalDates.startDate })
      .from(festivalDates)
      .where(eq(festivalDates.festivalId, festival.id))
      .orderBy(asc(festivalDates.startDate)),
  ]);

  return {
    festival: { ...festival, days: days.map((day) => day.startDate) },
    applicationsCloseAt: settings.applicationsCloseAt,
    inductionAt: settings.inductionAt,
    roles,
    shifts,
    ageCutoffDate: volunteerAgeCutoffDate(shifts),
  };
}

/**
 * The call `/voluntarios` shows: the festival whose volunteer call closes
 * last. It keeps showing (as "Convocatoria cerrada") after it closes, until a
 * later festival's call is configured. Null when no festival has one.
 */
export const fetchCurrentVolunteerCall = cache(
  async (): Promise<VolunteerCall | null> => {
    const [settings] = await db
      .select()
      .from(volunteerCallSettings)
      .orderBy(
        desc(volunteerCallSettings.applicationsCloseAt),
        desc(volunteerCallSettings.id),
      )
      .limit(1);
    return settings ? loadCall(settings) : null;
  },
);

/** A specific festival's call, for the server action. */
export async function fetchVolunteerCallForFestival(
  festivalId: number,
): Promise<VolunteerCall | null> {
  const [settings] = await db
    .select()
    .from(volunteerCallSettings)
    .where(eq(volunteerCallSettings.festivalId, festivalId))
    .limit(1);
  return settings ? loadCall(settings) : null;
}
