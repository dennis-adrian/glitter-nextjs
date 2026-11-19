import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Heading from "@/app/components/atoms/heading";
import PastFestivalsList from "@/app/components/festivals/past-festivals-list";
import HomeFestivalCard from "@/app/components/home/home-festival-card";
import { HubSection } from "@/app/components/participations/hub/hub-section";
import { fetchActiveFestivalBase } from "@/app/lib/festivals/actions";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { fetchPastFestivals } from "@/app/lib/festivals/queries";
import { loadUpcomingFestival } from "@/app/lib/home/load";
import { formatDisplayDate } from "@/app/lib/formatters";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Festivales",
  description: "Los festivales de la Productora Glitter, en curso y anteriores.",
};

/**
 * When the announced edition opens reservations, while that is still ahead.
 * The board asks for when inscriptions open; festivals record when
 * reservations do.
 */
function reservationsLine(festival: FestivalWithDates) {
  const opens = festival.reservationsStartDate;
  if (!opens || opens.getTime() <= Date.now()) return null;
  return `Las reservas abren el ${formatDisplayDate(opens, { day: "numeric", month: "long" })}`;
}

/**
 * The "Festivales" tab of anyone without a participant's hub. With a festival
 * in progress it opens that festival's public page; otherwise it shows the
 * next edition once it is announced, and the festivals that already happened.
 * Nothing announced, nothing is announced: there is no "no festival" notice.
 * A verified participant reaching it from an old link goes to their hub.
 */
export default async function FestivalsPage() {
  const profile = await getCurrentUserProfile();
  if (profile?.status === "verified") redirect("/my_participations");

  const active = await fetchActiveFestivalBase();
  if (active) redirect(`/festivals/${active.id}`);

  const [upcoming, past] = await Promise.all([
    loadUpcomingFestival(),
    fetchPastFestivals(),
  ]);

  return (
    <div className="container flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <Heading>Festivales</Heading>
      {upcoming ? (
        <div className="lg:max-w-2xl">
          <HomeFestivalCard
            title="Próximo festival"
            festival={upcoming}
            href={`/festivals/${upcoming.id}`}
            daysLeft={null}
            sentence={reservationsLine(upcoming)}
          />
        </div>
      ) : null}
      {past.length > 0 ? (
        <HubSection title="Festivales anteriores">
          <PastFestivalsList festivals={past} />
        </HubSection>
      ) : (
        // The minimal case is one line, without a heading the line repeats.
        <PastFestivalsList festivals={past} />
      )}
    </div>
  );
}
