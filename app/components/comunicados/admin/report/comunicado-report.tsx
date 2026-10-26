import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import Link from "next/link";

import {
  comunicadoBadge,
  momentLabel,
} from "@/app/components/comunicados/admin/comunicados-list";
import DuplicateComunicadoButton from "@/app/components/comunicados/admin/duplicate-button";
import RecipientsFilters from "@/app/components/comunicados/admin/report/recipients-filters";
import RecipientsPagination from "@/app/components/comunicados/admin/report/recipients-pagination";
import RecipientsSearch from "@/app/components/comunicados/admin/report/recipients-search";
import RecipientsTable from "@/app/components/comunicados/admin/report/recipients-table";
import ComunicadoReportBanners from "@/app/components/comunicados/admin/report/report-banners";
import ReportKpi from "@/app/components/comunicados/admin/report/report-kpi";
import RetryFailedButton from "@/app/components/comunicados/admin/report/retry-failed-dialog";
import RevisionHistory from "@/app/components/comunicados/admin/report/revision-history";
import RetractComunicadoMenu from "@/app/components/comunicados/admin/retract-dialog";
import RichTextHtml from "@/app/components/molecules/rich-text-html";
import { Badge } from "@/app/components/ui/badge";
import { buttonVariants } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";
import { COMUNICADO_UNTITLED } from "@/app/lib/comunicados/definitions";
import type {
  ComunicadoRecipientRow,
  ComunicadoReport as ComunicadoReportData,
} from "@/app/lib/comunicados/report";
import {
  audienceSourcesText,
  bounceShareText,
  type ComunicadoRecipientFilter,
  editedByText,
  emailNotSentText,
  essentialRecordText,
  notReceivedText,
  readKpiValue,
  sentByText,
} from "@/app/lib/comunicados/report-labels";
import type { ComunicadoRevisionSummary } from "@/app/lib/comunicados/revisions";
import {
  formatAudienceCount,
  type Paged,
} from "@/app/lib/distribution_lists/definitions";
import { cn } from "@/app/lib/utils";

const COMUNICADOS_PATH = "/dashboard/communications";

const fmt = formatAudienceCount;

/** The KPI cards (G6). Email's only when it was ticked, push's likewise. */
function ReportKpis({ report }: { report: ComunicadoReportData }) {
  const { kpis } = report;
  const emailNotSent =
    kpis.emailUnsubscribed +
    kpis.emailSuppressed +
    kpis.emailFailed +
    kpis.emailOtherSkipped;
  // A retraction freezes the numbers: nothing is waiting any more.
  const queued =
    report.campaignStatus === "processing" && report.retractedAt === null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      <ReportKpi
        label="Destinatarios"
        value={fmt(kpis.recipients)}
        sub={
          kpis.notReceived > 0 ? notReceivedText(kpis.notReceived) : undefined
        }
      />
      <ReportKpi
        label="Leídos en la app"
        value={readKpiValue(kpis.read, kpis.recipients)}
      />
      {report.sendEmail && (
        <>
          <ReportKpi
            label="Correos enviados"
            value={`${fmt(kpis.emailSent)} de ${fmt(kpis.emailPlanned)}`}
          />
          <ReportKpi
            label="Correos no enviados"
            value={fmt(emailNotSent)}
            sub={emailNotSentText({
              unsubscribed: kpis.emailUnsubscribed,
              suppressed: kpis.emailSuppressed,
              failed: kpis.emailFailed,
              other: kpis.emailOtherSkipped,
            })}
          />
          <ReportKpi
            label="Rebotes y spam"
            value={fmt(kpis.bounces)}
            sub={bounceShareText(kpis.bounces, kpis.confirmedSent)}
          />
        </>
      )}
      {report.sendPush && (
        <ReportKpi
          label="En el dispositivo"
          value={`${fmt(kpis.pushSent)} de ${fmt(kpis.pushTotal)}`}
        />
      )}
      {queued && (
        <ReportKpi
          label="En cola"
          value={fmt(kpis.emailQueued + kpis.pendingRecipients)}
        />
      )}
    </div>
  );
}

/**
 * A sent comunicado's page (docs/IMPLEMENTATION-comunicados.md G6, F2, F6):
 * who sent it, who last edited it and to whom, how it is going, what it says
 * now and what it said before, and each person's row. Its actions are
 * "Editar", "Duplicar", "Reintentar fallidos" when something failed and this
 * environment sent it, and "⋯ Retirar…"; once retracted, only "Duplicar".
 */
export default function ComunicadoReport({
  report,
  revisions,
  recipients,
  filter,
  query,
  env,
}: {
  report: ComunicadoReportData;
  /** "Historial", the first version first. */
  revisions: ComunicadoRevisionSummary[];
  recipients: Paged<ComunicadoRecipientRow>;
  filter: ComunicadoRecipientFilter;
  query: string;
  env: VercelEnvironment;
}) {
  const badge = comunicadoBadge({
    status: "sent",
    scheduledAt: null,
    scheduleMissedAt: null,
    sending: report.campaignStatus === "processing",
    retractedAt: report.retractedAt,
  });
  const title = report.title.trim() || COMUNICADO_UNTITLED;
  const sources = report.summary ? audienceSourcesText(report.summary) : null;
  // The latest edit, when there was one: the history is in order.
  const latest = revisions.at(-1);
  const edited =
    latest && latest.revision > 1
      ? editedByText(momentLabel(latest.createdAt), latest.createdByName)
      : null;

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <Link
        href={COMUNICADOS_PATH}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-3",
        )}
      >
        <ArrowLeftIcon className="mr-1 h-4 w-4" aria-hidden />
        Comunicados
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-lg font-semibold">
              {title}
            </h2>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {report.essential && <Badge variant="orange">Esencial</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {sentByText(momentLabel(report.sentAt), report.sentByName)}
            {edited && ` · ${edited}`}
          </p>
          {report.essential && (
            <p className="break-words text-sm">
              {essentialRecordText({
                summary: report.summary,
                confirmedBy: report.essentialConfirmedByName,
                confirmedAt: report.essentialConfirmedAt
                  ? momentLabel(report.essentialConfirmedAt)
                  : null,
                reason: report.essentialReason,
              })}
            </p>
          )}
          {sources && (
            <p className="break-words text-sm text-muted-foreground">
              {sources}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          {report.retractedAt === null && (
            <Link
              href={`${COMUNICADOS_PATH}/${report.id}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <PencilIcon className="mr-2 h-4 w-4" aria-hidden />
              Editar
            </Link>
          )}
          <DuplicateComunicadoButton comunicadoId={report.id} />
          {report.retractedAt === null && (
            <>
              {/* Shows itself only when something can be retried; from
                  another environment the retry would only be refused (D9). */}
              {report.summary?.env === env && (
                <RetryFailedButton
                  comunicadoId={report.id}
                  counts={report.retryCounts}
                />
              )}
              <RetractComunicadoMenu
                comunicadoId={report.id}
                title={title}
                counts={report.retractCounts}
              />
            </>
          )}
        </div>
      </div>

      <ComunicadoReportBanners report={report} env={env} />

      <ReportKpis report={report} />

      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="text-xs font-medium text-muted-foreground">Mensaje</p>
          <RichTextHtml html={report.html} className="text-base" />
        </CardContent>
      </Card>

      <RevisionHistory
        comunicadoId={report.id}
        revisions={revisions}
        currentRevision={report.currentRevision}
      />

      <section aria-label="Destinatarios" className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <RecipientsFilters
            comunicadoId={report.id}
            filter={filter}
            query={query}
          />
          <RecipientsSearch
            comunicadoId={report.id}
            filter={filter}
            query={query}
          />
        </div>
        <RecipientsTable rows={recipients.rows} />
        <RecipientsPagination
          comunicadoId={report.id}
          filter={filter}
          query={query}
          page={recipients.page}
          pageCount={recipients.pageCount}
          total={recipients.total}
        />
      </section>
    </div>
  );
}
