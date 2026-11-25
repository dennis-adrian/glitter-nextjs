import type { ReactNode } from "react";

import { ReviewPane } from "@/app/components/volunteers/admin/tasks/review-frame";
import { NoCallState } from "@/app/components/volunteers/admin/tasks/task-layouts";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import {
  fetchPendingReviewPage,
  type VolunteerReviewItem,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  VOLUNTEER_LIST_BATCH,
  VOLUNTEER_REVIEW_SORTS,
  type VolunteerReviewSort,
} from "@/app/lib/volunteers/admin-tasks";

/**
 * Revisar, below the tasks' header: the pending list, kept across the
 * applications opened from it, so picking one only loads that application
 * (`children`).
 * A layout gets no search params, so the list's first batch comes in every
 * sort and the frame shows the one in the URL.
 */
export default async function VolunteerReviewLayout(props: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  const batches = call.settings
    ? (Object.fromEntries(
        await Promise.all(
          VOLUNTEER_REVIEW_SORTS.map(
            async (sort) =>
              [
                sort,
                await fetchPendingReviewPage(
                  festivalId,
                  sort,
                  [],
                  VOLUNTEER_LIST_BATCH,
                ),
              ] as const,
          ),
        ),
      ) as Record<VolunteerReviewSort, VolunteerReviewItem[]>)
    : null;

  return (
    <ReviewPane
      festivalId={festivalId}
      noCall={<NoCallState festivalId={festivalId} />}
      batches={batches}
      total={call.statusTotals.pending}
      shiftTotal={call.shifts.filter((shift) => shift.isActive).length}
    >
      {props.children}
    </ReviewPane>
  );
}
