import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import VolunteerAvailabilityForm from "@/app/components/volunteers/admin/tasks/availability-form";
import { VolunteerSoloScreen } from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";
import { volunteerApplicationAdminPath } from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerApplicationDetail } from "@/app/lib/volunteers/admin-queries";
import {
  loadVolunteerTaskPage,
  parsePageId,
} from "@/app/lib/volunteers/admin-task-page";
import { fetchAdminAddedShiftIds } from "@/app/lib/volunteers/admin-task-queries";

export const metadata: Metadata = { title: "Turnos que puede" };

/** The shifts an applicant can cover, as an admin changes them. */
export default async function VolunteerAvailabilityPage(props: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  const params = await props.params;
  const { festivalId, call } = await loadVolunteerTaskPage(params.id);
  const applicationId = parsePageId(params.applicationId);
  const [application, adminAdded] = await Promise.all([
    fetchVolunteerApplicationDetail(festivalId, applicationId),
    fetchAdminAddedShiftIds(festivalId, applicationId),
  ]);
  if (!application) notFound();
  const backHref = volunteerApplicationAdminPath(festivalId, applicationId);

  return (
    <VolunteerSoloScreen>
      <ScreenTitle title="Turnos que puede" backHref={backHref} />
      {/* Remounts on every revision, so the selection and the
          loadedUpdatedAt it saves against always come from the same one. */}
      <VolunteerAvailabilityForm
        key={application.updatedAt.getTime()}
        festivalId={festivalId}
        application={application}
        shifts={call.shifts}
        adminAddedShiftIds={adminAdded}
        backHref={backHref}
      />
    </VolunteerSoloScreen>
  );
}
