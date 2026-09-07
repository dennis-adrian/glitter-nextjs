import type { Metadata } from "next";

import { notFound } from "next/navigation";

import Title from "@/app/components/atoms/heading";
import CreditsExplainer from "@/app/components/credits/credits-explainer";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { PARTICIPANT_READ_ONLY_ROUTE_STATUSES } from "@/app/lib/participants/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Cómo funcionan los créditos",
  description:
    "Qué son los créditos del festival, para qué sirven y cómo se compran.",
};

export default async function CreditsInfoPage() {
  await requireFeatureEnabled("credits");

  // Credits only exist for people who can actually reserve, so to anyone else
  // this page should be indistinguishable from a URL that does not exist —
  // the same treatment the flag itself gets.
  const profile = await getCurrentUserProfile();
  if (
    !profile ||
    !PARTICIPANT_READ_ONLY_ROUTE_STATUSES.includes(
      profile.status as (typeof PARTICIPANT_READ_ONLY_ROUTE_STATUSES)[number],
    )
  ) {
    notFound();
  }

  return (
    <div className="container p-3 md:p-6">
      <div className="mb-4 flex flex-col gap-1 md:gap-2">
        <Title>Cómo funcionan los créditos</Title>
        <p className="text-sm leading-tight text-muted-foreground md:text-base">
          Todo lo que conviene saber antes de comprar tu primer crédito.
        </p>
      </div>
      <CreditsExplainer />
    </div>
  );
}
