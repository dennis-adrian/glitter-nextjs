"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { STAND_SIZE, getStandPosition } from "@/app/components/maps/map-utils";
import { hasActivityParticipant } from "@/app/components/maps/map-participants";
import { getActivityMarker } from "@/app/lib/festivals/activity-markers";
import {
  STAND_ACTIVITY_FILTERS,
  type StandActivityUserIds,
} from "@/app/lib/maps/stand-filters";

type FestivalNavStandBadgesProps = {
  /** Occupied stands only — badges are meaningless on empty spaces */
  stands: StandWithReservationsWithParticipants[];
  activityUserIds: StandActivityUserIds;
  dimmedStandIds?: ReadonlySet<number>;
};

/** A stand's only badge: one large circle in the top-right corner. */
const LONE_BADGE = { radius: 1.3, fontSize: 1.4 };
/**
 * Several badges shrink so three sit side by side across the stand without
 * touching, and wrap to a new row after that. Overlapping circles would paint
 * each badge over the previous one's glyph.
 */
const GRID_BADGE = { radius: 1, fontSize: 1.1 };
const GRID_COLUMNS = 3;
const BADGE_TOP = 0.8;

function badgeSlot(index: number, count: number) {
  const { radius, fontSize } = count === 1 ? LONE_BADGE : GRID_BADGE;
  const column = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS);

  return {
    cx: STAND_SIZE - radius - column * 2 * radius,
    cy: BADGE_TOP + row * 2 * radius,
    radius,
    fontSize,
  };
}

/**
 * Activity markers painted on top of the stands, filling from the stand's
 * top-right corner leftwards so a stand carrying several activities keeps
 * every glyph visible.
 */
export default function FestivalNavStandBadges({
  stands,
  activityUserIds,
  dimmedStandIds,
}: FestivalNavStandBadgesProps) {
  return (
    <g aria-hidden="true">
      {stands.map((stand) => {
        const badges = STAND_ACTIVITY_FILTERS.filter((activity) =>
          hasActivityParticipant(stand, activityUserIds[activity]),
        );
        if (badges.length === 0) return null;

        const dimmed = dimmedStandIds?.has(stand.id) ?? false;
        const { left, top } = getStandPosition(stand);

        return (
          <g
            key={stand.id}
            transform={`translate(${left}, ${top})`}
            style={{
              // Greyscale rather than near-invisible: the badge stays part of
              // the stand's shape while its color stops competing for attention.
              opacity: dimmed ? 0.35 : 1,
              filter: dimmed ? "grayscale(1)" : undefined,
              pointerEvents: "none",
              transition: "opacity 180ms ease",
            }}
          >
            {badges.map((activity, index) => {
              const marker = getActivityMarker(activity);
              const { cx, cy, radius, fontSize } = badgeSlot(
                index,
                badges.length,
              );

              return (
                <g key={activity}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={marker.badgeFill}
                    stroke="#fff"
                    strokeWidth={0.3}
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fontWeight={700}
                    fill="#fff"
                    style={{ userSelect: "none" }}
                  >
                    {marker.symbol}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
