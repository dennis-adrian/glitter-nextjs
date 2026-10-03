import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import {
  FESTIVAL_SECTION_GROUP_LABELS,
  festivalSectionHref,
  visibleFestivalSections,
  type FestivalSectionGroup,
} from "@/app/components/festivals/festival-sections";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import type { FestivalOverviewCounts } from "@/app/lib/festivals/overview";
import { cn } from "@/app/lib/utils";

const GROUPS: FestivalSectionGroup[] = ["visitors", "participants", "spaces"];

function count(value: number, one: string, many: string) {
  return `${value.toLocaleString("es-BO")} ${value === 1 ? one : many}`;
}

/** A short live figure for the sections that have one worth a glance. */
function sectionFigure(key: string, counts: FestivalOverviewCounts) {
  switch (key) {
    case "tickets":
      return counts.tickets > 0
        ? count(counts.ticketHolders, "persona", "personas")
        : null;
    case "reservations":
      return counts.reservationsToVerify > 0
        ? `${counts.reservationsToVerify.toLocaleString("es-BO")} por verificar`
        : counts.reservations > 0
          ? count(counts.reservations, "activa", "activas")
          : null;
    case "activities":
      return counts.activities > 0
        ? count(counts.activities, "actividad", "actividades")
        : null;
    default:
      return null;
  }
}

/**
 * Every admin page under the festival, grouped by who it is about. On a
 * phone each group is a tappable list; wider screens lay the groups out in
 * two columns, and three once each column has room for its labels.
 */
export default function FestivalSectionsNav({
  festival,
  counts,
}: {
  festival: FestivalBase;
  counts: FestivalOverviewCounts;
}) {
  const sections = visibleFestivalSections(festival.status);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Gestionar</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((group) => (
          <nav
            key={group}
            aria-label={FESTIVAL_SECTION_GROUP_LABELS[group]}
            className="min-w-0"
          >
            <h3 className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {FESTIVAL_SECTION_GROUP_LABELS[group]}
            </h3>
            <ul className="divide-y xl:divide-y-0">
              {sections
                .filter((section) => section.group === group)
                .map((section) => {
                  const figure = sectionFigure(section.key, counts);
                  const urgent =
                    section.key === "reservations" &&
                    counts.reservationsToVerify > 0;
                  return (
                    <li key={section.key}>
                      <Link
                        href={festivalSectionHref(festival.id, section)}
                        className="group flex min-h-12 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-background">
                          <section.icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {section.label}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {/* Until the columns are wide enough, the figure
                                shares this line so it never squeezes the
                                label. */}
                            {figure ? (
                              <span
                                className={cn(
                                  "font-medium xl:hidden",
                                  urgent && "text-amber-800",
                                )}
                              >
                                {figure} ·{" "}
                              </span>
                            ) : null}
                            {section.description}
                          </span>
                        </span>
                        {figure ? (
                          <span
                            className={cn(
                              "hidden shrink-0 text-xs tabular-nums xl:inline",
                              urgent
                                ? "rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900"
                                : "text-muted-foreground",
                            )}
                          >
                            {figure}
                          </span>
                        ) : null}
                        <ChevronRightIcon
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </nav>
        ))}
      </CardContent>
    </Card>
  );
}
