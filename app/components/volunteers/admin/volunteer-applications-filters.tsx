import Link from "next/link";

import { volunteerStatusHref } from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_STATUS_FILTER_LABELS,
  VOLUNTEER_STATUS_FILTERS,
  type VolunteerApplicationsFilters as Filters,
  type VolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-definitions";

/**
 * The "Postulaciones" card's status chips, each with how many it holds under
 * the other filters. Links, so a filtered list can be shared or reloaded;
 * the search, the two filters and the pager live in the table below.
 */
export default function VolunteerApplicationsFilters({
  basePath,
  searchParams,
  filters,
  counts,
}: {
  /** The list's path, without a query string. */
  basePath: string;
  /** The URL's query, as the page received it. */
  searchParams: RawSearchParams;
  /** The same query, as the server parsed it: what actually applies. */
  filters: Filters;
  counts: VolunteerApplicationsPage["counts"];
}) {
  return (
    <nav
      aria-label="Estado de las postulaciones"
      className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {VOLUNTEER_STATUS_FILTERS.map((status) => {
        const active = status === filters.status;
        return (
          <Link
            key={status}
            href={volunteerStatusHref(basePath, searchParams, status)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none md:min-h-7",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground hover:bg-muted",
            )}
          >
            {VOLUNTEER_STATUS_FILTER_LABELS[status]}{" "}
            <span className="tabular-nums">{counts[status]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
