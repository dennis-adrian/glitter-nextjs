import type { Metadata } from "next";

import VolunteerReviewScreen from "@/app/components/volunteers/admin/tasks/review-screen";
import { ReviewLayout } from "@/app/components/volunteers/admin/tasks/task-layouts";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { fetchVolunteerApplicationDetail } from "@/app/lib/volunteers/admin-queries";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import {
  fetchPendingReviewIds,
  fetchPendingReviewPage,
  fetchVolunteerNotes,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  parseVolunteerReviewSort,
  VOLUNTEER_LIST_BATCH,
} from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Voluntarios" };

/**
 * Revisar: the pending applications, oldest first unless `orden` says
 * otherwise. From lg the first of them is open beside the list.
 */
export default async function VolunteerReviewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  const sort = parseVolunteerReviewSort((await props.searchParams).orden);

  const [items, order] = call.settings
    ? await Promise.all([
        fetchPendingReviewPage(festivalId, sort, [], VOLUNTEER_LIST_BATCH),
        fetchPendingReviewIds(festivalId, sort),
      ])
    : [[], []];
  const firstId = order[0];
  const [application, notes] =
    firstId === undefined
      ? [null, []]
      : await Promise.all([
          fetchVolunteerApplicationDetail(festivalId, firstId),
          fetchVolunteerNotes(festivalId, firstId),
        ]);

  return (
    <ReviewLayout
      call={call}
      sort={sort}
      items={items}
      selectedId={firstId}
      listOnPhone
      detail={
        application && (
          <VolunteerReviewScreen
            key={application.id}
            festivalId={festivalId}
            application={application}
            roles={call.roles}
            shifts={call.shifts}
            notes={notes}
            order={order}
            sort={sort}
          />
        )
      }
    />
  );
}
