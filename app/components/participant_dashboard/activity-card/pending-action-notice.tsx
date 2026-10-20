import { ClockIcon } from "lucide-react";

import { EnrolledConfig } from "@/app/components/participant_dashboard/activity-card/types";
import { formatDisplayDate } from "@/app/lib/formatters";

type PendingActionNoticeProps = {
  enrolledConfig: EnrolledConfig;
};

export default function PendingActionNotice({
  enrolledConfig,
}: PendingActionNoticeProps) {
  const d = enrolledConfig.isDestructive;
  const expired = enrolledConfig.isUploadExpired;

  if (expired) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-3">
        <p className="text-xs leading-tight text-foreground">
          {enrolledConfig.pendingLabel}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 space-y-1 ${
        d
          ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
      }`}
    >
      <p
        className={`text-sm font-medium ${
          d
            ? "text-red-700 dark:text-red-300"
            : "text-amber-800 dark:text-amber-200"
        }`}
      >
        {enrolledConfig.pendingLabel}
      </p>
      {enrolledConfig.pendingDescription && (
        <p className="text-xs leading-tight text-muted-foreground">
          {enrolledConfig.pendingDescription}
        </p>
      )}
      {enrolledConfig.ctaType === "upload" && enrolledConfig.deadlineDate && (
        <div
          className={`flex items-start gap-1 pt-1 ${
            d
              ? "text-red-700 dark:text-red-300"
              : "text-amber-800 dark:text-amber-200"
          }`}
        >
          <ClockIcon
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed">
            <span className="font-medium">Fecha límite de envío:</span>{" "}
            <time dateTime={enrolledConfig.deadlineDate.toISOString()}>
              {formatDisplayDate(enrolledConfig.deadlineDate, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </p>
        </div>
      )}
    </div>
  );
}
