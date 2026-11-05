import ReportKpi from "@/app/components/comunicados/admin/report/report-kpi";
import type { ActivationReport } from "@/app/lib/festivals/activation-report";
import { activationReportTiles } from "@/app/lib/festivals/activation-report-copy";
import { cn } from "@/app/lib/utils";

/** The activation notice's four numbers, as the comunicado report shows its own. */
export default function ActivationReportKpis({
  report,
  className,
}: {
  report: ActivationReport;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {activationReportTiles(report).map((tile) => (
        <ReportKpi
          key={tile.label}
          label={tile.label}
          value={tile.value}
          sub={tile.sub}
        />
      ))}
    </div>
  );
}
