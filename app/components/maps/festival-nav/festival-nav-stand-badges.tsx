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

const BADGE_RADIUS = 1.3;
const BADGE_SPACING = 2;

/**
 * Activity markers painted on top of the stands. Badges stack right to left so
 * a stand carrying several activities keeps them all visible.
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
              const cx = STAND_SIZE - 0.8 - index * BADGE_SPACING;

              return (
                <g key={activity}>
                  <circle
                    cx={cx}
                    cy={0.8}
                    r={BADGE_RADIUS}
                    fill={marker.badgeFill}
                    stroke="#fff"
                    strokeWidth={0.3}
                  />
                  <text
                    x={cx}
                    y={0.8}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={1.4}
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
