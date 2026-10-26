import type { ReactNode } from "react";

/** One of the report's numbers (G6), with what it is made of under it. */
export default function ReportKpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub != null && (
        <p className="text-xs tabular-nums text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
