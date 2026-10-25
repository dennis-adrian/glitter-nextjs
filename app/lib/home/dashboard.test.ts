import { describe, expect, it } from "vitest";

import {
  buildDashboardStats,
  countUpcomingPurchases,
  describeActivity,
} from "@/app/lib/home/dashboard";

describe("buildDashboardStats", () => {
  const base = {
    creditBalance: 240,
    orderCounts: { pending: 1, payment_verification: 2, paid: 5 },
    upcomingPurchases: 1,
    nextFestival: { name: "Festicker 2026", daysLeft: 21 },
  };

  it("gives one tile per figure, each linking to its page", () => {
    expect(
      buildDashboardStats(base).map((stat) => [stat.key, stat.value, stat.href]),
    ).toEqual([
      ["credits", "Bs240.00", "/my_credits"],
      ["orders", "3", "/my_orders"],
      ["programs", "1", "/my_programs"],
      ["next_event", "21 días", "/my_participations"],
    ]);
  });

  it("counts only the orders still in progress", () => {
    const orders = buildDashboardStats({
      ...base,
      orderCounts: { paid: 4, delivered: 2, cancelled: 1 },
    }).find((stat) => stat.key === "orders");

    expect(orders?.value).toBe("0");
  });

  it("leaves out the tiles of features that are off", () => {
    expect(
      buildDashboardStats({
        ...base,
        creditBalance: null,
        upcomingPurchases: null,
        nextFestival: null,
      }).map((stat) => stat.key),
    ).toEqual(["orders"]);
  });

  it("keeps the festival tile for desktop, where phones show a card", () => {
    const tile = buildDashboardStats({
      ...base,
      nextFestival: { name: "Festicker 2026", daysLeft: 1 },
    }).at(-1);

    expect(tile).toMatchObject({ value: "1 día", desktopOnly: true });
  });
});

describe("countUpcomingPurchases", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const upcoming = { occurrence: { endsAt: new Date("2026-11-08T20:00:00Z") } };
  const past = { occurrence: { endsAt: new Date("2026-10-01T20:00:00Z") } };

  it("counts live purchases with a session still ahead", () => {
    expect(
      countUpcomingPurchases(
        [
          { status: "approved", lines: [upcoming] },
          { status: "under_verification", lines: [past, upcoming] },
          { status: "approved", lines: [past] },
          { status: "rejected", lines: [upcoming] },
          { status: "cancelled", lines: [upcoming] },
        ],
        now,
      ),
    ).toBe(2);
  });
});

describe("describeActivity", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const activity = {
    registrationStartDate: new Date("2026-10-20T12:00:00Z"),
    registrationEndDate: new Date("2026-10-30T12:00:00Z"),
    allowsVoting: false,
    votingStartDate: null,
    votingEndDate: null,
  };

  it("says when the viewer is already in", () => {
    expect(describeActivity(activity, true, now)).toBe("Ya te inscribiste");
  });

  it("follows the registration window", () => {
    expect(describeActivity(activity, false, now)).toBe("Inscripción abierta");
    expect(
      describeActivity(
        { ...activity, registrationStartDate: new Date("2026-11-14T16:00:00Z") },
        false,
        now,
      ),
    ).toBe("Inscripción desde el 14 de noviembre");
    expect(
      describeActivity(
        { ...activity, registrationEndDate: new Date("2026-10-24T12:00:00Z") },
        false,
        now,
      ),
    ).toBe("Inscripción cerrada");
  });

  it("moves on to the vote once registration has closed", () => {
    const voting = {
      ...activity,
      registrationEndDate: new Date("2026-10-24T12:00:00Z"),
      allowsVoting: true,
      votingStartDate: new Date("2026-11-14T16:00:00Z"),
      votingEndDate: new Date("2026-11-15T22:00:00Z"),
    };

    expect(describeActivity(voting, false, now)).toBe(
      "Votación desde el 14 de noviembre",
    );
    expect(
      describeActivity(voting, false, new Date("2026-11-15T12:00:00Z")),
    ).toBe("Votación abierta");
  });
});
