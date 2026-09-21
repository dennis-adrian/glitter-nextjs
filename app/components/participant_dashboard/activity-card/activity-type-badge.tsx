import { ActivityTheme } from "@/app/components/participant_dashboard/activity-card/types";
import { FestivalActivity } from "@/app/lib/festivals/definitions";
import { ACTIVITY_ICONS, ACTIVITY_LABELS } from "./constants";

type ActivityTypeBadgeProps = {
  theme: ActivityTheme;
  activityType: FestivalActivity["type"];
};

export default function ActivityTypeBadge({
  theme,
  activityType,
}: ActivityTypeBadgeProps) {
  const Icon = ACTIVITY_ICONS[activityType];

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1"
      style={{
        backgroundColor: theme.accent,
      }}
    >
      <Icon
        className="w-3.5 h-3.5 shrink-0"
        aria-hidden="true"
        style={{
          color: theme.accentText,
        }}
      />
      <span className="text-xs font-medium" style={{ color: theme.accentText }}>
        {ACTIVITY_LABELS[activityType]}
      </span>
    </div>
  );
}
