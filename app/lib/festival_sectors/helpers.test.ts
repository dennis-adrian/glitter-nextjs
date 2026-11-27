import { describe, expect, it } from "vitest";
import type {
  ActivityDetailsWithParticipants,
  FestivalActivityWithDetailsAndParticipants,
  WaitlistEntryWithUser,
} from "@/app/lib/festivals/definitions";
import { scopeActivityToViewer } from "@/app/lib/festivals/utils";
import { isActivityDetailFullFor } from "./helpers";

const now = new Date("2026-09-21T18:00:00Z");
const later = new Date("2026-09-22T18:00:00Z");
const earlier = new Date("2026-09-20T18:00:00Z");

function variant(
  id: number,
  participationLimit: number | null,
  activeUserIds: number[] = [],
  category: "illustration" | "gastronomy" | null = null,
): ActivityDetailsWithParticipants {
  return {
    id,
    activityId: 1,
    category,
    participationLimit,
    participants: activeUserIds.map((userId, index) => ({
      id: id * 100 + index,
      userId,
      detailsId: id,
      removedAt: null,
    })),
    votes: [],
  } as unknown as ActivityDetailsWithParticipants;
}

function entry(
  userId: number,
  position: number,
  values: Partial<WaitlistEntryWithUser> = {},
  category: "illustration" | "gastronomy" = "illustration",
): WaitlistEntryWithUser {
  return {
    id: userId,
    activityId: 1,
    userId,
    position,
    notifiedAt: null,
    expiresAt: null,
    notifiedForDetailId: null,
    user: { id: userId, category, status: "verified" },
    ...values,
  } as WaitlistEntryWithUser;
}

const invitedTo = (detailId: number, expiresAt = later) => ({
  notifiedAt: earlier,
  expiresAt,
  notifiedForDetailId: detailId,
});

function activity(
  details: ActivityDetailsWithParticipants[],
  waitlistEntries: WaitlistEntryWithUser[] = [],
  waitlistWindowMinutes: number | null = 60,
): FestivalActivityWithDetailsAndParticipants {
  return {
    id: 1,
    waitlistWindowMinutes,
    details,
    waitlistEntries,
  } as unknown as FestivalActivityWithDetailsAndParticipants;
}

describe("isActivityDetailFullFor", () => {
  it("never calls an unlimited variant full", () => {
    const open = variant(1, null, [2, 3]);
    expect(isActivityDetailFullFor(activity([open]), open, 9, now)).toBe(false);
  });

  it("counts active participants against the limit", () => {
    const full = variant(1, 1, [2]);
    expect(isActivityDetailFullFor(activity([full]), full, 9, now)).toBe(true);
  });

  it("counts another profile's unexpired invitation, not an expired one or the profile's own", () => {
    const seat = variant(1, 1);
    expect(
      isActivityDetailFullFor(
        activity([seat], [entry(2, 1, invitedTo(1))]),
        seat,
        9,
        now,
      ),
    ).toBe(true);
    expect(
      isActivityDetailFullFor(
        activity([seat], [entry(2, 1, invitedTo(1, earlier))]),
        seat,
        9,
        now,
      ),
    ).toBe(false);
    expect(
      isActivityDetailFullFor(
        activity([seat], [entry(9, 1, invitedTo(1))]),
        seat,
        9,
        now,
      ),
    ).toBe(false);
  });

  it("leaves a seat to the eligible waiters ahead of the profile", () => {
    const seat = variant(1, 1, [], "illustration");
    const waiting = [entry(2, 1), entry(9, 2)];
    expect(
      isActivityDetailFullFor(activity([seat], waiting), seat, 9, now),
    ).toBe(true);
    // The first waiter has nobody ahead.
    expect(
      isActivityDetailFullFor(activity([seat], waiting), seat, 2, now),
    ).toBe(false);
    // Without a waitlist, nobody is owed the seat.
    expect(
      isActivityDetailFullFor(activity([seat], waiting, null), seat, 9, now),
    ).toBe(false);
  });

  it("does not leave a seat to a waiter who is no longer verified", () => {
    const seat = variant(1, 1, [], "illustration");
    const unverified = entry(2, 1);
    unverified.user = { ...unverified.user, status: "pending" };
    expect(
      isActivityDetailFullFor(activity([seat], [unverified]), seat, 9, now),
    ).toBe(false);
  });

  it("does not leave a seat to a waiter who could not be invited to it", () => {
    const seat = variant(1, 1, [], "illustration");
    const other = variant(2, null, [3]);
    const waiting = [entry(4, 1, {}, "gastronomy"), entry(3, 2)];
    expect(
      isActivityDetailFullFor(activity([seat, other], waiting), seat, 9, now),
    ).toBe(false);
  });

  it("lets the profile take the seat its own invitation holds", () => {
    const seat = variant(1, 1);
    const waiting = [entry(2, 1), entry(9, 2, invitedTo(1))];
    expect(
      isActivityDetailFullFor(activity([seat], waiting), seat, 9, now),
    ).toBe(false);
  });

  it("answers from a scoped variant's flag", () => {
    const seat = { ...variant(1, 1), fullForViewer: true };
    expect(isActivityDetailFullFor(activity([seat]), seat, 9, now)).toBe(true);
  });
});

describe("scopeActivityToViewer", () => {
  it("keeps whether each variant is full for the viewer once the waitlist is narrowed", () => {
    const held = variant(1, 1);
    const open = variant(2, 2);
    const scoped = scopeActivityToViewer(
      // Scoping reads the clock, so the invitation runs well past it.
      activity(
        [held, open],
        [entry(2, 1, invitedTo(1, new Date("2999-01-01")))],
      ),
      9,
    );

    expect(scoped.waitlistEntries).toEqual([]);
    expect(scoped.details.map((detail) => detail.fullForViewer)).toEqual([
      true,
      false,
    ]);
  });
});
