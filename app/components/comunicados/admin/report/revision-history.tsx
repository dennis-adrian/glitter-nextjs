import RevisionViewButton from "@/app/components/comunicados/admin/report/revision-view-dialog";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { revisionLine } from "@/app/lib/comunicados/report-labels";
import type { ComunicadoRevisionSummary } from "@/app/lib/comunicados/revisions";

/**
 * "Historial" on a sent comunicado's page (docs/IMPLEMENTATION-comunicados.md
 * F2, G6): one row per version, the first one first, who wrote it and why,
 * with "Ver" to open it rendered. The rows are written here, on the server,
 * so their times read as the rest of the header's do.
 */
export default function RevisionHistory({
  comunicadoId,
  revisions,
  currentRevision,
}: {
  comunicadoId: number;
  revisions: ComunicadoRevisionSummary[];
  currentRevision: number;
}) {
  if (revisions.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-xs font-medium text-muted-foreground">Historial</p>
        <ol className="divide-y" aria-label="Versiones">
          {revisions.map((rev) => {
            const line = revisionLine(rev);
            return (
              <li
                key={rev.revision}
                className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words text-sm">{line}</span>
                  {rev.revision === currentRevision && (
                    <Badge variant="secondary">Actual</Badge>
                  )}
                </div>
                <div className="shrink-0">
                  <RevisionViewButton
                    comunicadoId={comunicadoId}
                    revision={rev.revision}
                    title={rev.title}
                    line={line}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
