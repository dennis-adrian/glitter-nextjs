import type {
  FastPassChannel,
  FastPassDaySettings,
  FastPassPurchaseStatus,
} from "@/app/lib/fast-pass/definitions";
import { isFastPassPurchaseHolding } from "@/app/lib/fast-pass/state";

/**
 * Availability is derived, never stored.
 *
 * Paid inventory and priority capacity are separate ceilings:
 * - each paid holder consumes 1 paid unit + 1 priority unit
 * - each child companion consumes 1 priority unit only
 *
 * Holds (pending upload / under verification / live correction window) and
 * approved sales (that have not confirmed restored allocation on cancellation)
 * both consume capacity. Lazy expiry means an overdue hold frees capacity
 * before the bookkeeping sweep runs.
 */

export type FastPassGroupDemand = {
  paidCount: number;
  priorityCount: number;
  childCount: number;
};

export type FastPassLineDemand = {
  responsibleChildCount: number;
};

export function demandFromLines(
  lines: FastPassLineDemand[],
): FastPassGroupDemand {
  const paidCount = lines.length;
  const childCount = lines.reduce(
    (sum, line) => sum + line.responsibleChildCount,
    0,
  );
  return {
    paidCount,
    childCount,
    priorityCount: paidCount + childCount,
  };
}

export type FastPassPurchaseConsumption = {
  channel: FastPassChannel;
  status: FastPassPurchaseStatus;
  holdExpiresAt: Date | null;
  correctionExpiresAt: Date | null;
  allocationRestored: boolean | null;
  paidCount: number;
  priorityCount: number;
};

export type FastPassChannelUsage = {
  heldPaid: number;
  heldPriority: number;
  approvedPaid: number;
  approvedPriority: number;
};

export type FastPassUsage = {
  total: FastPassChannelUsage;
  online: FastPassChannelUsage;
  onSite: FastPassChannelUsage;
};

function emptyUsage(): FastPassChannelUsage {
  return {
    heldPaid: 0,
    heldPriority: 0,
    approvedPaid: 0,
    approvedPriority: 0,
  };
}

function addUsage(
  target: FastPassChannelUsage,
  paid: number,
  priority: number,
  kind: "held" | "approved",
): void {
  if (kind === "held") {
    target.heldPaid += paid;
    target.heldPriority += priority;
  } else {
    target.approvedPaid += paid;
    target.approvedPriority += priority;
  }
}

/**
 * Aggregate held and approved consumption across purchases for a festival day.
 *
 * Cancelled purchases stop consuming only when `allocationRestored` is
 * explicitly true. False (wristbands unrecovered) and null (unknown, e.g. a
 * cancellation recorded before the flag existed) both keep capacity occupied,
 * so the unknown case never oversells the day.
 */
export function resolveUsage(
  purchases: FastPassPurchaseConsumption[],
  now: Date = new Date(),
): FastPassUsage {
  const usage: FastPassUsage = {
    total: emptyUsage(),
    online: emptyUsage(),
    onSite: emptyUsage(),
  };

  for (const purchase of purchases) {
    const channelUsage =
      purchase.channel === "online" ? usage.online : usage.onSite;

    if (isFastPassPurchaseHolding(purchase, now)) {
      addUsage(usage.total, purchase.paidCount, purchase.priorityCount, "held");
      addUsage(
        channelUsage,
        purchase.paidCount,
        purchase.priorityCount,
        "held",
      );
      continue;
    }

    if (purchase.status === "approved") {
      addUsage(
        usage.total,
        purchase.paidCount,
        purchase.priorityCount,
        "approved",
      );
      addUsage(
        channelUsage,
        purchase.paidCount,
        purchase.priorityCount,
        "approved",
      );
      continue;
    }

    if (
      purchase.status === "cancelled" &&
      purchase.allocationRestored !== true
    ) {
      addUsage(
        usage.total,
        purchase.paidCount,
        purchase.priorityCount,
        "approved",
      );
      addUsage(
        channelUsage,
        purchase.paidCount,
        purchase.priorityCount,
        "approved",
      );
    }
  }

  return usage;
}

export type FastPassAvailability = {
  paidInventoryLimit: number;
  priorityCapacityLimit: number;
  onlinePaidAllocation: number;
  onSitePaidAllocation: number;
  onlinePriorityAllocation: number;
  onSitePriorityAllocation: number;
  usage: FastPassUsage;
  remainingPaid: number;
  remainingPriority: number;
  remainingOnlinePaid: number;
  remainingOnSitePaid: number;
  remainingOnlinePriority: number;
  remainingOnSitePriority: number;
  expectedPriorityVisitors: number;
};

export function resolveAvailability(
  settings: Pick<
    FastPassDaySettings,
    | "paidInventoryLimit"
    | "priorityCapacityLimit"
    | "onlinePaidAllocation"
    | "onSitePaidAllocation"
    | "onlinePriorityAllocation"
    | "onSitePriorityAllocation"
  >,
  usage: FastPassUsage,
): FastPassAvailability {
  const totalOccupiedPaid = usage.total.heldPaid + usage.total.approvedPaid;
  const totalOccupiedPriority =
    usage.total.heldPriority + usage.total.approvedPriority;

  const onlineOccupiedPaid = usage.online.heldPaid + usage.online.approvedPaid;
  const onlineOccupiedPriority =
    usage.online.heldPriority + usage.online.approvedPriority;
  const onSiteOccupiedPaid = usage.onSite.heldPaid + usage.onSite.approvedPaid;
  const onSiteOccupiedPriority =
    usage.onSite.heldPriority + usage.onSite.approvedPriority;

  return {
    paidInventoryLimit: settings.paidInventoryLimit,
    priorityCapacityLimit: settings.priorityCapacityLimit,
    onlinePaidAllocation: settings.onlinePaidAllocation,
    onSitePaidAllocation: settings.onSitePaidAllocation,
    onlinePriorityAllocation: settings.onlinePriorityAllocation,
    onSitePriorityAllocation: settings.onSitePriorityAllocation,
    usage,
    remainingPaid: Math.max(0, settings.paidInventoryLimit - totalOccupiedPaid),
    remainingPriority: Math.max(
      0,
      settings.priorityCapacityLimit - totalOccupiedPriority,
    ),
    remainingOnlinePaid: Math.max(
      0,
      settings.onlinePaidAllocation - onlineOccupiedPaid,
    ),
    remainingOnSitePaid: Math.max(
      0,
      settings.onSitePaidAllocation - onSiteOccupiedPaid,
    ),
    remainingOnlinePriority: Math.max(
      0,
      settings.onlinePriorityAllocation - onlineOccupiedPriority,
    ),
    remainingOnSitePriority: Math.max(
      0,
      settings.onSitePriorityAllocation - onSiteOccupiedPriority,
    ),
    expectedPriorityVisitors: totalOccupiedPriority,
  };
}

export type ReserveBlocker =
  | "no_demand"
  | "paid_inventory"
  | "priority_capacity"
  | "channel_paid_allocation"
  | "channel_priority_allocation";

export type ReserveCheck =
  | { allowed: true }
  | { allowed: false; blocker: ReserveBlocker };

/**
 * Whether a complete group fits both total and channel-specific ceilings.
 * Partial group allocation is never allowed.
 */
export function canReserveGroup(
  availability: FastPassAvailability,
  channel: FastPassChannel,
  demand: FastPassGroupDemand,
): ReserveCheck {
  if (demand.paidCount <= 0 || demand.priorityCount <= 0) {
    return { allowed: false, blocker: "no_demand" };
  }

  if (availability.remainingPaid < demand.paidCount) {
    return { allowed: false, blocker: "paid_inventory" };
  }
  if (availability.remainingPriority < demand.priorityCount) {
    return { allowed: false, blocker: "priority_capacity" };
  }

  const remainingChannelPaid =
    channel === "online"
      ? availability.remainingOnlinePaid
      : availability.remainingOnSitePaid;
  const remainingChannelPriority =
    channel === "online"
      ? availability.remainingOnlinePriority
      : availability.remainingOnSitePriority;

  if (remainingChannelPaid < demand.paidCount) {
    return { allowed: false, blocker: "channel_paid_allocation" };
  }
  if (remainingChannelPriority < demand.priorityCount) {
    return { allowed: false, blocker: "channel_priority_allocation" };
  }

  return { allowed: true };
}

export type SettingsAllocationBlocker =
  | "allocations_exceed_totals"
  | "online_paid_below_usage"
  | "on_site_paid_below_usage"
  | "online_priority_below_usage"
  | "on_site_priority_below_usage"
  | "paid_limit_below_usage"
  | "priority_limit_below_usage"
  | "invalid_limits";

export type SettingsAllocationCheck =
  | { allowed: true }
  | { allowed: false; blocker: SettingsAllocationBlocker };

/**
 * Prevent settings/allocation reductions below existing holds and sales.
 */
export function validateSettingsAgainstUsage(
  proposed: Pick<
    FastPassDaySettings,
    | "paidInventoryLimit"
    | "priorityCapacityLimit"
    | "onlinePaidAllocation"
    | "onSitePaidAllocation"
    | "onlinePriorityAllocation"
    | "onSitePriorityAllocation"
  >,
  usage: FastPassUsage,
): SettingsAllocationCheck {
  if (
    proposed.paidInventoryLimit <= 0 ||
    proposed.priorityCapacityLimit <= 0 ||
    proposed.onlinePaidAllocation < 0 ||
    proposed.onSitePaidAllocation < 0 ||
    proposed.onlinePriorityAllocation < 0 ||
    proposed.onSitePriorityAllocation < 0
  ) {
    return { allowed: false, blocker: "invalid_limits" };
  }

  if (
    proposed.onlinePaidAllocation + proposed.onSitePaidAllocation >
      proposed.paidInventoryLimit ||
    proposed.onlinePriorityAllocation + proposed.onSitePriorityAllocation >
      proposed.priorityCapacityLimit
  ) {
    return { allowed: false, blocker: "allocations_exceed_totals" };
  }

  const onlinePaidUsed = usage.online.heldPaid + usage.online.approvedPaid;
  const onSitePaidUsed = usage.onSite.heldPaid + usage.onSite.approvedPaid;
  const onlinePriorityUsed =
    usage.online.heldPriority + usage.online.approvedPriority;
  const onSitePriorityUsed =
    usage.onSite.heldPriority + usage.onSite.approvedPriority;
  const totalPaidUsed = usage.total.heldPaid + usage.total.approvedPaid;
  const totalPriorityUsed =
    usage.total.heldPriority + usage.total.approvedPriority;

  if (proposed.paidInventoryLimit < totalPaidUsed) {
    return { allowed: false, blocker: "paid_limit_below_usage" };
  }
  if (proposed.priorityCapacityLimit < totalPriorityUsed) {
    return { allowed: false, blocker: "priority_limit_below_usage" };
  }
  if (proposed.onlinePaidAllocation < onlinePaidUsed) {
    return { allowed: false, blocker: "online_paid_below_usage" };
  }
  if (proposed.onSitePaidAllocation < onSitePaidUsed) {
    return { allowed: false, blocker: "on_site_paid_below_usage" };
  }
  if (proposed.onlinePriorityAllocation < onlinePriorityUsed) {
    return { allowed: false, blocker: "online_priority_below_usage" };
  }
  if (proposed.onSitePriorityAllocation < onSitePriorityUsed) {
    return { allowed: false, blocker: "on_site_priority_below_usage" };
  }

  return { allowed: true };
}
