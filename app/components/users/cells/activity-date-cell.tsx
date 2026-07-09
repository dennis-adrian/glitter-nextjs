"use client";

import { InfoIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useCallback, useRef, useState } from "react";

import { formatDate } from "@/app/lib/formatters";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";

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

const detailsContentClassName = "w-72 space-y-2 text-sm";

export default function ActivityDateCell({
  date,
  festivalName,
  emptyLabel,
  sourceLabel,
  exactDateStyle = "datetime",
}: ActivityDateCellProps) {
  const prefersTap = useMediaQuery("(pointer: coarse)");
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 100);
  }, [clearCloseTimer]);

  const handleHoverOpen = useCallback(() => {
    if (prefersTap) return;
    clearCloseTimer();
    setOpen(true);
  }, [prefersTap, clearCloseTimer]);

  const handleHoverClose = useCallback(() => {
    if (prefersTap) return;
    scheduleClose();
  }, [prefersTap, scheduleClose]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (prefersTap || next) {
        setOpen(next);
      }
    },
    [prefersTap],
  );

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
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 text-amber-800 transition-colors hover:text-amber-900"
            aria-label={`Ver detalles: ${sourceLabel}`}
            onMouseEnter={handleHoverOpen}
            onMouseLeave={handleHoverClose}
            onClick={
              prefersTap
                ? undefined
                : (event) => {
                    event.preventDefault();
                  }
            }
          >
            <InfoIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className={detailsContentClassName}
          align="start"
          onMouseEnter={handleHoverOpen}
          onMouseLeave={handleHoverClose}
        >
          {details}
        </PopoverContent>
      </Popover>
    </div>
  );
}
