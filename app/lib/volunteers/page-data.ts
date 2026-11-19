import type { VolunteerCall } from "@/app/lib/volunteers/definitions";
import {
  formatCloseDate,
  formatFestivalDateTile,
  formatInduction,
  formatWeekdayDate,
} from "@/app/lib/volunteers/format";
import {
  formatCutoffDate,
  isVolunteerCallOpen,
} from "@/app/lib/volunteers/schema";

/**
 * What the /voluntarios pages show, derived once from the call so the
 * landing and the form say the same dates. Pure; `now` is injectable.
 */
export function volunteerPageView(call: VolunteerCall, now = new Date()) {
  const close = formatCloseDate(call.applicationsCloseAt);
  const earliestShift = call.shifts.reduce<Date | null>(
    (min, shift) =>
      min === null || shift.startsAt < min ? shift.startsAt : min,
    null,
  );
  return {
    /** Accepting applications: before the close, with shifts and two roles. */
    open:
      isVolunteerCallOpen(call.applicationsCloseAt, now) &&
      call.ageCutoffDate !== null &&
      call.roles.length >= 2,
    /** "lunes 30 de noviembre, 23:59" */
    closesShort: `${close.weekdayDate}, ${close.time}`,
    /** "lunes 30 de noviembre a las 23:59" */
    closesLong: `${close.weekdayDate} a las ${close.time}`,
    /** "30 de noviembre" */
    closesOn: close.date,
    dateTile: formatFestivalDateTile(call.festival.days),
    venue:
      [call.festival.locationLabel, call.festival.address]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(", ") || null,
    setupDay: earliestShift ? formatWeekdayDate(earliestShift) : null,
    ageCutoff: call.ageCutoffDate ? formatCutoffDate(call.ageCutoffDate) : null,
    induction: call.induction ? formatInduction(call.induction) : null,
  };
}
