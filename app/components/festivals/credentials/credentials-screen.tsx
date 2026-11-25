"use client";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import CredentialsHeader from "@/app/components/festivals/credentials/credentials-header";
import CredentialsNamesView from "@/app/components/festivals/credentials/credentials-names-view";
import CredentialsSummaryView from "@/app/components/festivals/credentials/credentials-summary-view";
import CredentialsTabs from "@/app/components/festivals/credentials/credentials-tabs";
import type { CredentialsData } from "@/app/lib/credentials/calculate";
import type {
  CredentialFilters,
  CredentialTab,
} from "@/app/lib/credentials/definitions";

const TABS: readonly CredentialTab[] = ["resumen", "nombres"];

/** The whole credentials page below the navbar; the server hands it the data. */
export default function CredentialsScreen({
  festivalId,
  tab,
  data,
  initialFilters,
  isAdmin,
}: {
  festivalId: number;
  tab: CredentialTab;
  data: CredentialsData;
  initialFilters: CredentialFilters;
  isAdmin: boolean;
}) {
  const current = TABS.includes(tab) ? tab : "resumen";
  return (
    <CredentialsProvider
      festivalId={festivalId}
      tab={current}
      data={data}
      initialFilters={initialFilters}
      isAdmin={isAdmin}
    >
      <div className="container flex min-w-0 flex-col gap-6 p-3 pb-10 md:p-6">
        <CredentialsHeader />
        <CredentialsTabs tabs={TABS} />
        {current === "resumen" && (
          <CredentialsSummaryView groups={["external", "volunteer"]} />
        )}
        {current === "nombres" && <CredentialsNamesView />}
      </div>
    </CredentialsProvider>
  );
}
