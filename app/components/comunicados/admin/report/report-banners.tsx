import {
  FlaskConicalIcon,
  PauseCircleIcon,
  SendIcon,
  Undo2Icon,
} from "lucide-react";

import { momentLabel } from "@/app/components/comunicados/admin/comunicados-list";
import ProcessPendingButton from "@/app/components/comunicados/admin/process-pending-button";
import CreditGiftAutoRefresh from "@/app/components/credit_gifts/admin/credit-gift-auto-refresh";
import { Banner } from "@/app/components/ui/banner";
import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";
import type { ComunicadoReport } from "@/app/lib/comunicados/report";
import {
  CONFIG_STALLED_BANNER_TEXT,
  DEVELOPMENT_BANNER_TEXT,
  QUOTA_BANNER_TEXT,
  retractedBannerText,
  sendingBannerText,
  stagingBannerText,
  stalledBannerText,
} from "@/app/lib/comunicados/report-labels";

/**
 * What the report needs to say before its numbers (G6, F6), all from rows
 * the page already read. A retraction freezes the report: it stops the
 * refresh, and the sending, stall and Resend banners go with it, since none
 * of that is going to be sent any more.
 */
export default function ComunicadoReportBanners({
  report,
  env,
}: {
  report: ComunicadoReport;
  /** This server's own `VERCEL_ENV`: the button only runs on a preview. */
  env: VercelEnvironment;
}) {
  const { banners, kpis, summary } = report;
  const retracted = report.retractedAt !== null;
  const sending = report.campaignStatus === "processing" && !retracted;
  // Lists only reach the admins on a preview or in development (B6); a send
  // to people picked by name alone replaced nothing.
  const listsReplaced =
    summary !== null &&
    summary.env !== "production" &&
    summary.narrowed &&
    summary.sources.some((source) => source.kind !== "people");

  return (
    <>
      <CreditGiftAutoRefresh active={sending} />
      {report.retractedAt && (
        <Banner variant="info" icon={Undo2Icon}>
          {retractedBannerText({
            moment: momentLabel(report.retractedAt),
            by: report.retractedByName,
            reason: report.retractReason,
          })}
        </Banner>
      )}
      {!retracted && banners.configStalled && (
        <Banner variant="danger">{CONFIG_STALLED_BANNER_TEXT}</Banner>
      )}
      {!retracted && banners.quota && (
        <Banner variant="danger">{QUOTA_BANNER_TEXT}</Banner>
      )}
      {sending && banners.stalledSince && (
        <Banner variant="warning" icon={PauseCircleIcon}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{stalledBannerText(banners.stalledSince)}</span>
            {env === "preview" && <ProcessPendingButton size="sm" />}
          </div>
        </Banner>
      )}
      {sending && (
        <Banner variant="info" icon={SendIcon}>
          {sendingBannerText({
            notified: kpis.notified,
            pending: kpis.pendingRecipients,
            emailSent: kpis.emailSent,
            sendEmail: report.sendEmail,
          })}
        </Banner>
      )}
      {listsReplaced && (
        <Banner variant="warning" icon={FlaskConicalIcon}>
          {stagingBannerText(summary.stagingAdmins)}
        </Banner>
      )}
      {summary?.env === "development" && report.sendEmail && (
        <Banner variant="info" icon={FlaskConicalIcon}>
          {DEVELOPMENT_BANNER_TEXT}
        </Banner>
      )}
    </>
  );
}
