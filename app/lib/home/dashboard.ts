import { formatCredits } from "@/app/lib/credits/format";
import { formatDisplayDate } from "@/app/lib/formatters";
import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";

export type DashboardStat = {
  key: "credits" | "orders" | "programs" | "next_event";
  label: string;
  value: string;
  caption: string;
  href: string;
  /** Phones show the festival as its own card instead. */
  desktopOnly?: boolean;
};

/** Order statuses that still have something left to happen. */
const ORDERS_IN_PROGRESS = ["pending", "payment_verification"] as const;

/** A purchase that still gets its holder in, or will once reviewed. */
const LIVE_PURCHASE_STATUSES = new Set<SessionPurchaseStatus>([
  "pending_upload",
  "under_verification",
  "changes_requested",
  "approved",
]);

type PurchaseSummary = {
  status: SessionPurchaseStatus;
  lines: { occurrence: { endsAt: Date } | null }[];
};

/** Purchases still live with a session that has not ended yet. */
export function countUpcomingPurchases(
  purchases: PurchaseSummary[],
  now = new Date(),
) {
  return purchases.filter(
    (purchase) =>
      LIVE_PURCHASE_STATUSES.has(purchase.status) &&
      purchase.lines.some(
        (line) => line.occurrence && line.occurrence.endsAt > now,
      ),
  ).length;
}

/**
 * The tiles across the top of the home. Each one is left out when its feature
 * is off for the viewer, rather than showing a zero that links nowhere.
 */
export function buildDashboardStats({
  creditBalance,
  orderCounts,
  upcomingPurchases,
  nextFestival,
}: {
  /** Null when credits are off. */
  creditBalance: number | null;
  orderCounts: Partial<Record<string, number>>;
  /** Null when paid programs are off. */
  upcomingPurchases: number | null;
  nextFestival: { name: string; daysLeft: number } | null;
}): DashboardStat[] {
  const stats: DashboardStat[] = [];

  if (creditBalance != null) {
    stats.push({
      key: "credits",
      label: "Créditos",
      value: formatCredits(creditBalance),
      caption: "disponibles",
      href: "/my_credits",
    });
  }

  const ordersInProgress = ORDERS_IN_PROGRESS.reduce(
    (total, status) => total + (orderCounts[status] ?? 0),
    0,
  );
  stats.push({
    key: "orders",
    label: "Pedidos",
    value: String(ordersInProgress),
    caption: "en curso",
    href: "/my_orders",
  });

  if (upcomingPurchases != null) {
    stats.push({
      key: "programs",
      label: "Charlas",
      value: String(upcomingPurchases),
      caption: upcomingPurchases === 1 ? "inscripción" : "inscripciones",
      href: "/my_programs",
    });
  }

  if (nextFestival) {
    stats.push({
      key: "next_event",
      label: "Próximo evento",
      value:
        nextFestival.daysLeft === 1 ? "1 día" : `${nextFestival.daysLeft} días`,
      caption: nextFestival.name,
      href: "/my_participations",
      desktopOnly: true,
    });
  }

  return stats;
}

type ActivityDates = {
  registrationStartDate: Date;
  registrationEndDate: Date;
  allowsVoting: boolean;
  votingStartDate: Date | null;
  votingEndDate: Date | null;
};

function dayAndMonth(date: Date) {
  return formatDisplayDate(date, { day: "numeric", month: "long" });
}

/** One line on where an activity stands for the viewer, for the home's list. */
export function describeActivity(
  activity: ActivityDates,
  isEnrolled: boolean,
  now = new Date(),
): string {
  if (isEnrolled) return "Ya te inscribiste";
  if (now < activity.registrationStartDate) {
    return `Inscripción desde el ${dayAndMonth(activity.registrationStartDate)}`;
  }
  if (now <= activity.registrationEndDate) return "Inscripción abierta";
  if (
    activity.allowsVoting &&
    activity.votingStartDate &&
    now < activity.votingStartDate
  ) {
    return `Votación desde el ${dayAndMonth(activity.votingStartDate)}`;
  }
  if (
    activity.allowsVoting &&
    activity.votingStartDate &&
    activity.votingEndDate &&
    now <= activity.votingEndDate
  ) {
    return "Votación abierta";
  }
  return "Inscripción cerrada";
}
