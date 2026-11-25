"use client";

import { useParams, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import VolunteerReviewList from "@/app/components/volunteers/admin/tasks/review-list";
import { VolunteerReviewDetailSkeleton } from "@/app/components/volunteers/admin/tasks/task-skeletons";
import {
  soloContents,
  soloHidden,
  VolunteerTaskLoading,
} from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";
import { cn } from "@/app/lib/utils";
import type { VolunteerReviewItem } from "@/app/lib/volunteers/admin-task-queries";
import {
  parseVolunteerReviewSort,
  type VolunteerReviewSort,
} from "@/app/lib/volunteers/admin-tasks";

/**
 * Loading of the application open in Revisar: only the detail, so the list
 * beside it stays; or a whole-page skeleton when a whole-page screen (an
 * accepted person) is on show or on its way.
 */
export function VolunteerReviewLoading() {
  return (
    <VolunteerTaskLoading>
      <VolunteerReviewDetailSkeleton />
    </VolunteerTaskLoading>
  );
}

/**
 * Revisar's list and, beside it from lg, the open application (`children`),
 * kept by Revisar's layout across the applications opened from the list:
 * only `children` changes, so the list keeps what it loaded and where it was
 * scrolled. The sort and the open application come from the URL. On phones
 * the list is the index and an application has the whole screen.
 */
export function ReviewPane({
  festivalId,
  noCall,
  batches,
  total,
  shiftTotal,
  children,
}: {
  festivalId: number;
  /** In place of the list and the application, before the call exists. */
  noCall: ReactNode;
  /** The first batch of the list in every sort. */
  batches: Record<VolunteerReviewSort, VolunteerReviewItem[]> | null;
  total: number;
  shiftTotal: number;
  children: ReactNode;
}) {
  const applicationId = useParams<{ applicationId?: string }>()?.applicationId;
  const sort = parseVolunteerReviewSort(
    useSearchParams().get("orden") ?? undefined,
  );
  const openId =
    applicationId === undefined ? undefined : Number(applicationId);
  const listOnPhone = openId === undefined;
  const items = batches?.[sort] ?? [];

  if (!batches) {
    return (
      <>
        <div className={soloHidden}>{noCall}</div>
        <div className="hidden group-has-[[data-volunteer-solo]]/volunteer-tasks:contents">
          {children}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start",
        soloContents,
      )}
    >
      <VolunteerReviewList
        festivalId={festivalId}
        sort={sort}
        items={items}
        total={total}
        shiftTotal={shiftTotal}
        // At the index, the first one is open beside the list.
        selectedId={openId ?? items[0]?.id}
        className={cn(
          "lg:w-90 lg:shrink-0",
          !listOnPhone && "max-lg:hidden",
          soloHidden,
        )}
      />
      <div
        className={cn(
          "min-w-0 flex-1",
          listOnPhone && "max-lg:hidden",
          soloContents,
        )}
      >
        {children}
      </div>
    </div>
  );
}
