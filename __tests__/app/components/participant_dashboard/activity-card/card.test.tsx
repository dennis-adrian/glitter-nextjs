import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
});

describe.each(ACTIVITY_TYPES)(
  "%s card while registration is open",
  (type, activityName, activityTypeLabel) => {
    it('shows the exact "Participar" CTA', () => {
      const activity = buildOpenActivity(type, activityName);
      const registrationDeadline = `Hasta: ${activity.registrationEndDate.toLocaleString(
        "es-ES",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        },
      )}`;

      render(
        <FestivalActivityCard
          activity={activity}
          forProfile={forProfile}
          index={0}
        />,
      );

      expect(screen.getByRole("heading", { name: activityName })).toBeTruthy();
      expect(screen.getByText(`Descripción de ${activityName}`)).toBeTruthy();
      expect(
        screen.getByText(activityTypeLabel, { selector: "span" }),
      ).toBeTruthy();
      expect(screen.getByText(registrationDeadline)).toBeTruthy();

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
