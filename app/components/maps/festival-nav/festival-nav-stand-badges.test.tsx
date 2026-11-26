import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FestivalNavStandBadges from "@/app/components/maps/festival-nav/festival-nav-stand-badges";
import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { STAND_SIZE } from "@/app/components/maps/map-utils";

afterEach(cleanup);

/**
 * Badges stack right to left from the stand's top-right corner. Inset equals
 * the badge radius (1.3) so the first circle's right edge sits on STAND_SIZE.
 * Two badges sit 2 apart, so the front one covers only the other's edge; from
 * three on, the spacing tightens to keep the row inside the stand.
 */
const FIRST_SLOT = 4.7;
const SECOND_SLOT = 2.7;
// Three badges: (STAND_SIZE - 2 * 1.3) / 2 = 1.7 apart.
const THREE_SECOND_SLOT = 3;
const THREE_THIRD_SLOT = 1.3;

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
  }));
}

describe("FestivalNavStandBadges", () => {
  it("renders nothing for stands with no activity participants", () => {
    expect(renderBadges([stand(1, [7])], { coupon: [99] })).toEqual([]);
  });

  it("puts a lone badge in the first slot whichever activity it is", () => {
    expect(renderBadges([stand(1, [7])], { coupon: [7] })).toEqual([
      { glyph: "%", x: FIRST_SLOT },
    ]);
    expect(renderBadges([stand(1, [7])], { passport: [7] })).toEqual([
      { glyph: "★", x: FIRST_SLOT },
    ]);
    expect(renderBadges([stand(1, [7])], { stickerHunt: [7] })).toEqual([
      { glyph: "♦", x: FIRST_SLOT },
    ]);
  });

  it("tightens the stack to fit three activities in the stand", () => {
    expect(
      renderBadges([stand(1, [7])], {
        coupon: [7],
        passport: [7],
        stickerHunt: [7],
      }),
    ).toEqual([
      { glyph: "%", x: FIRST_SLOT },
      { glyph: "★", x: THREE_SECOND_SLOT },
      { glyph: "♦", x: THREE_THIRD_SLOT },
    ]);
  });

  it("keeps every activity badge within the stand", () => {
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
    for (const circle of circles) {
      const cx = Number(circle.getAttribute("cx"));
      const radius = Number(circle.getAttribute("r"));
      expect(cx - radius).toBeGreaterThanOrEqual(0);
      expect(cx + radius).toBeLessThanOrEqual(STAND_SIZE);
    }
  });

  it("lets the front badge cover only the edge of the one behind it", () => {
    const { container } = render(
      <svg>
        <FestivalNavStandBadges
          stands={[stand(1, [7])]}
          activityUserIds={{
            coupon_book: new Set([7]),
            stamp_passport: new Set([7]),
            sticker_hunt: new Set(),
            stamp_card: new Set(),
            festival_sticker: new Set(),
          }}
        />
      </svg>,
    );

    const [back, front] = Array.from(container.querySelectorAll("circle")).map(
      (circle) => ({
        cx: Number(circle.getAttribute("cx")),
        r: Number(circle.getAttribute("r")),
      }),
    );
    // The front circle's right edge stays clear of the back badge's centre,
    // where its symbol is drawn, with room for half the symbol's width.
    expect(front.cx + front.r).toBeLessThan(back.cx - 0.5);
  });

  it("closes the gap when a middle activity is missing", () => {
    expect(
      renderBadges([stand(1, [7])], { coupon: [7], stickerHunt: [7] }),
    ).toEqual([
      { glyph: "%", x: FIRST_SLOT },
      { glyph: "♦", x: SECOND_SLOT },
    ]);
  });

  it("counts every participant sharing the stand", () => {
    expect(
      renderBadges([stand(1, [7, 8])], { coupon: [8], passport: [7] }),
    ).toEqual([
      { glyph: "%", x: FIRST_SLOT },
      { glyph: "★", x: SECOND_SLOT },
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
