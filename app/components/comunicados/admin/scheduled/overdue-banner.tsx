import OverdueSendButton from "@/app/components/comunicados/admin/overdue-send-button";
import ProcessPendingButton from "@/app/components/comunicados/admin/process-pending-button";
import { Banner } from "@/app/components/ui/banner";
import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";
import { overdueText } from "@/app/lib/comunicados/schedule-copy";

/**
 * A schedule still waiting 3 minutes past its time
 * (docs/IMPLEMENTATION-comunicados.md E6), in every environment: a broken
 * cron in production shows the same way. "Enviar ahora" always; on a
 * preview, where no cron runs, "Procesar envíos pendientes" releases it.
 */
export default function OverdueBanner({
  comunicadoId,
  version,
  scheduledAt,
  env,
}: {
  comunicadoId: number;
  version: number;
  /** ISO. */
  scheduledAt: string;
  /** This server's own `VERCEL_ENV`: the second button only runs on a preview. */
  env: VercelEnvironment;
}) {
  return (
    <Banner variant="warning">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{overdueText(scheduledAt)}</span>
        <div className="flex flex-wrap gap-2">
          <OverdueSendButton
            comunicadoId={comunicadoId}
            version={version}
            size="sm"
          />
          {env === "preview" && <ProcessPendingButton size="sm" />}
        </div>
      </div>
    </Banner>
  );
}
