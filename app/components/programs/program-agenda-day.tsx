import type { ReactNode } from "react";

import ProgramDateStamp from "@/app/components/programs/program-date-stamp";
import { formatDate } from "@/app/lib/formatters";

type ProgramAgendaDayProps = {
  /** The anchor the day nav scrolls to. */
  id: string;
  date: Date;
  /** 1-based position in the program; days are a real sequence. */
  dayNumber: number;
  /** The day's `ProgramAgendaEntry` rows. */
  children: ReactNode;
};

function formatAgendaWeekday(date: Date): string {
  const weekday = formatDate(date).toFormat("cccc");
  return weekday.charAt(0).toLocaleUpperCase("es-BO") + weekday.slice(1);
}

export default function ProgramAgendaDay({
  id,
  date,
  dayNumber,
  children,
}: ProgramAgendaDayProps) {
  return (
    <section
      id={id}
      tabIndex={-1}
      // Clears the navbar, the announcement strip and the sticky day nav.
      className="scroll-mt-[calc(10rem+var(--announcement-strip-height,0px))] overflow-hidden rounded-2xl border border-brand-ink/10 bg-brand-card"
    >
      <div className="flex items-center gap-4 border-b border-brand-border px-6 py-5 sm:px-8">
        <ProgramDateStamp start={date} size="md" />
        <div>
          <p className="text-sm font-medium text-brand-ink/75">
            Día {dayNumber}
          </p>
          <h3 className="font-display text-xl font-bold sm:text-2xl">
            {formatAgendaWeekday(date)}
          </h3>
        </div>
      </div>

      <ol className="px-6 sm:px-8">{children}</ol>
    </section>
  );
}
