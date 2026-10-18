// @vitest-environment node

import { describe, expect, it } from "vitest";

import type {
  FestivalActivityWithDetailsAndParticipants,
  FullFestival,
} from "@/app/lib/festivals/definitions";
import {
  scopeActivityToViewer,
  withoutParticipantRoster,
} from "@/app/lib/festivals/utils";

const VIEWER = 7;
const OTHER = 8;

function proof(participationId: number, feedback: string) {
  return {
    id: participationId * 10,
    participationId,
    imageUrl: `https://example.com/proof-${participationId}.png`,
    proofStatus: "rejected_resubmit",
    adminFeedback: feedback,
    promoHighlight: `2x1 de ${participationId}`,
    promoDescription: "Descripción",
    promoConditions: "Condiciones",
  };
}

const activity = {
  id: 1,
  festivalId: 3,
  name: "Iconic Stand",
  type: "best_stand",
  details: [
    {
      id: 11,
      activityId: 1,
      participationLimit: 10,
      participants: [
        {
          id: 101,
          userId: VIEWER,
          detailsId: 11,
          removedAt: null,
          removalReason: "Propio",
          user: { id: VIEWER, displayName: "Tinta Viva" },
          proofs: [proof(101, "Tu imagen está borrosa")],
        },
        {
          id: 102,
          userId: OTHER,
          detailsId: 11,
          removedAt: new Date("2026-01-01T00:00:00.000Z"),
          removalReason: "No envió su diseño",
          user: { id: OTHER, displayName: "Café Andino" },
          proofs: [proof(102, "Falta el logo")],
        },
      ],
      votes: [
        { id: 1, activityVariantId: 11, voterId: VIEWER, participantId: 102 },
        { id: 2, activityVariantId: 11, voterId: OTHER, participantId: 101 },
      ],
    },
  ],
  waitlistEntries: [
    { id: 1, activityId: 1, userId: VIEWER, user: { id: VIEWER } },
    { id: 2, activityId: 1, userId: OTHER, user: { id: OTHER } },
  ],
} as unknown as FestivalActivityWithDetailsAndParticipants;

describe("scopeActivityToViewer", () => {
  const scoped = scopeActivityToViewer(activity, VIEWER);
  const [mine, theirs] = scoped.details[0].participants;

  it("keeps the viewer's own participation whole", () => {
    expect(mine).toEqual(activity.details[0].participants[0]);
  });

  it("keeps who else takes part and their images, not what staff told them", () => {
    expect(theirs).toMatchObject({
      id: 102,
      userId: OTHER,
      removedAt: activity.details[0].participants[1].removedAt,
      removalReason: null,
      user: { id: OTHER, displayName: "Café Andino" },
    });
    expect(theirs.proofs).toEqual([
      {
        id: 1020,
        participationId: 102,
        imageUrl: "https://example.com/proof-102.png",
        proofStatus: "rejected_resubmit",
        adminFeedback: null,
        promoHighlight: null,
        promoDescription: null,
        promoConditions: null,
      },
    ]);
  });

  it("keeps only the votes the viewer cast", () => {
    expect(scoped.details[0].votes).toEqual([
      { id: 1, activityVariantId: 11, voterId: VIEWER, participantId: 102 },
    ]);
  });

  it("keeps only the viewer's own waitlist entry", () => {
    expect(scoped.waitlistEntries.map((entry) => entry.userId)).toEqual([
      VIEWER,
    ]);
  });

  it("gives a viewer with no profile nobody's votes, feedback or waitlist", () => {
    const anonymous = scopeActivityToViewer(activity, null);

    expect(anonymous.details[0].votes).toEqual([]);
    expect(anonymous.waitlistEntries).toEqual([]);
    expect(
      anonymous.details[0].participants.flatMap((participant) =>
        participant.proofs.map((p) => p.adminFeedback),
      ),
    ).toEqual([null, null]);
  });

  it("leaves the activity it was given untouched", () => {
    expect(activity.details[0].votes).toHaveLength(2);
    expect(activity.details[0].participants[1].proofs[0].adminFeedback).toBe(
      "Falta el logo",
    );
  });
});

describe("withoutParticipantRoster", () => {
  it("scopes every activity of the festival to the viewer", () => {
    const festival = {
      id: 3,
      userRequests: [{ id: 1 }],
      standReservations: [{ id: 2 }],
      festivalActivities: [activity],
    } as unknown as FullFestival;

    const scoped = withoutParticipantRoster(festival, VIEWER);

    expect(scoped.userRequests).toEqual([]);
    expect(scoped.standReservations).toEqual([]);
    expect(scoped.festivalActivities).toEqual([
      scopeActivityToViewer(activity, VIEWER),
    ]);
  });
});
