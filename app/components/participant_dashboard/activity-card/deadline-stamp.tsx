import { formatDisplayDate } from "@/app/lib/formatters";
import { CalendarDays } from "lucide-react";

import { ActivityTheme } from "@/app/components/participant_dashboard/activity-card/types";

type DeadlineStampProps = {
  theme: ActivityTheme;
  label: string;
  date: Date | string;
};

/**
 * Compact date row used for registration and voting windows.
 */
export default function DeadlineStamp({
  theme,
  label,
  date,
}: DeadlineStampProps) {
  return (
    <div
      className="flex items-start gap-1.5"
      style={{ color: theme.textSecondary }}
    >
      <CalendarDays
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      <p className="text-xs leading-relaxed">
        <time dateTime={new Date(date).toISOString()}>
          {label}{" "}
          {formatDisplayDate(date, {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      </p>
    </div>
  );
}
