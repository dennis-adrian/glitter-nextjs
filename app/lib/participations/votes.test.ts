import { describe, expect, it } from "vitest";

import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { countVotesReceived } from "@/app/lib/participations/votes";

const CLOSED = new Date("2026-11-20T00:00:00Z");
const OPEN = new Date("2026-11-10T00:00:00Z");

function activity(
  overrides: Partial<FestivalActivityWithDetailsAndParticipants> = {},
): FestivalActivityWithDetailsAndParticipants {
  return {
    id: 1,
    allowsVoting: true,
    votingEndDate: new Date("2026-11-15T00:00:00Z"),
    details: [
      {
        participants: [
          { id: 10, userId: 3 },
          { id: 11, userId: 8 },
        ],
        votes: [
          { voterId: 50, participantId: 10, votableType: "participant", standId: null },
          { voterId: 51, participantId: 10, votableType: "participant", standId: null },
          { voterId: 52, participantId: 11, votableType: "participant", standId: null },
          { voterId: 53, participantId: null, votableType: "stand", standId: 400 },
        ],
      },
    ],
    ...overrides,
  } as unknown as FestivalActivityWithDetailsAndParticipants;
}

describe("countVotesReceived", () => {
  it("counts the votes for their own entry and their stand once voting closed", () => {
    expect(countVotesReceived(activity(), 3, new Set([400]), CLOSED)).toBe(3);
    expect(countVotesReceived(activity(), 3, new Set(), CLOSED)).toBe(2);
  });

  it("says nothing while voting is open, without voting, or outside the activity", () => {
    expect(countVotesReceived(activity(), 3, new Set(), OPEN)).toBeNull();
    expect(
      countVotesReceived(activity({ allowsVoting: false }), 3, new Set(), CLOSED),
    ).toBeNull();
    expect(countVotesReceived(activity(), 99, new Set(), CLOSED)).toBeNull();
  });

  it("reports zero for an entry nobody voted for", () => {
    expect(
      countVotesReceived(
        activity({
          details: [
            { participants: [{ id: 10, userId: 3 }], votes: [] },
          ] as unknown as FestivalActivityWithDetailsAndParticipants["details"],
        }),
        3,
        new Set(),
        CLOSED,
      ),
    ).toBe(0);
  });

  it("says nothing to someone removed from the activity", () => {
    expect(
      countVotesReceived(
        activity({
          details: [
            {
              participants: [{ id: 10, userId: 3, removedAt: new Date("2026-11-01") }],
              votes: [{ voterId: 50, participantId: 10, votableType: "participant", standId: null }],
            },
          ] as unknown as FestivalActivityWithDetailsAndParticipants["details"],
        }),
        3,
        new Set(),
        CLOSED,
      ),
    ).toBeNull();
  });
});
