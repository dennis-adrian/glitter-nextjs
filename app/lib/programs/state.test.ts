import { describe, expect, it } from "vitest";

import {
  canCompleteOccurrence,
  canRescheduleOccurrence,
  resolveEffectiveVenueId,
  resolveOccurrenceState,
  resolveSessionPublishability,
  type OccurrenceStateInput,
  type SessionPublishInput,
} from "@/app/lib/programs/state";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const EARLIER = new Date("2026-07-01T12:00:00.000Z");
const LATER = new Date("2026-09-01T12:00:00.000Z");

function stateInput(
  overrides: Partial<OccurrenceStateInput> = {},
): OccurrenceStateInput {
  return {
    programStatus: "published",
    sessionStatus: "published",
    lifecycleStatus: "scheduled",
    salesStartAt: null,
    salesEndAt: null,
    salesClosedAt: null,
    rescheduledAt: null,
    ...overrides,
  };
}

describe("resolveOccurrenceState", () => {
  it("is on sale when published with an open window", () => {
    const resolved = resolveOccurrenceState(
      stateInput({ salesStartAt: EARLIER, salesEndAt: LATER }),
      NOW,
    );

    expect(resolved.state).toBe("on_sale");
    expect(resolved.isPurchasable).toBe(true);
    expect(resolved.isPubliclyVisible).toBe(true);
  });

  it("treats an unbounded window as open", () => {
    expect(resolveOccurrenceState(stateInput(), NOW).state).toBe("on_sale");
  });

  it("hides the occurrence when either the program or the session is draft", () => {
    for (const overrides of [
      { programStatus: "draft" as const },
      { sessionStatus: "draft" as const },
    ]) {
      const resolved = resolveOccurrenceState(stateInput(overrides), NOW);

      expect(resolved.state).toBe("draft");
      expect(resolved.isPubliclyVisible).toBe(false);
      expect(resolved.isPurchasable).toBe(false);
    }
  });

  it("ranks draft above every other condition", () => {
    // A draft session that is also cancelled must never leak as "cancelled",
    // which would confirm the occurrence exists.
    const resolved = resolveOccurrenceState(
      stateInput({ sessionStatus: "draft", lifecycleStatus: "cancelled" }),
      NOW,
    );

    expect(resolved.state).toBe("draft");
  });

  it("reports cancelled and completed before consulting the sales window", () => {
    expect(
      resolveOccurrenceState(
        stateInput({ lifecycleStatus: "cancelled", salesEndAt: LATER }),
        NOW,
      ).state,
    ).toBe("cancelled");

    expect(
      resolveOccurrenceState(
        stateInput({ lifecycleStatus: "completed", salesEndAt: LATER }),
        NOW,
      ).state,
    ).toBe("completed");
  });

  it("closes sales manually and by elapsed window alike", () => {
    expect(
      resolveOccurrenceState(stateInput({ salesClosedAt: EARLIER }), NOW).state,
    ).toBe("sales_closed");

    expect(
      resolveOccurrenceState(stateInput({ salesEndAt: EARLIER }), NOW).state,
    ).toBe("sales_closed");
  });

  it("distinguishes a window that has not opened from one that has closed", () => {
    const resolved = resolveOccurrenceState(
      stateInput({ salesStartAt: LATER }),
      NOW,
    );

    expect(resolved.state).toBe("sales_not_started");
    expect(resolved.isPurchasable).toBe(false);
    expect(resolved.isPubliclyVisible).toBe(true);
  });

  it("keeps a rescheduled occurrence on sale", () => {
    const resolved = resolveOccurrenceState(
      stateInput({ rescheduledAt: EARLIER }),
      NOW,
    );

    expect(resolved.state).toBe("on_sale");
    expect(resolved.isPurchasable).toBe(true);
    expect(resolved.wasRescheduled).toBe(true);
  });

  it("treats the window boundaries as inclusive of the open period", () => {
    expect(
      resolveOccurrenceState(stateInput({ salesStartAt: NOW }), NOW).state,
    ).toBe("on_sale");
    expect(
      resolveOccurrenceState(stateInput({ salesEndAt: NOW }), NOW).state,
    ).toBe("on_sale");
  });
});

describe("resolveEffectiveVenueId", () => {
  it("prefers occurrence, then session, then program default", () => {
    expect(resolveEffectiveVenueId(1, 2, 3)).toBe(1);
    expect(resolveEffectiveVenueId(null, 2, 3)).toBe(2);
    expect(resolveEffectiveVenueId(null, null, 3)).toBe(3);
    expect(resolveEffectiveVenueId(null, null, null)).toBeNull();
  });
});

describe("resolveSessionPublishability", () => {
  function publishInput(
    overrides: Partial<SessionPublishInput> = {},
  ): SessionPublishInput {
    return {
      status: "draft",
      venueId: null,
      programDefaultVenueId: 5,
      speakerCount: 1,
      occurrences: [{ lifecycleStatus: "scheduled", venueId: null }],
      ...overrides,
    };
  }

  it("publishes a complete draft session", () => {
    expect(resolveSessionPublishability(publishInput())).toEqual({
      publishable: true,
    });
  });

  it("skips a session that is already published", () => {
    expect(
      resolveSessionPublishability(publishInput({ status: "published" })),
    ).toEqual({ publishable: false, blocker: "already_published" });
  });

  it("requires at least one occurrence", () => {
    expect(
      resolveSessionPublishability(publishInput({ occurrences: [] })),
    ).toEqual({ publishable: false, blocker: "no_occurrences" });
  });

  it("skips a session whose occurrences are all cancelled or completed", () => {
    expect(
      resolveSessionPublishability(
        publishInput({
          occurrences: [
            { lifecycleStatus: "cancelled", venueId: null },
            { lifecycleStatus: "completed", venueId: null },
          ],
        }),
      ),
    ).toEqual({ publishable: false, blocker: "no_active_occurrences" });
  });

  it("requires a speaker", () => {
    expect(
      resolveSessionPublishability(publishInput({ speakerCount: 0 })),
    ).toEqual({ publishable: false, blocker: "no_speakers" });
  });

  it("requires every active occurrence to resolve a venue", () => {
    expect(
      resolveSessionPublishability(
        publishInput({ programDefaultVenueId: null }),
      ),
    ).toEqual({ publishable: false, blocker: "no_venue" });

    // A session-level override covers occurrences that have none of their own.
    expect(
      resolveSessionPublishability(
        publishInput({ programDefaultVenueId: null, venueId: 9 }),
      ),
    ).toEqual({ publishable: true });
  });

  it("ignores cancelled occurrences when checking venues", () => {
    expect(
      resolveSessionPublishability(
        publishInput({
          programDefaultVenueId: null,
          occurrences: [
            { lifecycleStatus: "scheduled", venueId: 7 },
            { lifecycleStatus: "cancelled", venueId: null },
          ],
        }),
      ),
    ).toEqual({ publishable: true });
  });
});

describe("occurrence transition guards", () => {
  const endsAt = new Date("2026-08-01T10:00:00.000Z");

  it("completes only a scheduled occurrence that has ended", () => {
    expect(canCompleteOccurrence(endsAt, "scheduled", NOW)).toBe(true);
    expect(canCompleteOccurrence(LATER, "scheduled", NOW)).toBe(false);
    expect(canCompleteOccurrence(endsAt, "cancelled", NOW)).toBe(false);
    expect(canCompleteOccurrence(endsAt, "completed", NOW)).toBe(false);
  });

  it("reschedules only a scheduled occurrence", () => {
    expect(canRescheduleOccurrence("scheduled")).toBe(true);
    expect(canRescheduleOccurrence("cancelled")).toBe(false);
    expect(canRescheduleOccurrence("completed")).toBe(false);
  });
});
