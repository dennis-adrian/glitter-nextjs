import {
  buildDateStamp,
  type DateStampThirdLine,
} from "@/app/lib/programs/date-stamp";
import { cn } from "@/app/lib/utils";

type ProgramDateStampSize = "sm" | "md" | "lg";

type ProgramDateStampProps = {
  start: Date | null;
  end?: Date | null;
  third?: DateStampThirdLine;
  size?: ProgramDateStampSize;
  className?: string;
};

const FRAME: Record<ProgramDateStampSize, string> = {
  sm: "min-w-16 rounded-[14px] px-2 py-2",
  md: "w-20 rounded-[16px] py-3",
  lg: "min-w-28 rounded-[18px] px-5 py-4",
};

const DAY: Record<ProgramDateStampSize, string> = {
  sm: "text-2xl",
  md: "text-3xl",
  lg: "text-3xl sm:text-4xl",
};

const MONTH: Record<ProgramDateStampSize, string> = {
  sm: "text-[11px]",
  md: "text-xs",
  lg: "text-sm",
};

/**
 * The ink date stamp from the landing's festival spotlight. It marks the
 * places where a date is something you pick: catalogue cards, agenda days and
 * booking rows.
 */
export default function ProgramDateStamp({
  start,
  end = null,
  third,
  size = "sm",
  className,
}: ProgramDateStampProps) {
  const stamp = buildDateStamp(start, end, third);

  if (!stamp) {
    if (size !== "lg") return null;
    return (
      <div
        className={cn(
          "flex min-h-28 min-w-28 shrink-0 items-center justify-center rounded-[18px] bg-brand-ink px-5 py-4 text-center font-display font-bold text-white",
          className,
        )}
      >
        Fecha por confirmar
      </div>
    );
  }

  return (
    <time
      dateTime={stamp.dateTime}
      className={cn(
        "grid shrink-0 place-content-center bg-brand-ink text-center font-display text-white",
        FRAME[size],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "font-extrabold leading-none tracking-[-1px] tabular-nums",
          DAY[size],
        )}
      >
        {stamp.primary}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 font-bold uppercase tracking-[0.16em]",
          MONTH[size],
        )}
      >
        {stamp.secondary}
      </span>
      {stamp.tertiary ? (
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 tabular-nums text-white/70",
            size === "sm" ? "text-[11px]" : "text-xs",
          )}
        >
          {stamp.tertiary}
        </span>
      ) : null}
      {/* Read as one date instead of three stacked fragments. */}
      <span className="sr-only">{stamp.label}</span>
    </time>
  );
}
