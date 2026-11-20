import Link from "next/link";

import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplicationsFilters,
  type VolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-definitions";

type StatusFilter = VolunteerApplicationsFilters["status"];

const TABS = [...VOLUNTEER_APPLICATION_STATUSES, "all"] as const;

export const VOLUNTEER_STATUS_TAB_LABELS: Record<StatusFilter, string> = {
  pending: "Por revisar",
  accepted: "Aceptadas",
  waitlist: "En espera",
  rejected: "Rechazadas",
  all: "Todas",
};

/**
 * The link to `status` that keeps the search, filters and page size but
 * starts over at the first page. "Por revisar" is the default, so its link
 * carries no status.
 */
export function volunteerStatusTabHref(
  searchParams: RawSearchParams,
  status: StatusFilter,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(searchParams)) {
    if (key === "status" || key === "offset") continue;
    for (const item of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      params.append(key, item);
    }
  }
  if (status !== "pending") params.set("status", status);
  const query = params.toString();
  return query ? `?${query}` : "?";
}

/**
 * The inbox's states, as tabs with how many each holds under the current
 * search and filters.
 */
export default function VolunteerApplicationsStatusTabs({
  status,
  counts,
  searchParams,
}: {
  status: StatusFilter;
  counts: VolunteerApplicationsPage["counts"];
  searchParams: RawSearchParams;
}) {
  return (
    <nav
      aria-label="Estado de las postulaciones"
      className="flex shrink-0 gap-1 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((value) => {
        const isActive = value === status;
        const count = counts[value];
        return (
          <Link
            key={value}
            href={volunteerStatusTabHref(searchParams, value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              isActive
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {VOLUNTEER_STATUS_TAB_LABELS[value]}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                value === "pending" && count > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
