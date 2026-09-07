import { Clock } from "lucide-react";

import { ActivityTheme } from "@/app/components/participant_dashboard/activity-card/types";

type DeadlineStampProps = {
  theme: ActivityTheme;
  label: string;
  date: Date | string;
};

/**
 * Shared dashed deadline stamp used for registration and voting windows.
 */
export default function DeadlineStamp({
  theme,
  label,
  date,
}: DeadlineStampProps) {
  return (
    <div className="pt-2">
      <div
        className="inline-flex items-center gap-2 px-4 py-2 border-2"
        style={{
          borderColor: theme.textSecondary,
          transform: "rotate(-2deg)",
          borderStyle: "dashed",
        }}
      >
        <Clock className="w-3.5 h-3.5" style={{ color: theme.textSecondary }} />
        <p
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: theme.textSecondary }}
        >
          {label}{" "}
          {new Date(date).toLocaleString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
