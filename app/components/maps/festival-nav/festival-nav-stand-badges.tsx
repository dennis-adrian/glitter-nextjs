"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { STAND_SIZE, getStandPosition } from "@/app/components/maps/map-utils";
import { hasActivityParticipant } from "@/app/components/maps/map-participants";

type FestivalNavStandBadgesProps = {
  /** Occupied stands only — badges are meaningless on empty spaces */
  stands: StandWithReservationsWithParticipants[];
  couponBookUserIdSet: Set<number>;
  passportUserIdSet: Set<number>;
  stickerHuntUserIdSet: Set<number>;
  dimmedStandIds?: ReadonlySet<number>;
};

const BADGE_RADIUS = 1.3;
const BADGE_SPACING = 2;

type Badge = {
  key: string;
  fill: string;
  glyph: string;
};

/**
 * Activity markers painted on top of the stands. Badges stack right to left so
 * a stand carrying several activities keeps them all visible.
 */
export default function FestivalNavStandBadges({
  stands,
  couponBookUserIdSet,
  passportUserIdSet,
  stickerHuntUserIdSet,
  dimmedStandIds,
}: FestivalNavStandBadgesProps) {
  return (
    <g aria-hidden="true">
      {stands.map((stand) => {
        const badges: Badge[] = [];
        if (hasActivityParticipant(stand, couponBookUserIdSet)) {
          badges.push({ key: "coupon", fill: "#F59E0B", glyph: "%" });
        }
        if (hasActivityParticipant(stand, passportUserIdSet)) {
          badges.push({ key: "passport", fill: "#059669", glyph: "★" });
        }
        if (hasActivityParticipant(stand, stickerHuntUserIdSet)) {
          badges.push({ key: "sticker-hunt", fill: "#DB2777", glyph: "♦" });
        }
        if (badges.length === 0) return null;

        const { left, top } = getStandPosition(stand);
        return (
          <g
            key={stand.id}
            transform={`translate(${left}, ${top})`}
            style={{
              opacity: dimmedStandIds?.has(stand.id) ? 0.2 : 1,
              pointerEvents: "none",
              transition: "opacity 180ms ease",
            }}
          >
            {badges.map((badge, index) => {
              const cx = STAND_SIZE - 0.8 - index * BADGE_SPACING;
              return (
                <g key={badge.key}>
                  <circle
                    cx={cx}
                    cy={0.8}
                    r={BADGE_RADIUS}
                    fill={badge.fill}
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
                    {badge.glyph}
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
