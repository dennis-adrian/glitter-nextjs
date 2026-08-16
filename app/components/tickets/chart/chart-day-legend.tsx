"use client";

type ChartDayLegendEntry = {
  key: string;
  label: string;
  value: number;
};

type ChartDayLegendProps = {
  entries: ChartDayLegendEntry[];
  total?: number;
};

export default function ChartDayLegend({
  entries,
  total,
}: ChartDayLegendProps) {
  return (
    <ul className="flex flex-wrap justify-center gap-4 text-sm">
      {total !== undefined && (
        <li className="flex items-center gap-1.5 font-medium">
          <span>Total: {total.toLocaleString()}</span>
        </li>
      )}
      {entries.map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: `var(--color-${entry.key})` }}
          />
          <span>
            {entry.label}
            {": "}
            {entry.value.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
