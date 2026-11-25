import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import VolunteerPersonScreen from "@/app/components/volunteers/admin/tasks/person-screen";
import VolunteerReviewScreen from "@/app/components/volunteers/admin/tasks/review-screen";
import { VolunteerSoloScreen } from "@/app/components/volunteers/admin/tasks/review-frame";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import {
  volunteerApplicationAdminPath,
  volunteerShiftAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerApplicationDetail } from "@/app/lib/volunteers/admin-queries";
import {
  loadVolunteerTaskPage,
  parsePageId,
} from "@/app/lib/volunteers/admin-task-page";
import {
  fetchAcceptedPeopleIds,
  fetchPendingReviewIds,
  fetchVolunteerNotes,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  parseVolunteerPersonEntry,
  parseVolunteerPersonGroup,
  parseVolunteerReviewSort,
  reviewPosition,
  volunteerAssignPath,
  volunteerPeoplePath,
  volunteerPersonHref,
  volunteerReviewHref,
} from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Postulación" };

/**
 * One application. Pending (or waitlisted, or not accepted): Revisar's
 * screen, flipping through the pending ones in `orden`'s order, beside the
 * layout's list from lg. Accepted: the person's assignment and contact, or, without
 * shifts or with `asignar`, "Darle rol y turnos". `revisar` opens Revisar's
 * screen on an accepted one ("Cambiar decisión"). An accepted person takes
 * the whole page, without the layout's header and list.
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
    // The group flipping started in, kept by the links; on first arrival,
    // the person's own.
    const group =
      parseVolunteerPersonGroup(searchParams.grupo) ??
      (withoutShifts ? "sin-turnos" : "todas");
    const ids = await fetchAcceptedPeopleIds(festivalId, {
      withoutShifts: group === "sin-turnos",
    });
    const position = reviewPosition(ids, applicationId);
    // Back where it was opened from: Por persona or one shift's screen;
    // opened from elsewhere, the mockups' default for its group.
    const entry = parseVolunteerPersonEntry(searchParams.desde);
    const back =
      entry?.kind === "turno"
        ? {
            href: volunteerShiftAdminPath(festivalId, entry.shiftId),
            label: "Asignar",
          }
        : entry?.kind === "personas" || withoutShifts
          ? { href: volunteerPeoplePath(festivalId), label: "Por persona" }
          : { href: volunteerAssignPath(festivalId), label: "Asignar" };
    const href = (id: number | null) =>
      id === null ? null : volunteerPersonHref(festivalId, id, entry, group);
    const self = volunteerPersonHref(festivalId, applicationId, entry);
    const withParam = (param: string) =>
      `${self}${self.includes("?") ? "&" : "?"}${param}`;
    return (
      <VolunteerSoloScreen>
        <ScreenTitle title={application.fullName} backHref={back.href} />
        <VolunteerPersonScreen
          key={application.id}
          festivalId={festivalId}
          application={application}
          roles={call.roles}
          shifts={call.shifts}
          notes={notes}
          flip={
            position.position === 0
              ? null
              : {
                  label:
                    group === "sin-turnos"
                      ? `${position.position} de ${position.total} sin turnos`
                      : `${position.position} de ${position.total}`,
                  previousHref: href(position.previousId),
                  nextHref: href(position.nextId),
                }
          }
          backHref={back.href}
          backLabel={back.label}
          assigning={withoutShifts || searchParams.asignar !== undefined}
          summaryHref={self}
          assignHref={withParam("asignar=1")}
          decisionHref={`${path}?revisar=1`}
        />
      </VolunteerSoloScreen>
    );
  }

  const order = await fetchPendingReviewIds(festivalId, sort);

  return (
    <>
      <ScreenTitle
        title={application.fullName}
        backHref={volunteerReviewHref(festivalId, sort)}
      />
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
    </>
  );
}
