import { ClockIcon } from "lucide-react";

import { EnrolledConfig } from "@/app/components/participant_dashboard/activity-card/types";
import { formatDate } from "@/app/lib/formatters";

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
      <div className="border-2 border-dashed border-stone-400 bg-stone-50 p-3">
        <p className="text-xs leading-tight text-stone-700">
          {enrolledConfig.pendingLabel}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`border-2 border-dashed p-3 space-y-1 ${
        d ? "border-red-500 bg-red-50" : "border-amber-500 bg-amber-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-xs font-bold uppercase tracking-wide ${
            d ? "text-red-600" : "text-amber-600"
          }`}
        >
          {enrolledConfig.pendingLabel}
        </p>
        {enrolledConfig.ctaType === "upload" && enrolledConfig.deadlineDate && (
          <div
            className={`inline-flex items-center gap-1 shrink-0 ${
              d ? "text-red-600" : "text-amber-600"
            }`}
          >
            <ClockIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">
              {formatDate(enrolledConfig.deadlineDate).toLocaleString({
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        )}
      </div>
      {enrolledConfig.pendingDescription && (
        <p className="text-xs leading-tight text-muted-foreground">
          {enrolledConfig.pendingDescription}
        </p>
      )}
    </div>
  );
}
