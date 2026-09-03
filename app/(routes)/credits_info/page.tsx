import type { Metadata } from "next";

import Title from "@/app/components/atoms/heading";
import CreditsExplainer from "@/app/components/credits/credits-explainer";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";

export const metadata: Metadata = {
  title: "Cómo funcionan los créditos",
  description:
    "Qué son los créditos del festival, para qué sirven y cómo se compran.",
};

export default async function CreditsInfoPage() {
  await requireFeatureEnabled("credits");

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
