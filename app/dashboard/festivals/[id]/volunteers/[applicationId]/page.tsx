import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import VolunteerPersonScreen from "@/app/components/volunteers/admin/tasks/person-screen";
import VolunteerReviewScreen from "@/app/components/volunteers/admin/tasks/review-screen";
import { ReviewLayout } from "@/app/components/volunteers/admin/tasks/task-layouts";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { volunteerApplicationAdminPath } from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerApplicationDetail } from "@/app/lib/volunteers/admin-queries";
import {
  loadVolunteerTaskPage,
  parsePageId,
} from "@/app/lib/volunteers/admin-task-page";
import {
  fetchAcceptedPeopleIds,
  fetchPendingReviewIds,
  fetchPendingReviewPage,
  fetchVolunteerNotes,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  parseVolunteerReviewSort,
  reviewPosition,
  VOLUNTEER_LIST_BATCH,
  volunteerAssignPath,
  volunteerPeoplePath,
  volunteerReviewHref,
} from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Postulación" };

/**
 * One application. Pending (or waitlisted, or not accepted): Revisar's
 * screen, flipping through the pending ones in `orden`'s order, beside the
 * list from lg. Accepted: the person's assignment and contact, or, without
 * shifts or with `asignar`, "Darle rol y turnos". `revisar` opens Revisar's
 * screen on an accepted one ("Cambiar decisión").
 */
export default async function VolunteerApplicationPage(props: {
  params: Promise<{ id: string; applicationId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await props.params;
  const { festivalId, call } = await loadVolunteerTaskPage(params.id);
  const applicationId = parsePageId(params.applicationId);
  const searchParams = await props.searchParams;
  const sort = parseVolunteerReviewSort(searchParams.orden);

  const [application, notes] = await Promise.all([
    fetchVolunteerApplicationDetail(festivalId, applicationId),
    fetchVolunteerNotes(festivalId, applicationId),
  ]);
  if (!application) notFound();
  const path = volunteerApplicationAdminPath(festivalId, applicationId);

  if (application.status === "accepted" && searchParams.revisar === undefined) {
    const withoutShifts = application.assignedShiftIds.length === 0;
    const ids = await fetchAcceptedPeopleIds(festivalId, { withoutShifts });
    const position = reviewPosition(ids, applicationId);
    const href = (id: number | null) =>
      id === null ? null : volunteerApplicationAdminPath(festivalId, id);
    return (
      <>
        <ScreenTitle
          title={application.fullName}
          backHref={volunteerPeoplePath(festivalId)}
        />
        <VolunteerPersonScreen
          festivalId={festivalId}
          application={application}
          roles={call.roles}
          shifts={call.shifts}
          notes={notes}
          flip={
            position.position === 0
              ? null
              : {
                  label: withoutShifts
                    ? `${position.position} de ${position.total} sin turnos`
                    : `${position.position} de ${position.total}`,
                  previousHref: href(position.previousId),
                  nextHref: href(position.nextId),
                }
          }
          backHref={
            withoutShifts
              ? volunteerPeoplePath(festivalId)
              : volunteerAssignPath(festivalId)
          }
          backLabel={withoutShifts ? "Por persona" : "Asignar"}
          assigning={withoutShifts || searchParams.asignar !== undefined}
          summaryHref={path}
          assignHref={`${path}?asignar=1`}
          decisionHref={`${path}?revisar=1`}
        />
      </>
    );
  }

  const [items, order] = await Promise.all([
    fetchPendingReviewPage(festivalId, sort, 0, VOLUNTEER_LIST_BATCH),
    fetchPendingReviewIds(festivalId, sort),
  ]);

  return (
    <>
      <ScreenTitle
        title={application.fullName}
        backHref={volunteerReviewHref(festivalId, sort)}
      />
      <ReviewLayout
        call={call}
        sort={sort}
        items={items}
        selectedId={applicationId}
        listOnPhone={false}
        detail={
          <VolunteerReviewScreen
            festivalId={festivalId}
            application={application}
            roles={call.roles}
            shifts={call.shifts}
            notes={notes}
            order={order}
            sort={sort}
          />
        }
      />
    </>
  );
}
