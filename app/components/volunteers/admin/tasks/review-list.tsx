"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import InfiniteList from "@/app/components/volunteers/admin/tasks/infinite-list";
import { cn } from "@/app/lib/utils";
import { loadVolunteerReviewPage } from "@/app/lib/volunteers/admin-actions";
import { ageOn } from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerReviewItem } from "@/app/lib/volunteers/admin-task-queries";
import {
  plural,
  VOLUNTEER_REVIEW_SORT_LABELS,
  VOLUNTEER_REVIEW_SORTS,
  volunteerReviewHref,
  type VolunteerReviewSort,
} from "@/app/lib/volunteers/admin-tasks";
import { formatYears } from "@/app/lib/volunteers/format";

export function ReviewSortSelect({
  festivalId,
  sort,
  id = "volunteer-review-sort",
}: {
  festivalId: number;
  sort: VolunteerReviewSort;
  id?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <label htmlFor={id} className="shrink-0">
        Ordenar por
      </label>
      <div className="min-w-0 flex-[1_1_14rem] text-foreground">
        <Select
          value={sort}
          onValueChange={(value) =>
            router.push(
              volunteerReviewHref(festivalId, value as VolunteerReviewSort),
            )
          }
        >
          <SelectTrigger id={id} aria-label="Ordenar por" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOLUNTEER_REVIEW_SORTS.map((option) => (
              <SelectItem key={option} value={option}>
                {VOLUNTEER_REVIEW_SORT_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ReviewCard({
  item,
  href,
  shiftTotal,
  selected,
  today,
}: {
  item: VolunteerReviewItem;
  href: string;
  shiftTotal: number;
  selected: boolean;
  today?: Date;
}) {
  const age = ageOn(item.birthdate, today);
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "lg:gap-0.5 lg:rounded-none lg:border-0 lg:border-t lg:px-4 lg:py-3 lg:shadow-none",
        selected && "lg:bg-accent",
      )}
    >
      <span className="flex min-w-0 items-baseline justify-between gap-2 lg:justify-start">
        <strong className="min-w-0 font-semibold break-words wrap-anywhere">
          {item.fullName}
        </strong>
        {Number.isFinite(age) && age >= 0 && (
          <span className="shrink-0 text-muted-foreground">
            <span className="hidden lg:inline">· </span>
            {formatYears(age)}
          </span>
        )}
      </span>
      <span className="line-clamp-2 break-words lg:hidden">
        “{item.motivation}”
      </span>
      <span className="break-words text-muted-foreground">
        1ª {item.firstChoiceRoleName} · puede {item.availableCount} de{" "}
        {shiftTotal}
        <span className="lg:hidden"> turnos</span>
      </span>
    </Link>
  );
}

/**
 * Revisar's list: "N pendientes", "Ordenar por" and the pending
 * applications, loading more as it scrolls. Cards on phones; rows inside a
 * card beside the open application on desktop.
 */
export default function VolunteerReviewList({
  festivalId,
  sort,
  items,
  total,
  shiftTotal,
  selectedId,
  today,
  className,
}: {
  festivalId: number;
  sort: VolunteerReviewSort;
  /** The first batch. */
  items: VolunteerReviewItem[];
  total: number;
  /** Active shifts, for "puede 3 de 6". */
  shiftTotal: number;
  /** The application open beside the list (desktop). */
  selectedId?: number;
  today?: Date;
  className?: string;
}) {
  const loadMore = useCallback(
    (offset: number) => loadVolunteerReviewPage({ festivalId, sort, offset }),
    [festivalId, sort],
  );

  return (
    <section
      aria-labelledby="volunteer-review-list-title"
      className={cn(
        "flex min-w-0 flex-col gap-3.5 lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border lg:bg-card",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3.5 lg:gap-2.5 lg:p-4 lg:pb-3">
        <h2
          id="volunteer-review-list-title"
          className="text-lg leading-7 font-semibold"
        >
          {plural(total, "pendiente", "pendientes")}
        </h2>
        {total > 0 && <ReviewSortSelect festivalId={festivalId} sort={sort} />}
      </div>
      {total === 0 ? (
        <p className="text-muted-foreground lg:border-t lg:px-4 lg:py-3">
          No hay postulaciones pendientes.
        </p>
      ) : (
        <InfiniteList
          initialItems={items}
          total={total}
          loadMore={loadMore}
          loadingLabel="Cargando más postulaciones"
          className="gap-2 lg:gap-0"
          skeletonClassName="mt-2 lg:m-0 lg:rounded-none lg:border-0 lg:border-t"
          renderItem={(item) => (
            <ReviewCard
              item={item}
              href={volunteerReviewHref(festivalId, sort, item.id)}
              shiftTotal={shiftTotal}
              selected={item.id === selectedId}
              today={today}
            />
          )}
        />
      )}
    </section>
  );
}
