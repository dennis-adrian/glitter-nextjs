import type { Metadata } from "next";
import { connection } from "next/server";

import VolunteerApplyCallout from "@/app/components/volunteers/volunteer-apply-callout";
import VolunteerBenefitsRequirements from "@/app/components/volunteers/volunteer-benefits-requirements";
import VolunteerFaqSection from "@/app/components/volunteers/volunteer-faq-section";
import VolunteerRolesGrid from "@/app/components/volunteers/volunteer-roles-grid";
import VolunteerShiftsSection from "@/app/components/volunteers/volunteer-shifts-section";
import VolunteersHero from "@/app/components/volunteers/volunteers-hero";
import {
  VOLUNTEER_COPY,
  VOLUNTEERS_PATH,
} from "@/app/lib/volunteers/definitions";
import { volunteerPageView } from "@/app/lib/volunteers/page-data";
import { fetchCurrentVolunteerCall } from "@/app/lib/volunteers/queries";

const TITLE = "Sé voluntario/a en Glitter";
const DESCRIPTION =
  "Sumate al equipo que arma el festival de ilustración y creatividad más grande de Bolivia. Elegí tus turnos y postulá.";

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
 * The public volunteer call. The form lives on /voluntarios/postular; this
 * page sells it and links there while the call is open.
 */
export default async function VolunteersPage() {
  // Per request: the call closes at a set instant, and roles and shifts can
  // be deactivated at any time.
  await connection();
  const call = await fetchCurrentVolunteerCall();

  if (!call) {
    return (
      <div className="bg-brand-lavender px-5 py-16">
        <div className="mx-auto max-w-xl rounded-[20px] border border-brand-border bg-brand-card p-8 text-center">
          <h1 className="font-display text-3xl font-extrabold text-brand-ink">
            {VOLUNTEER_COPY.noCallTitle}
          </h1>
          <p className="mt-3 break-words text-brand-neutral">
            {VOLUNTEER_COPY.noCallMessage}
          </p>
        </div>
      </div>
    );
  }

  const view = volunteerPageView(call);

  return (
    <div className="bg-brand-elevated">
      <VolunteersHero
        festivalName={call.festival.name}
        dateTile={view.dateTile}
        venue={view.venue}
        setupDay={view.setupDay}
        closesLabel={view.closesShort}
        open={view.open}
      />
      <VolunteerRolesGrid roles={call.roles} />
      <VolunteerBenefitsRequirements
        ageCutoff={view.ageCutoff}
        induction={view.induction}
      />
      <VolunteerShiftsSection shifts={call.shifts} />
      <VolunteerFaqSection />
      <VolunteerApplyCallout
        open={view.open}
        festivalName={call.festival.name}
        closesLabel={view.closesLong}
      />
    </div>
  );
}
