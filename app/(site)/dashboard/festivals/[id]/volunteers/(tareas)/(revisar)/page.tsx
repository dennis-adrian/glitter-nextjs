import type { Metadata } from "next";

import VolunteerReviewScreen from "@/app/components/volunteers/admin/tasks/review-screen";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { fetchVolunteerApplicationDetail } from "@/app/lib/volunteers/admin-queries";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import {
  fetchPendingReviewIds,
  fetchVolunteerNotes,
} from "@/app/lib/volunteers/admin-task-queries";
import { parseVolunteerReviewSort } from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Voluntarios" };

/**
 * Revisar: the pending applications, oldest first unless `orden` says
 * otherwise. The layout shows the list; from lg the first of them is open
 * beside it.
 */
export default async function VolunteerReviewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  if (!call.settings) return null;
  const sort = parseVolunteerReviewSort((await props.searchParams).orden);

  const order = await fetchPendingReviewIds(festivalId, sort);
  const firstId = order[0];
  if (firstId === undefined) return null;
  const [application, notes] = await Promise.all([
    fetchVolunteerApplicationDetail(festivalId, firstId),
    fetchVolunteerNotes(festivalId, firstId),
  ]);
  if (!application) return null;

  return (
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
  );
}
