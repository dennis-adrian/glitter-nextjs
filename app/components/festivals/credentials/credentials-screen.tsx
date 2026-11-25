"use client";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import CredentialsHeader from "@/app/components/festivals/credentials/credentials-header";
import CredentialsRulesForm from "@/app/components/festivals/credentials/credentials-rules-form";
import CredentialsNamesView from "@/app/components/festivals/credentials/credentials-names-view";
import {
  CredentialsLastPrintCard,
  CredentialsPrintNotice,
} from "@/app/components/festivals/credentials/credentials-print-overview";
import CredentialsSummaryView from "@/app/components/festivals/credentials/credentials-summary-view";
import CredentialsTeamView from "@/app/components/festivals/credentials/credentials-team-view";
import PrintBatchDialog from "@/app/components/festivals/credentials/print-batch-dialog";
import CredentialsTabs from "@/app/components/festivals/credentials/credentials-tabs";
import type { CredentialsData } from "@/app/lib/credentials/calculate";
import type {
  CredentialFilters,
  CredentialTab,
} from "@/app/lib/credentials/definitions";

const TABS: readonly CredentialTab[] = ["resumen", "nombres", "equipo", "reglas"];

/** The whole credentials page below the navbar; the server hands it the data. */
export default function CredentialsScreen({
  festivalId,
  tab,
  data,
  initialFilters,
  isAdmin,
  participantsSeeRules,
}: {
  festivalId: number;
  tab: CredentialTab;
  data: CredentialsData;
  initialFilters: CredentialFilters;
  isAdmin: boolean;
  /** The flag is public, so participants' pages read the festival's rules. */
  participantsSeeRules: boolean;
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
        <CredentialsHeader printAction={<PrintBatchDialog />} />
        <CredentialsTabs tabs={TABS} />
        {current === "resumen" && (
          <CredentialsSummaryView
            printNotice={<CredentialsPrintNotice />}
            printCard={<CredentialsLastPrintCard />}
          />
        )}
        {current === "nombres" && <CredentialsNamesView showPrint />}
        {current === "equipo" && <CredentialsTeamView />}
        {current === "reglas" && (
          <CredentialsRulesForm participantsSeeRules={participantsSeeRules} />
        )}
      </div>
    </CredentialsProvider>
  );
}
