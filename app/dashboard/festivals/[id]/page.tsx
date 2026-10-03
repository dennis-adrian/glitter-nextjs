import FestivalDetailHeader from "@/app/components/festivals/festival-detail-header";
import FestivalFeatureConfigPanel from "@/app/components/festivals/festival-feature-config-panel";
import FestivalInfoCard from "@/app/components/festivals/festival-info-card";
import FestivalParticipantTermsSummary from "@/app/components/festivals/festival-participant-terms-summary";
import FestivalSectionsNav from "@/app/components/festivals/festival-sections-nav";
import FestivalSettingsCard from "@/app/components/festivals/festival-settings-card";
import {
  fetchActiveFestivalBase,
  fetchFestivalWithDates,
} from "@/app/lib/festivals/actions";
import { fetchFestivalOverviewCounts } from "@/app/lib/festivals/overview";
import { isFestivalDay } from "@/app/lib/festivals/utils";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// generateMetadata and the page both need it; read it once per request.
const loadFestival = cache((id: number) => fetchFestivalWithDates(id));

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return { title: "Festival" };
  const festival = await loadFestival(parsed.data.id);
  return { title: festival ? festival.name : "Festival" };
}

export default async function Page({ params }: PageProps) {
  // The dashboard layout checks this too, but a layout is not a boundary: a
  // page must not render its data for a request the layout never saw.
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return notFound();

  const { id } = parsed.data;
  const [festival, counts, activeFestival] = await Promise.all([
    loadFestival(id),
    fetchFestivalOverviewCounts(id),
    fetchActiveFestivalBase(),
  ]);

  if (!festival) {
    return notFound();
  }

  return (
    <div className="container flex flex-col gap-6 p-3 pb-10 md:p-6">
      <FestivalDetailHeader festival={festival} />
      <FestivalSectionsNav festival={festival} counts={counts} />
      {/* One column on a phone, in reading order: switches, facts, then the
          long reservation-features panel. From lg the facts move to a side
          column spanning both rows, beside the switches and the panel. */}
      <div className="grid items-start gap-6 lg:grid-cols-3 lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-span-2">
          <FestivalSettingsCard
            festival={festival}
            otherActiveFestival={
              activeFestival && activeFestival.id !== festival.id
                ? { id: activeFestival.id, name: activeFestival.name }
                : null
            }
            isFestivalDayToday={isFestivalDay(festival.festivalDates)}
          />
        </div>
        <div className="min-w-0 space-y-6 lg:col-start-3 lg:row-span-2 lg:row-start-1">
          <FestivalInfoCard festival={festival} />
          <FestivalParticipantTermsSummary
            festivalStatus={festival.status}
            participantTermsEnabled={festival.participantTermsEnabled}
          />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <FestivalFeatureConfigPanel
            festivalId={id}
            readOnly={festival.status === "archived"}
          />
        </div>
      </div>
    </div>
  );
}
