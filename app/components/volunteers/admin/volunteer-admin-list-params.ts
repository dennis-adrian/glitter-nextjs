import { DateTime } from "luxon";

import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import {
  ageOn,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
  type VolunteerApplicationsFilters,
  type VolunteerStatusFilter,
} from "@/app/lib/volunteers/admin-definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

/**
 * The volunteer list's URL state and the compact way it shows shifts. Pure
 * and server-safe: the page's server components and the client filters both
 * build their links with these.
 */

type ListParam = "status" | "query" | "roleId" | "shiftId" | "offset";

/**
 * `basePath` with the current query string, `changes` applied (null drops a
 * parameter) and, unless `changes` sets one, back on the first page: page
 * four of one filter is rarely page four of another.
 */
export function volunteerListHref(
  basePath: string,
  current: RawSearchParams,
  changes: Partial<Record<ListParam, string | null>>,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(current)) {
    if (key === "offset" || key in changes) continue;
    for (const value of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      params.append(key, value);
    }
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** A status chip's link; "Todas" is the default, so it carries no status. */
export function volunteerStatusHref(
  basePath: string,
  current: RawSearchParams,
  status: VolunteerStatusFilter,
) {
  return volunteerListHref(basePath, current, {
    status: status === "all" ? null : status,
  });
}

/** Without the search and the two filters; the status chip stays. */
export function clearVolunteerFiltersHref(
  basePath: string,
  current: RawSearchParams,
) {
  return volunteerListHref(basePath, current, {
    query: null,
    roleId: null,
    shiftId: null,
  });
}

export function hasVolunteerFilters(filters: VolunteerApplicationsFilters) {
  return (
    Boolean(filters.query) || filters.roleId != null || filters.shiftId != null
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "Vie 18 15:00": a shift's day and start, short enough to list several. */
export function formatShiftStartShort(
  shift: Pick<VolunteerAdminShift, "startsAt">,
) {
  const start = DateTime.fromJSDate(shift.startsAt, {
    zone: STORE_TIMEZONE,
  }).setLocale("es");
  const weekday = capitalize(start.toFormat("ccc").replace(".", ""));
  return `${weekday} ${start.day} ${start.toFormat("HH:mm")}`;
}

function byStart(a: VolunteerAdminShift, b: VolunteerAdminShift) {
  return a.startsAt.getTime() - b.startsAt.getTime() || a.id - b.id;
}

/**
 * The shifts `ids` names, as "Vie 18 15:00 · Sáb 19 13:30" in time order;
 * "Los N turnos" when `all` is set and they cover every active shift. Ids of
 * shifts no longer in `shifts` are left out; null when none is left.
 */
export function formatShiftList(
  ids: readonly number[],
  shifts: readonly VolunteerAdminShift[],
  { all = false }: { all?: boolean } = {},
): string | null {
  const chosen = new Set(ids);
  const listed = shifts.filter((shift) => chosen.has(shift.id)).sort(byStart);
  if (listed.length === 0) return null;
  if (all) {
    const active = shifts.filter((shift) => shift.isActive);
    if (active.length > 1 && active.every((shift) => chosen.has(shift.id))) {
      return `Los ${active.length} turnos`;
    }
  }
  return listed.map(formatShiftStartShort).join(" · ");
}

/** "22 años · +591 70000001", leaving out an age that cannot be worked out. */
export function volunteerAgeAndPhone(
  item: { birthdate: string; phone: string },
  today?: Date,
) {
  const age = ageOn(item.birthdate, today);
  const parts = [
    Number.isFinite(age) && age >= 0
      ? `${age} ${age === 1 ? "año" : "años"}`
      : null,
    item.phone || null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** The role filter's name, or its id once the role is gone. */
export function roleFilterLabel(
  roles: readonly VolunteerAdminRole[],
  roleId: number,
) {
  return roles.find((role) => role.id === roleId)?.name ?? `Rol #${roleId}`;
}

/**
 * The shift filter's name: "Vie 18 15:00" on its badge, "Vie 18 dic ·
 * 15:00–19:00 (Montaje)" with `long`; its id once the shift is gone.
 */
export function shiftFilterLabel(
  shifts: readonly VolunteerAdminShift[],
  shiftId: number,
  long = false,
) {
  const shift = shifts.find((item) => item.id === shiftId);
  if (!shift) return `Turno #${shiftId}`;
  return long
    ? `${formatShiftWhen(shift)} (${shift.label})`
    : formatShiftStartShort(shift);
}
