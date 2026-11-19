import type { Metadata } from "next";
import { connection } from "next/server";

import VolunteerApplicationForm from "@/app/components/volunteers/volunteer-application-form";
import VolunteerBenefitsList from "@/app/components/volunteers/volunteer-benefits-list";
import VolunteerCallClosed from "@/app/components/volunteers/volunteer-call-closed";
import VolunteerFaq from "@/app/components/volunteers/volunteer-faq";
import VolunteerRequirements from "@/app/components/volunteers/volunteer-requirements";
import VolunteerRolesList from "@/app/components/volunteers/volunteer-roles-list";
import VolunteerShiftsTable from "@/app/components/volunteers/volunteer-shifts-table";
import VolunteersHero from "@/app/components/volunteers/volunteers-hero";
import {
  VOLUNTEER_COPY,
  VOLUNTEERS_PATH,
} from "@/app/lib/volunteers/definitions";
import {
  formatFestivalDays,
  formatInduction,
} from "@/app/lib/volunteers/format";
import { fetchCurrentVolunteerCall } from "@/app/lib/volunteers/queries";
import { isVolunteerCallOpen } from "@/app/lib/volunteers/schema";

const TITLE = "Sé voluntario/a en Glitter";
const DESCRIPTION =
  "Súmate al equipo de voluntarios de Glitter, el festival de ilustración y creatividad. Elige tus turnos y tu rol, y postúlate.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: VOLUNTEERS_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: VOLUNTEERS_PATH,
    type: "website",
    locale: "es_BO",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * The public volunteer call. Thin on purpose: data comes from
 * app/lib/volunteers, and every section is a swappable component under
 * app/components/volunteers.
 */
export default async function VolunteersPage() {
  // Per request: the call closes at a set instant, and roles and shifts can
  // be deactivated at any time.
  await connection();
  const call = await fetchCurrentVolunteerCall();

  if (!call) {
    return (
      <div className="container mx-auto max-w-3xl p-4 py-8 md:p-6 md:py-12">
        <VolunteerCallClosed
          title={VOLUNTEER_COPY.noCallTitle}
          message={VOLUNTEER_COPY.noCallMessage}
        />
      </div>
    );
  }

  const open =
    isVolunteerCallOpen(call.applicationsCloseAt) &&
    call.ageCutoffDate !== null &&
    call.roles.length >= 2;

  return (
    <div className="container mx-auto grid max-w-3xl gap-10 p-4 py-8 md:p-6 md:py-12">
      <VolunteersHero
        festivalName={call.festival.name}
        datesLabel={formatFestivalDays(call.festival.days)}
        venueLabel={call.festival.locationLabel ?? call.festival.address}
      />
      <VolunteerRolesList roles={call.roles} />
      <VolunteerShiftsTable shifts={call.shifts} />
      <VolunteerBenefitsList />
      <VolunteerRequirements
        inductionLabel={
          call.induction
            ? formatInduction(call.induction)
            : VOLUNTEER_COPY.inductionToBeConfirmed
        }
      />
      <VolunteerFaq />
      {open && call.ageCutoffDate ? (
        <VolunteerApplicationForm
          festivalId={call.festival.id}
          roles={call.roles}
          shifts={call.shifts}
          ageCutoffDate={call.ageCutoffDate}
          applicationsCloseAt={call.applicationsCloseAt}
        />
      ) : (
        <VolunteerCallClosed
          title={VOLUNTEER_COPY.closedTitle}
          message={VOLUNTEER_COPY.closedMessage}
        />
      )}
    </div>
  );
}
