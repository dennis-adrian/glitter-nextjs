import { describe, expect, it } from "vitest";

import {
  canReserveGroup,
  demandFromLines,
  resolveAvailability,
  resolveUsage,
  validateSettingsAgainstUsage,
} from "@/app/lib/fast-pass/availability";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const FUTURE = new Date("2026-08-01T12:20:00.000Z");
const PAST = new Date("2026-08-01T11:40:00.000Z");

const settings = {
  paidInventoryLimit: 100,
  priorityCapacityLimit: 120,
  onlinePaidAllocation: 70,
  onSitePaidAllocation: 30,
  onlinePriorityAllocation: 85,
  onSitePriorityAllocation: 35,
};

describe("demandFromLines", () => {
  it("counts one paid unit and six priority units for an adult with five children", () => {
    expect(demandFromLines([{ responsibleChildCount: 5 }])).toEqual({
      paidCount: 1,
      childCount: 5,
      priorityCount: 6,
    });
  });

  it("sums a multi-adult group without counting children as paid", () => {
    expect(
      demandFromLines([
        { responsibleChildCount: 2 },
        { responsibleChildCount: 1 },
      ]),
    ).toEqual({ paidCount: 2, childCount: 3, priorityCount: 5 });
  });
});

describe("resolveUsage and availability", () => {
  it("treats an expired hold as free for new purchases", () => {
    const usage = resolveUsage(
      [
        {
          channel: "online",
          status: "pending_upload",
          holdExpiresAt: PAST,
          correctionExpiresAt: null,
          allocationRestored: null,
          paidCount: 2,
          priorityCount: 3,
        },
      ],
      NOW,
    );
    expect(usage.total.heldPaid).toBe(0);
    expect(resolveAvailability(settings, usage).remainingOnlinePaid).toBe(70);
  });

  it("consumes channel allocation for a live hold", () => {
    const usage = resolveUsage(
      [
        {
          channel: "online",
          status: "pending_upload",
          holdExpiresAt: FUTURE,
          correctionExpiresAt: null,
          allocationRestored: null,
          paidCount: 2,
          priorityCount: 4,
        },
      ],
      NOW,
    );
    const availability = resolveAvailability(settings, usage);
    expect(availability.remainingOnlinePaid).toBe(68);
    expect(availability.remainingOnlinePriority).toBe(81);
    expect(availability.remainingOnSitePaid).toBe(30);
  });

  it("keeps cancelled capacity when allocation was not restored", () => {
    const usage = resolveUsage(
      [
        {
          channel: "on_site",
          status: "cancelled",
          holdExpiresAt: null,
          correctionExpiresAt: null,
          allocationRestored: false,
          paidCount: 1,
          priorityCount: 2,
        },
      ],
      NOW,
    );
    expect(usage.onSite.approvedPaid).toBe(1);
    expect(usage.onSite.approvedPriority).toBe(2);
  });

  it("keeps cancelled capacity when restoration is unknown", () => {
    const usage = resolveUsage(
      [
        {
          channel: "on_site",
          status: "cancelled",
          holdExpiresAt: null,
          correctionExpiresAt: null,
          allocationRestored: null,
          paidCount: 1,
          priorityCount: 2,
        },
      ],
      NOW,
    );
    expect(usage.onSite.approvedPaid).toBe(1);
    expect(usage.onSite.approvedPriority).toBe(2);
  });

  it("releases cancelled capacity when allocation was restored", () => {
    const usage = resolveUsage(
      [
        {
          channel: "on_site",
          status: "cancelled",
          holdExpiresAt: null,
          correctionExpiresAt: null,
          allocationRestored: true,
          paidCount: 1,
          priorityCount: 2,
        },
      ],
      NOW,
    );
    expect(usage.onSite.approvedPaid).toBe(0);
  });
});

describe("canReserveGroup", () => {
  it("requires the complete group to fit totals and channel allocations", () => {
    const usage = resolveUsage(
      [
        {
          channel: "online",
          status: "approved",
          holdExpiresAt: null,
          correctionExpiresAt: null,
          allocationRestored: null,
          paidCount: 69,
          priorityCount: 69,
        },
      ],
      NOW,
    );
    const availability = resolveAvailability(settings, usage);

    expect(
      canReserveGroup(availability, "online", {
        paidCount: 1,
        childCount: 0,
        priorityCount: 1,
      }),
    ).toEqual({ allowed: true });

    expect(
      canReserveGroup(availability, "online", {
        paidCount: 2,
        childCount: 0,
        priorityCount: 2,
      }),
    ).toEqual({ allowed: false, blocker: "channel_paid_allocation" });
  });

  it("protects on-site allocation from online demand", () => {
    const usage = resolveUsage([], NOW);
    const availability = resolveAvailability(
      {
        ...settings,
        onlinePaidAllocation: 0,
        onSitePaidAllocation: 30,
        onlinePriorityAllocation: 0,
        onSitePriorityAllocation: 35,
      },
      usage,
    );

    expect(
      canReserveGroup(availability, "online", {
        paidCount: 1,
        childCount: 0,
        priorityCount: 1,
      }),
    ).toEqual({ allowed: false, blocker: "channel_paid_allocation" });
    expect(
      canReserveGroup(availability, "on_site", {
        paidCount: 1,
        childCount: 0,
        priorityCount: 1,
      }).allowed,
    ).toBe(true);
  });
});

describe("validateSettingsAgainstUsage", () => {
  it("rejects reducing a channel below sold or held quantities", () => {
    const usage = resolveUsage(
      [
        {
          channel: "online",
          status: "approved",
          holdExpiresAt: null,
          correctionExpiresAt: null,
          allocationRestored: null,
          paidCount: 10,
          priorityCount: 12,
        },
      ],
      NOW,
    );

    expect(
      validateSettingsAgainstUsage(
        { ...settings, onlinePaidAllocation: 9 },
        usage,
      ),
    ).toEqual({ allowed: false, blocker: "online_paid_below_usage" });

    expect(validateSettingsAgainstUsage(settings, usage).allowed).toBe(true);
  });

  it("rejects allocations that exceed totals", () => {
    expect(
      validateSettingsAgainstUsage(
        {
          ...settings,
          onlinePaidAllocation: 80,
          onSitePaidAllocation: 30,
        },
        resolveUsage([], NOW),
      ),
    ).toEqual({ allowed: false, blocker: "allocations_exceed_totals" });
  });
});
