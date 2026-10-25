import { DateTime } from "luxon";

import { HubPanel } from "@/app/components/participations/hub/hub-section";
import { formatDisplayDate } from "@/app/lib/formatters";
import { buildParticipantSchedule } from "@/app/lib/participations/hub-status";
import { cn } from "@/app/lib/utils";

function time(date: Date) {
  return formatDisplayDate(DateTime.fromJSDate(date), DateTime.TIME_SIMPLE);
}

/** Setup, opening, closing and teardown times, day by day. */
export default function HubSchedule({
  festivalDates,
}: {
  festivalDates: { startDate: Date; endDate: Date }[];
}) {
  const days = buildParticipantSchedule(festivalDates);
  if (days.length === 0) return null;

  return (
    <HubPanel className="flex flex-col gap-4">
      {days.map((day) => (
        <div key={day.day} className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-brand-neutral">
            Día {day.day} ·{" "}
            {formatDisplayDate(DateTime.fromJSDate(day.date), {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </h3>
          <dl className="flex flex-col">
            {day.entries.map((entry) => (
              <div
                key={entry.label}
                className={cn(
                  "flex items-baseline justify-between gap-3 py-1 text-sm",
                  entry.highlight
                    ? "font-semibold text-brand-primary"
                    : "text-brand-ink",
                )}
              >
                <dt>{entry.label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">
                  {time(entry.startsAt)}
                  {entry.endsAt ? ` a ${time(entry.endsAt)}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </HubPanel>
  );
}
