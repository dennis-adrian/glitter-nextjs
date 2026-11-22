import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import {
  ageOn,
  type VolunteerAdminShift,
  type VolunteerApplicationsFilters,
  type VolunteerStatusFilter,
} from "@/app/lib/volunteers/admin-definitions";
import { volunteerAllApplicationsPath } from "@/app/lib/volunteers/admin-tasks";
import {
  compareShiftsByStart,
  formatShiftStartShort,
  formatYears,
} from "@/app/lib/volunteers/format";

export { formatShiftStartShort };

/**
 * The status chips' links and the compact way the list shows shifts. Pure
 * and server-safe. Search, the two filters and paging are DataTable's URL
 * state; only the chips build their own links.
 */

/**
 * A status chip's link: the current query with its status and offset
 * dropped, so the other filters stay and the list starts over. "Todas" is
 * the default, so it carries no status.
 */
export function volunteerStatusHref(
  basePath: string,
  current: RawSearchParams,
  status: VolunteerStatusFilter,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(current)) {
    if (key === "status" || key === "offset") continue;
    for (const value of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      params.append(key, value);
    }
  }
  if (status !== "all") params.set("status", status);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * The list's two views on phones: the applications, or the coverage per
 * shift. From md the page shows both and ignores it.
 */
export const VOLUNTEER_ADMIN_VIEWS = ["postulaciones", "cobertura"] as const;
export type VolunteerAdminView = (typeof VOLUNTEER_ADMIN_VIEWS)[number];

/** The `view` param; anything else (or several) is the default view. */
export function parseVolunteerAdminView(
  searchParams: RawSearchParams,
): VolunteerAdminView {
  const raw = searchParams.view;
  return raw === "cobertura" ? "cobertura" : "postulaciones";
}

/**
 * A view's link: the current query with its view swapped, so the filters
 * and page survive switching back and forth. "postulaciones" is the default,
 * so it carries no view.
 */
export function volunteerViewHref(
  basePath: string,
  current: RawSearchParams,
  view: VolunteerAdminView,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(current)) {
    if (key === "view") continue;
    for (const value of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      params.append(key, value);
    }
  }
  if (view !== "postulaciones") params.set("view", view);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function hasVolunteerFilters(filters: VolunteerApplicationsFilters) {
  return (
    Boolean(filters.query) || filters.roleId != null || filters.shiftId != null
  );
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
  const listed = shifts
    .filter((shift) => chosen.has(shift.id))
    .sort(compareShiftsByStart);
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
    Number.isFinite(age) && age >= 0 ? formatYears(age) : null,
    item.phone || null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** The full list's Cobertura view. */
export function volunteerCoverageHref(festivalId: number) {
  return volunteerViewHref(
    volunteerAllApplicationsPath(festivalId),
    {},
    "cobertura",
  );
}
