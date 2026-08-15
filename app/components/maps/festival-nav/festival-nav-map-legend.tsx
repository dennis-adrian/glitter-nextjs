import FestivalNavLegendChip from "@/app/components/maps/festival-nav/festival-nav-legend-chip";
import { getActivityMarker } from "@/app/lib/festivals/activity-markers";
import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import {
  toggleStandActivityFilter,
  STAND_ACTIVITY_FILTERS,
  type StandActivityFilter,
  type StandFilters,
  type StandStatusFilter,
} from "@/app/lib/maps/stand-filters";

type FestivalNavMapLegendProps = {
  activityTypes: FestivalActivity["type"][];
  /** Omit both to render the legend as a plain read-only key. */
  filters?: StandFilters;
  onFiltersChange?: (filters: StandFilters) => void;
  /**
   * Statuses the map actually contains. A status the map has none of stays on
   * as a color key but drops its toggle, since selecting it could only ever
   * empty the map. Defaults to every status being selectable.
   */
  selectableStatuses?: Exclude<StandStatusFilter, "all">[];
  /**
   * Activities that currently mark at least one stand. The festival's other
   * activities still show — a filter that silently disappears reads as a broken
   * feature — but they cannot be selected. Defaults to all being selectable.
   */
  selectableActivities?: StandActivityFilter[];
};

const STATUS_ITEMS: {
  status: Exclude<StandStatusFilter, "all">;
  label: string;
  swatchClassName: string;
}[] = [
  {
    status: "occupied",
    label: "Ocupado",
    swatchClassName: "border-[rgba(91,33,182,0.8)] bg-[rgba(109,40,217,0.85)]",
  },
  {
    status: "available",
    label: "Disponible",
    swatchClassName: "border-[rgba(139,92,246,0.6)] bg-[rgba(221,214,254,0.6)]",
  },
];

export default function FestivalNavMapLegend({
  activityTypes,
  filters,
  onFiltersChange,
  selectableStatuses,
  selectableActivities,
}: FestivalNavMapLegendProps) {
  const activityTypeSet = new Set(activityTypes);
  const visibleActivities = STAND_ACTIVITY_FILTERS.filter((activity) =>
    activityTypeSet.has(activity),
  );
  const status = filters?.status ?? "all";
  const activities = filters?.activities ?? [];
  // Badges only ever sit on occupied stands, so pairing them with "Disponible"
  // could only ever return nothing.
  const activitiesDisabled = status === "available";
  const isActivitySelectable = (activity: StandActivityFilter) =>
    selectableActivities?.includes(activity) ?? true;

  const handleStatusToggle = onFiltersChange
    ? (next: Exclude<StandStatusFilter, "all">) => {
        const nextStatus = status === next ? "all" : next;
        onFiltersChange({
          status: nextStatus,
          activities: nextStatus === "available" ? [] : activities,
        });
      }
    : undefined;

  const handleActivityToggle = onFiltersChange
    ? (activity: StandActivityFilter) =>
        onFiltersChange({
          status,
          activities: toggleStandActivityFilter(activities, activity),
        })
    : undefined;

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-5">
      <div role="group" aria-label="Color del stand">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {STATUS_ITEMS.map((item) => (
            <FestivalNavLegendChip
              key={item.status}
              label={item.label}
              pressed={status === item.status}
              onToggle={
                handleStatusToggle &&
                (selectableStatuses?.includes(item.status) ?? true)
                  ? () => handleStatusToggle(item.status)
                  : undefined
              }
              swatch={
                <span
                  className={`size-3.5 shrink-0 rounded-sm border ${item.swatchClassName}`}
                  aria-hidden="true"
                />
              }
            />
          ))}
        </div>
      </div>

      {visibleActivities.length > 0 ? (
        <>
          <div
            className="hidden h-5 w-px shrink-0 bg-border md:block"
            aria-hidden="true"
          />
          <div
            role="group"
            aria-label="Insignias sobre el stand"
            className="border-t pt-2 md:border-t-0 md:pt-0"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {visibleActivities.map((activity) => {
                const marker = getActivityMarker(activity);

                return (
                  <FestivalNavLegendChip
                    key={activity}
                    label={marker.legendLabel}
                    pressed={activities.includes(activity)}
                    disabled={
                      activitiesDisabled || !isActivitySelectable(activity)
                    }
                    disabledHint={
                      activitiesDisabled
                        ? "Las insignias solo aparecen en stands ocupados"
                        : "Todavía no hay stands con esta insignia"
                    }
                    onToggle={
                      handleActivityToggle
                        ? () => handleActivityToggle(activity)
                        : undefined
                    }
                    swatch={
                      <span
                        className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border text-[7px] font-bold leading-none text-white ${marker.swatchClassName}`}
                        aria-hidden="true"
                      >
                        {marker.symbol}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
