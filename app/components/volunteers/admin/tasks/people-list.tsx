"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import { Badge } from "@/app/components/ui/badge";
import InfiniteList from "@/app/components/volunteers/admin/tasks/infinite-list";
import { loadVolunteerPeoplePage } from "@/app/lib/volunteers/admin-actions";
import { volunteerApplicationAdminPath } from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerPersonItem,
  VolunteerTaskShift,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  busiestDayOverLimit,
  formatWeekdayName,
  plural,
} from "@/app/lib/volunteers/admin-tasks";
import {
  compareShiftsByStart,
  formatShiftStartShort,
} from "@/app/lib/volunteers/format";

function PersonCard({
  festivalId,
  person,
  shifts,
}: {
  festivalId: number;
  person: VolunteerPersonItem;
  shifts: VolunteerTaskShift[];
}) {
  const marked = shifts.filter(
    (shift) => shift.isActive && person.availableShiftIds.includes(shift.id),
  ).length;
  const held = shifts
    .filter((shift) => person.assignedShiftIds.includes(shift.id))
    .sort(compareShiftsByStart);
  const over = busiestDayOverLimit(held);
  return (
    <Link
      href={volunteerApplicationAdminPath(festivalId, person.id)}
      className="flex min-w-0 items-center gap-3 rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-xs transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <strong className="font-semibold break-words wrap-anywhere">
            {person.fullName}
          </strong>
          {held.length === 0 && <Badge variant="amber">Sin turnos</Badge>}
          {over && (
            <Badge variant="outline">
              {over.count} turnos el {formatWeekdayName(over.day)}
            </Badge>
          )}
        </span>
        {held.length === 0 ? (
          <span className="break-words text-muted-foreground">
            1ª {person.firstChoiceRoleName} · puede{" "}
            {plural(marked, "turno", "turnos")}
          </span>
        ) : (
          <>
            <span className="break-words text-muted-foreground">
              {person.assignedRoleName ?? "Sin rol"} ·{" "}
              {plural(held.length, "turno", "turnos")} de {marked} que puede
            </span>
            <span className="break-words">
              {held.map(formatShiftStartShort).join(" · ")}
            </span>
          </>
        )}
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

/**
 * "Elegí una persona para darle turnos": the accepted people, those without
 * shifts first, loading more as it scrolls.
 */
export default function VolunteerPeopleList({
  festivalId,
  items,
  total,
  shifts,
}: {
  festivalId: number;
  items: VolunteerPersonItem[];
  total: number;
  shifts: VolunteerTaskShift[];
}) {
  const loadMore = useCallback(
    (seenIds: number[]) => loadVolunteerPeoplePage({ festivalId, seenIds }),
    [festivalId],
  );
  return (
    <section
      aria-labelledby="people-title"
      className="flex min-w-0 flex-col gap-2"
    >
      <h2 id="people-title" className="text-lg leading-7 font-semibold">
        Elegí una persona para darle turnos
      </h2>
      {total === 0 ? (
        <p className="text-muted-foreground">
          Todavía no hay personas aceptadas.
        </p>
      ) : (
        <InfiniteList
          initialItems={items}
          loadMore={loadMore}
          loadingLabel="Cargando más personas"
          className="gap-2"
          skeletonClassName="mt-2"
          renderItem={(person) => (
            <PersonCard
              festivalId={festivalId}
              person={person}
              shifts={shifts}
            />
          )}
        />
      )}
    </section>
  );
}
