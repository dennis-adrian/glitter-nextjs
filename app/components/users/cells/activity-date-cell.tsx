"use client";

import { InfoIcon } from "lucide-react";
import { DateTime } from "luxon";

import { formatDate } from "@/app/lib/formatters";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/app/components/ui/hover-card";

type ActivityDateCellProps = {
  date: Date | string | null;
  festivalName: string | null;
  emptyLabel: string;
  sourceLabel: string;
  exactDateStyle?: "date" | "datetime";
};

function ActivityDateDetails({
  festivalName,
  exactDate,
  sourceLabel,
}: {
  festivalName: string | null;
  exactDate: string;
  sourceLabel: string;
}) {
  return (
    <>
      {festivalName ? (
        <p>
          <span className="font-medium">Festival:</span> {festivalName}
        </p>
      ) : null}
      <p>
        <span className="font-medium">Fecha:</span> {exactDate}
      </p>
      <p>
        <span className="font-medium">Origen:</span> {sourceLabel}
      </p>
    </>
  );
}

export default function ActivityDateCell({
  date,
  festivalName,
  emptyLabel,
  sourceLabel,
  exactDateStyle = "datetime",
}: ActivityDateCellProps) {
  if (!date) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  const formattedDate = formatDate(date);
  if (!formattedDate.isValid) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  const relativeLabel =
    formattedDate.toRelative({ base: DateTime.now() }) ?? emptyLabel;
  const exactDate =
    exactDateStyle === "date"
      ? formattedDate.toLocaleString(DateTime.DATE_MED)
      : formattedDate.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);

  const details = (
    <ActivityDateDetails
      festivalName={festivalName}
      exactDate={exactDate}
      sourceLabel={sourceLabel}
    />
  );

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-sm">{relativeLabel}</span>
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="shrink-0 text-amber-800 transition-colors hover:text-amber-900"
            aria-label={`Ver detalles: ${sourceLabel}`}
          >
            <InfoIcon className="h-4 w-4" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-72 space-y-2 text-sm">
          {details}
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
