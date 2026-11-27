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
const BADGE_INSET = BADGE_RADIUS;
const BADGE_CENTER_Y = 0.8;
/** Icon box inside the badge; the drawing itself is padded within it. */
const ICON_SIZE = 1.6;

/**
 * Activity markers painted on top of the stands. Badges stack right to left,
 * each covering only the edge of the one before it so its icon stays
 * readable, until a longer row would run past the stand's left edge.
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

        // Tighten the stack only when the default spacing would push the last
        // badge past the stand's left edge: from three badges on they overlap
        // more, and with four or five only the front icon stays clear.
        const spacing =
          badges.length > 1
            ? Math.min(
                BADGE_SPACING,
                (STAND_SIZE - 2 * BADGE_RADIUS) / (badges.length - 1),
              )
            : BADGE_SPACING;
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
              const { Icon, badgeFill } = getActivityMarker(activity);
              const cx = STAND_SIZE - BADGE_INSET - index * spacing;

              return (
                <g key={activity} data-activity={activity}>
                  <circle
                    cx={cx}
                    cy={BADGE_CENTER_Y}
                    r={BADGE_RADIUS}
                    fill={badgeFill}
                    stroke="#fff"
                    strokeWidth={0.3}
                  />
                  {/* An icon rather than a text glyph: a character is
                      centred by its font's metrics, which differ per device,
                      while the icon is centred by its own geometry. */}
                  <Icon
                    x={cx - ICON_SIZE / 2}
                    y={BADGE_CENTER_Y - ICON_SIZE / 2}
                    size={ICON_SIZE}
                    color="#fff"
                    strokeWidth={2.75}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
