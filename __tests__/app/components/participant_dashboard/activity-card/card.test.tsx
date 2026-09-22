import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDisplayDate } from "@/app/lib/formatters";
import type { BaseProfile } from "@/app/api/users/definitions";
import FestivalActivityCard from "@/app/components/participant_dashboard/activity-card/card";
import type {
  FestivalActivity,
  FestivalActivityWithDetailsAndParticipants,
} from "@/app/lib/festivals/definitions";

vi.mock(
  "@/app/components/participant_dashboard/activity-card/enrolled-users-cta",
  () => ({ default: () => null }),
);

vi.mock(
  "@/app/components/participant_dashboard/activity-card/pending-action-notice",
  () => ({ default: () => null }),
);

const ACTIVITY_TYPES = [
  ["stamp_passport", "Carrera de Sellos", "Sello"],
  ["sticker_print", "Sticker Print", "Sticker Print"],
  ["best_stand", "Stand Icónico", "Votación"],
  ["festival_sticker", "Sticker del Festival", "Sticker del Festival"],
  ["coupon_book", "Cuponera de Descuentos", "Descuentos"],
  ["sticker_hunt", "Cacería de Stickers", "Cacería de Stickers"],
] as const satisfies ReadonlyArray<
  readonly [FestivalActivity["type"], string, string]
>;

const forProfile = {
  id: 101,
  category: "illustration",
} as BaseProfile;

function buildOpenActivity(
  type: FestivalActivity["type"],
  name: string,
): FestivalActivityWithDetailsAndParticipants {
  const now = new Date();

  return {
    id: 42,
    name,
    description: `Descripción de ${name}`,
    registrationStartDate: new Date(now.getTime() - 60 * 60 * 1000),
    registrationEndDate: new Date(now.getTime() + 60 * 60 * 1000),
    promotionalArtUrl: null,
    festivalId: 7,
    visitorsDescription: null,
    type,
    activityPrizeUrl: null,
    allowsVoting: false,
    votingStartDate: null,
    votingEndDate: null,
    proofType: type === "coupon_book" ? "text" : "image",
    proofUploadLimitDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    accessLevel: "public",
    waitlistWindowMinutes: null,
    updatedAt: now,
    createdAt: now,
    details: [
      {
        id: 84,
        description: null,
        imageUrl: "/activity-detail.png",
        couponBookHeaderImageUrl: null,
        participationLimit: 50,
        activityId: 42,
        category: "illustration",
        updatedAt: now,
        createdAt: now,
        participants: [],
        votes: [],
      },
    ],
    waitlistEntries: [],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe.each(ACTIVITY_TYPES)(
  "%s card while registration is open",
  (type, activityName) => {
    it('shows the exact "Participar" CTA', () => {
      const activity = buildOpenActivity(type, activityName);
      const registrationDeadline = `Hasta: ${formatDisplayDate(
        activity.registrationEndDate,
        {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        },
      )}`;

      render(
        <FestivalActivityCard activity={activity} forProfile={forProfile} />,
      );

      expect(screen.getByRole("heading", { name: activityName })).toBeTruthy();
      expect(screen.getByText(`Descripción de ${activityName}`)).toBeTruthy();
      expect(screen.getByText(registrationDeadline)).toBeTruthy();
      expect(screen.getByText("Inscripciones abiertas")).toBeTruthy();

      const participateLink = screen.getByRole("link", {
        name: "Participar",
      });
      expect(participateLink.getAttribute("href")).toBe(
        "/profiles/101/festivals/7/activity/42",
      );
      expect(screen.queryByText("Ver detalles")).toBeNull();
      expect(screen.queryByText("Votar ahora")).toBeNull();
      expect(screen.queryByText("Ver estado")).toBeNull();
    });
  },
);

it("shows upcoming dates and changes to Participar when registration opens", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T14:47:00Z"));
  const activity = buildOpenActivity("coupon_book", "Cuponera de Descuentos");
  activity.registrationStartDate = new Date("2026-09-20T14:47:00Z");
  activity.registrationEndDate = new Date("2026-09-26T14:47:00Z");
  render(<FestivalActivityCard activity={activity} forProfile={forProfile} />);

  expect(screen.getByText("Inscripciones próximamente")).toBeTruthy();
  expect(screen.getByText("Desde: 20 sept 2026, 10:47 AM")).toBeTruthy();
  expect(screen.queryByText("Hasta: 26 sept 2026, 10:47 AM")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Ver detalles" }).getAttribute("href"),
  ).toBe("/profiles/101/festivals/7/activity/42");
  expect(screen.queryByRole("link", { name: "Participar" })).toBeNull();

  act(() => {
    vi.setSystemTime(new Date("2026-09-20T14:47:00Z"));
    vi.advanceTimersByTime(5000);
  });
  expect(screen.getByRole("link", { name: "Participar" })).toBeTruthy();
  expect(screen.getByText("Inscripciones abiertas")).toBeTruthy();
  expect(screen.getByText("Hasta: 26 sept 2026, 10:47 AM")).toBeTruthy();
  expect(screen.queryByText("Inscripciones próximamente")).toBeNull();

  act(() => {
    vi.setSystemTime(new Date("2026-09-26T14:47:01Z"));
    vi.advanceTimersByTime(5000);
  });
  expect(screen.queryByRole("link", { name: "Participar" })).toBeNull();
  expect(screen.getByRole("link", { name: "Ver detalles" })).toBeTruthy();
  expect(screen.getByText("Inscripciones cerradas")).toBeTruthy();
  expect(screen.getByText("Finalizaron: 26 sept 2026, 10:47 AM")).toBeTruthy();
  expect(screen.queryByText("Inscripciones abiertas")).toBeNull();
});
