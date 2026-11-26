import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FestivalNavStandBadges from "@/app/components/maps/festival-nav/festival-nav-stand-badges";
import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { STAND_SIZE } from "@/app/components/maps/map-utils";

afterEach(cleanup);

/**
 * A lone badge is a large circle (radius 1.3) whose right edge sits on
 * STAND_SIZE. Several badges shrink to radius 1 and fill a grid from the
 * top-right corner, three per row, each circle beside the last instead of
 * over its glyph.
 */
const LONE_SLOT = 4.7;
const FIRST_SLOT = 5;
const SECOND_SLOT = 3;
const THIRD_SLOT = 1;
const FIRST_ROW = 0.8;
const SECOND_ROW = 2.8;

function stand(
  id: number,
  userIds: number[],
  {
    rejected = false,
    positionLeft = 10,
    positionTop = 20,
  }: { rejected?: boolean; positionLeft?: number; positionTop?: number } = {},
): StandWithReservationsWithParticipants {
  return {
    id,
    positionLeft,
    positionTop,
    reservations: [
      {
        status: rejected ? "rejected" : "accepted",
        participants: userIds.map((userId) => ({ user: { id: userId } })),
        externalParticipants: [],
      },
    ],
  } as unknown as StandWithReservationsWithParticipants;
}

function renderBadges(
  stands: StandWithReservationsWithParticipants[],
  sets: {
    coupon?: number[];
    passport?: number[];
    stickerHunt?: number[];
    stampCard?: number[];
    festivalSticker?: number[];
  } = {},
) {
  const { container } = render(
    <svg>
      <FestivalNavStandBadges
        stands={stands}
        activityUserIds={{
          coupon_book: new Set(sets.coupon ?? []),
          stamp_passport: new Set(sets.passport ?? []),
          sticker_hunt: new Set(sets.stickerHunt ?? []),
          stamp_card: new Set(sets.stampCard ?? []),
          festival_sticker: new Set(sets.festivalSticker ?? []),
        }}
      />
    </svg>,
  );

  return Array.from(container.querySelectorAll("text")).map((node) => ({
    glyph: node.textContent,
    // Rounded because the slot offsets accumulate binary float error
    x: Math.round(Number(node.getAttribute("x")) * 1000) / 1000,
    y: Math.round(Number(node.getAttribute("y")) * 1000) / 1000,
  }));
}

describe("FestivalNavStandBadges", () => {
  it("renders nothing for stands with no activity participants", () => {
    expect(renderBadges([stand(1, [7])], { coupon: [99] })).toEqual([]);
  });

  it("puts a lone badge in the first slot whichever activity it is", () => {
    expect(renderBadges([stand(1, [7])], { coupon: [7] })).toEqual([
      { glyph: "%", x: LONE_SLOT, y: FIRST_ROW },
    ]);
    expect(renderBadges([stand(1, [7])], { passport: [7] })).toEqual([
      { glyph: "★", x: LONE_SLOT, y: FIRST_ROW },
    ]);
    expect(renderBadges([stand(1, [7])], { stickerHunt: [7] })).toEqual([
      { glyph: "♦", x: LONE_SLOT, y: FIRST_ROW },
    ]);
  });

  it("lines up three activities in one row", () => {
    expect(
      renderBadges([stand(1, [7])], {
        coupon: [7],
        passport: [7],
        stickerHunt: [7],
      }),
    ).toEqual([
      { glyph: "%", x: FIRST_SLOT, y: FIRST_ROW },
      { glyph: "★", x: SECOND_SLOT, y: FIRST_ROW },
      { glyph: "♦", x: THIRD_SLOT, y: FIRST_ROW },
    ]);
  });

  it("wraps a fourth and fifth activity onto a second row", () => {
    expect(
      renderBadges([stand(1, [7])], {
        coupon: [7],
        passport: [7],
        stickerHunt: [7],
        stampCard: [7],
        festivalSticker: [7],
      }),
    ).toEqual([
      { glyph: "%", x: FIRST_SLOT, y: FIRST_ROW },
      { glyph: "★", x: SECOND_SLOT, y: FIRST_ROW },
      { glyph: "♦", x: THIRD_SLOT, y: FIRST_ROW },
      { glyph: "▲", x: FIRST_SLOT, y: SECOND_ROW },
      { glyph: "✦", x: SECOND_SLOT, y: SECOND_ROW },
    ]);
  });

  it("keeps every activity badge within the stand without overlapping", () => {
    const { container } = render(
      <svg>
        <FestivalNavStandBadges
          stands={[stand(1, [7])]}
          activityUserIds={{
            coupon_book: new Set([7]),
            stamp_passport: new Set([7]),
            sticker_hunt: new Set([7]),
            stamp_card: new Set([7]),
            festival_sticker: new Set([7]),
          }}
        />
      </svg>,
    );

    expect(
      Array.from(container.querySelectorAll("text")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["%", "★", "♦", "▲", "✦"]);

    const circles = Array.from(container.querySelectorAll("circle"));
    expect(circles).toHaveLength(5);
    const discs = circles.map((circle) => ({
      cx: Number(circle.getAttribute("cx")),
      cy: Number(circle.getAttribute("cy")),
      r: Number(circle.getAttribute("r")),
    }));
    for (const { cx, r } of discs) {
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cx + r).toBeLessThanOrEqual(STAND_SIZE);
    }
    // No circle reaches into another's centre, where its glyph is drawn.
    for (const [i, a] of discs.entries()) {
      for (const b of discs.slice(i + 1)) {
        const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        expect(distance).toBeGreaterThanOrEqual(a.r + b.r - 1e-9);
      }
    }
  });

  it("closes the gap when a middle activity is missing", () => {
    expect(
      renderBadges([stand(1, [7])], { coupon: [7], stickerHunt: [7] }),
    ).toEqual([
      { glyph: "%", x: FIRST_SLOT, y: FIRST_ROW },
      { glyph: "♦", x: SECOND_SLOT, y: FIRST_ROW },
    ]);
  });

  it("counts every participant sharing the stand", () => {
    expect(
      renderBadges([stand(1, [7, 8])], { coupon: [8], passport: [7] }),
    ).toEqual([
      { glyph: "%", x: FIRST_SLOT, y: FIRST_ROW },
      { glyph: "★", x: SECOND_SLOT, y: FIRST_ROW },
    ]);
  });

  it("ignores participants whose reservation was rejected", () => {
    expect(
      renderBadges([stand(1, [7], { rejected: true })], { coupon: [7] }),
    ).toEqual([]);
  });

  it("positions each stand's badges at its own coordinates", () => {
    const { container } = render(
      <svg>
        <FestivalNavStandBadges
          stands={[
            stand(1, [7]),
            stand(2, [8], { positionLeft: 30, positionTop: 40 }),
          ]}
          activityUserIds={{
            coupon_book: new Set([7, 8]),
            stamp_passport: new Set(),
            sticker_hunt: new Set(),
            stamp_card: new Set(),
            festival_sticker: new Set(),
          }}
        />
      </svg>,
    );

    const groups = Array.from(container.querySelectorAll("g[transform]")).map(
      (node) => node.getAttribute("transform"),
    );
    expect(groups).toEqual(["translate(10, 20)", "translate(30, 40)"]);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });
});
