import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import VolunteerApplicationWizard from "@/app/components/volunteers/volunteer-application-wizard";
import { VOLUNTEERS_PATH } from "@/app/lib/volunteers/definitions";
import { volunteerPageView } from "@/app/lib/volunteers/page-data";
import { fetchCurrentVolunteerCall } from "@/app/lib/volunteers/queries";

export const metadata: Metadata = {
  title: "Postulá como voluntario/a",
  description:
    "Postulá al voluntariado de Glitter en 4 pasos: tus datos, turnos y roles, sobre vos y compromisos.",
  alternates: { canonical: `${VOLUNTEERS_PATH}/postular` },
  robots: { index: false },
};

/**
 * The application form, on its own page with no site navigation
 * (`data-bare-page`). Without an open call there is nothing to fill in, so
 * it sends people back to /voluntarios, which says the call is closed.
 */
export default async function VolunteerApplyPage() {
  await connection();
  const call = await fetchCurrentVolunteerCall();
  if (!call || !call.ageCutoffDate) redirect(VOLUNTEERS_PATH);
  const view = volunteerPageView(call);
  if (!view.open) redirect(VOLUNTEERS_PATH);

  return (
    <div data-bare-page="">
      <VolunteerApplicationWizard
        festivalId={call.festival.id}
        festivalName={call.festival.name}
        roles={call.roles}
        shifts={call.shifts}
        ageCutoffDate={call.ageCutoffDate}
        applicationsCloseAt={call.applicationsCloseAt}
        closesLabel={view.closesLong}
        closesOn={view.closesOn}
        induction={view.induction}
      />
    </div>
  );
}
