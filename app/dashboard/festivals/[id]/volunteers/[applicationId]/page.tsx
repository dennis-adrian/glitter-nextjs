import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import VolunteerApplicationDetailView from "@/app/components/volunteers/admin/volunteer-application-detail-view";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import {
  POSTGRES_INT_MAX,
  volunteerAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import {
  fetchVolunteerAdminCall,
  fetchVolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-queries";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
  applicationId: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
});

export const metadata: Metadata = { title: "Postulación" };

/**
 * One volunteer application: how to reach the applicant, what they chose,
 * and the team's decision, assignment and notes.
 */
export default async function VolunteerApplicationPage(props: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await props.params);
  if (!parsed.success) notFound();
  const { id: festivalId, applicationId } = parsed.data;

  const [call, application] = await Promise.all([
    fetchVolunteerAdminCall(festivalId),
    fetchVolunteerApplicationDetail(festivalId, applicationId),
  ]);
  if (!call || !application) notFound();

  return (
    <>
      <ScreenTitle
        title={application.fullName}
        backHref={volunteerAdminPath(festivalId)}
      />
      <VolunteerApplicationDetailView
        festivalId={festivalId}
        festivalName={call.festival.name}
        application={application}
        roles={call.roles}
        shifts={call.shifts}
      />
    </>
  );
}
