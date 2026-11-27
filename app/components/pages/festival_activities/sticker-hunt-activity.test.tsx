import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BaseProfile } from "@/app/api/users/definitions";
import StickerHuntActivityPage from "@/app/components/pages/festival_activities/sticker-hunt-activity";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

vi.mock(
  "@/app/components/festivals/festival_activities/enroll-redirect-button",
  () => ({ default: () => null }),
);

afterEach(cleanup);

function activityWithLimits(limits: (number | null)[]) {
  return {
    id: 1,
    name: "Cacería de Stickers",
    registrationStartDate: new Date("2026-03-01T14:00:00Z"),
    registrationEndDate: new Date("2026-03-15T14:00:00Z"),
    proofUploadLimitDate: null,
    promotionalArtUrl: null,
    activityPrizeUrl: null,
    details: limits.map((participationLimit, index) => ({
      id: index + 1,
      participationLimit,
      participants: [],
    })),
    waitlistEntries: [],
  } as unknown as FestivalActivityWithDetailsAndParticipants;
}

function renderPage(limits: (number | null)[]) {
  const profile = { id: 1 } as BaseProfile;
  const { container } = render(
    <StickerHuntActivityPage
      activity={activityWithLimits(limits)}
      currentProfile={profile}
      forProfile={profile}
      festivalId={1}
    />,
  );
  return container.textContent ?? "";
}

describe("the sticker hunt activity page", () => {
  it("states the total when every variant is capped", () => {
    const text = renderPage([10, 5]);
    expect(text).toContain("habilitaremos 15 cupos");
    expect(text).toContain("de los 15 posibles");
    expect(text).toContain("El cupo es de 15 participantes");
  });

  it("states no total when a variant is uncapped", () => {
    const text = renderPage([10, null]);
    expect(text).not.toMatch(/\d+ cupos/);
    expect(text).not.toMatch(/de los \d+ posibles/);
    expect(text).not.toMatch(/\d+ participantes/);
    expect(text).not.toMatch(/limitad/i);
    expect(text).toContain("No hay límite de inscripciones.");
  });

  it("states no total when no variant is capped", () => {
    const text = renderPage([null, 0]);
    expect(text).not.toMatch(/\d+ cupos/);
    expect(text).not.toMatch(/limitad/i);
  });
});
