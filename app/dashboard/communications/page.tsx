import { Metadata } from "next";
import { z } from "zod";

import ComunicadosList, {
  ComunicadosEmptyState,
} from "@/app/components/comunicados/admin/comunicados-list";
import ComunicadosTabs, {
  parseComunicadoTab,
} from "@/app/components/comunicados/admin/comunicados-tabs";
import ComunicadosEnvironmentBanner from "@/app/components/comunicados/admin/environment-banner";
import NewComunicadoButton from "@/app/components/comunicados/admin/new-comunicado-button";
import ProcessPendingButton from "@/app/components/comunicados/admin/process-pending-button";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import {
  fetchComunicadoList,
  fetchComunicadoTabs,
} from "@/app/lib/comunicados/queries";
import { serverEnv } from "@/env";

export const metadata: Metadata = {
  title: "Comunicados · Comunicaciones",
};

const pageSchema = z.coerce.number().int().positive().catch(1);

/**
 * The Comunicados list (docs/IMPLEMENTATION-comunicados.md G3), drafts first.
 * A page past the end shows the last one: the query clamps it.
 */
export default async function ComunicadosPage(props: {
  searchParams: Promise<{ tab?: string | string[]; page?: string | string[] }>;
}) {
  await requireCommunicationsAdmin();
  const searchParams = await props.searchParams;
  const tab = parseComunicadoTab(searchParams.tab);
  const page = pageSchema.parse(searchParams.page);

  const [counts, list] = await Promise.all([
    fetchComunicadoTabs(),
    fetchComunicadoList({ tab, page }),
  ]);
  const nothingYet = counts.drafts + counts.scheduled + counts.sent === 0;
  const environment = serverEnv.VERCEL_ENV;

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      {environment === "preview" ? (
        // Vercel runs crons in production only: on a preview, what a send's
        // own run left behind waits for this button (D9).
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <ComunicadosEnvironmentBanner environment={environment} />
          </div>
          <ProcessPendingButton className="w-full sm:w-auto" />
        </div>
      ) : (
        <ComunicadosEnvironmentBanner environment={environment} />
      )}

      {nothingYet ? (
        <ComunicadosEmptyState />
      ) : (
        <>
          {/* On a phone the button goes first and the tabs keep the rule. */}
          <div className="flex flex-col-reverse gap-3 border-b sm:flex-row sm:items-end sm:justify-between">
            <ComunicadosTabs tab={tab} counts={counts} />
            <NewComunicadoButton className="w-full sm:mb-2 sm:w-auto" />
          </div>
          <ComunicadosList tab={tab} list={list} />
        </>
      )}
    </div>
  );
}
