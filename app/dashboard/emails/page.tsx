import { Metadata } from "next";
import { redirect } from "next/navigation";

import AddUnsubscribeDialog from "@/app/components/emails/admin/add-unsubscribe-dialog";
import EmailAdminTable from "@/app/components/emails/admin/email-admin-table";
import EmailAdminTabs from "@/app/components/emails/admin/email-admin-tabs";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import {
  EMAIL_ADMIN_TAB_DESCRIPTIONS,
  EmailAdminSearchParamsSchema,
} from "@/app/lib/emails/admin-definitions";
import { fetchEmailAdminPage } from "@/app/lib/emails/admin-queries";
import { serverEnv } from "@/env";

export const metadata: Metadata = {
  title: "Correos bloqueados",
};

function people(count: number, one: string, many: string) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? one : many}`;
}

/**
 * Who our bulk mail skips, and why: addresses that bounced or reported us as
 * spam (from Resend's webhook) and people who unsubscribed. Admins can
 * unblock an address, take back an unsubscribe, or unsubscribe someone who
 * asked by other means.
 */
export default async function EmailsAdminPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const searchParams = await props.searchParams;
  const params = EmailAdminSearchParamsSchema.parse(searchParams);
  // A layout is not a boundary: this page checks for itself, and the query
  // refuses anyone but an admin too.
  const page = await fetchEmailAdminPage(params);
  if (!page) redirect("/dashboard");

  const { counts } = page;
  const breakdown =
    params.tab === "blocked" && counts.bounced + counts.complained > 0
      ? ` ${people(counts.bounced, "rebote", "rebotes")} y ${people(counts.complained, "reporte de spam", "reportes de spam")}.`
      : "";

  return (
    <div className="container flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-bold md:text-3xl">Correos bloqueados</h1>
          <p className="text-sm text-muted-foreground">
            A quiénes no les llegan nuestros correos masivos, como las
            invitaciones a festivales, y por qué.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <AddUnsubscribeDialog />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <EmailAdminTabs
          tab={params.tab}
          counts={counts}
          searchParams={searchParams}
        />
        <p className="text-sm text-muted-foreground">
          {EMAIL_ADMIN_TAB_DESCRIPTIONS[params.tab]}
          {breakdown}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <EmailAdminTable
          tab={params.tab}
          rows={page.rows}
          rowCount={page.total}
          searching={params.query !== ""}
          // Only production changes Resend; previews share its account.
          resendSynced={serverEnv.VERCEL_ENV === "production"}
        />
      </div>
    </div>
  );
}
