import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  fastPassDaySettings,
  fastPassEvents,
  fastPassPosOperators,
  fastPassPurchaseLines,
  fastPassPurchases,
  fastPassRefunds,
  fastPassTickets,
  fastPassTransactions,
  fastPassVouchers,
  festivalDates,
} from "@/db/schema";
import { formatFullDate } from "@/app/lib/formatters";
import {
  requireFastPassFestivalAdmin,
  requireFastPassPurchaseAdmin,
  requireFastPassSettingsAdmin,
  requireFastPassTicketAdmin,
} from "@/app/lib/fast-pass/admin-auth";
import { FAST_PASS_CHANNEL_LABELS } from "@/app/lib/fast-pass/definitions";

const purchaseWith = {
  settings: {
    with: {
      festivalDate: true as const,
      notificationRecipients: true as const,
    },
  },
  festivalDate: true as const,
  lines: {
    orderBy: [asc(fastPassPurchaseLines.id)] as [ReturnType<typeof asc>],
    with: {
      ticket: {
        with: {
          activation: true as const,
        },
      },
    },
  },
  vouchers: {
    orderBy: [desc(fastPassVouchers.version)] as [ReturnType<typeof desc>],
  },
  transactions: {
    orderBy: [asc(fastPassTransactions.createdAt)] as [ReturnType<typeof asc>],
  },
  events: {
    orderBy: [asc(fastPassEvents.createdAt)] as [ReturnType<typeof asc>],
  },
};

/**
 * Loads a purchase for the secure access page. Authorization is the caller's
 * job — do not render before `resolvePurchaseAccess` passes.
 */
export const fetchPurchaseForAccess = cache(async (purchaseId: number) => {
  return db.query.fastPassPurchases.findFirst({
    where: eq(fastPassPurchases.id, purchaseId),
    with: {
      settings: { with: { festivalDate: true } },
      festivalDate: true,
      lines: {
        with: {
          ticket: { with: { activation: true } },
        },
      },
      vouchers: {
        orderBy: [desc(fastPassVouchers.version)],
      },
    },
  });
});

export type FastPassPurchaseForAccess = NonNullable<
  Awaited<ReturnType<typeof fetchPurchaseForAccess>>
>;

/** Admin detail view with ledger and audit trail. */
export const fetchPurchaseForAdmin = cache(async (purchaseId: number) => {
  if (!(await requireFastPassPurchaseAdmin(purchaseId))) return undefined;

  return db.query.fastPassPurchases.findFirst({
    where: eq(fastPassPurchases.id, purchaseId),
    with: purchaseWith,
  });
});

export type FastPassPurchaseForAdmin = NonNullable<
  Awaited<ReturnType<typeof fetchPurchaseForAdmin>>
>;

/** Online purchases waiting on a voucher decision, oldest first. */
export const fetchPurchasesAwaitingReview = cache(
  async (settingsId: number) => {
    if (!(await requireFastPassSettingsAdmin(settingsId))) return [];

    return db.query.fastPassPurchases.findMany({
      where: and(
        eq(fastPassPurchases.settingsId, settingsId),
        eq(fastPassPurchases.channel, "online"),
        inArray(fastPassPurchases.status, [
          "under_verification",
          "changes_requested",
        ]),
      ),
      with: {
        lines: true,
        vouchers: {
          orderBy: [desc(fastPassVouchers.version)],
        },
      },
      orderBy: [asc(fastPassPurchases.voucherSubmittedAt)],
    });
  },
);

/** Resolve a ticket by its QR/manual code for check-in. */
export const fetchTicketByCode = cache(async (code: string) => {
  if (!(await requireFastPassTicketAdmin({ code }))) return undefined;

  return db.query.fastPassTickets.findFirst({
    where: eq(fastPassTickets.code, code),
    with: {
      purchaseLine: {
        with: {
          purchase: {
            with: {
              settings: true,
              festivalDate: true,
            },
          },
        },
      },
      activation: true,
    },
  });
});

export type FastPassReviewQueueItem = {
  id: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  festivalDateLabel: string;
  totalAmount: number;
  status: "under_verification" | "changes_requested";
  voucherSubmittedAt: Date | null;
  paidPassCount: number;
  childCount: number;
  vouchers: { version: number; fileUrl: string; createdAt: Date }[];
};

export async function fetchFastPassPurchasesAwaitingReview(
  festivalId: number,
): Promise<FastPassReviewQueueItem[]> {
  if (!(await requireFastPassFestivalAdmin(festivalId))) return [];

  const settingsRows = await db
    .select({
      settingsId: fastPassDaySettings.id,
      startDate: festivalDates.startDate,
    })
    .from(fastPassDaySettings)
    .innerJoin(
      festivalDates,
      eq(festivalDates.id, fastPassDaySettings.festivalDateId),
    )
    .where(eq(festivalDates.festivalId, festivalId));

  const items: FastPassReviewQueueItem[] = [];

  for (const row of settingsRows) {
    const purchases = await fetchPurchasesAwaitingReview(row.settingsId);
    for (const purchase of purchases) {
      const paidPassCount = purchase.lines.length;
      const childCount = purchase.lines.reduce(
        (sum, line) => sum + line.responsibleChildCount,
        0,
      );
      items.push({
        id: purchase.id,
        buyerName: purchase.buyerName ?? "Comprador",
        buyerEmail: purchase.buyerEmail ?? "",
        buyerPhone: purchase.buyerPhone,
        festivalDateLabel: formatFullDate(row.startDate),
        totalAmount: purchase.totalAmount,
        status: purchase.status as "under_verification" | "changes_requested",
        voucherSubmittedAt: purchase.voucherSubmittedAt,
        paidPassCount,
        childCount,
        vouchers: purchase.vouchers,
      });
    }
  }

  return items.sort((a, b) => {
    const aTime = a.voucherSubmittedAt?.getTime() ?? 0;
    const bTime = b.voucherSubmittedAt?.getTime() ?? 0;
    return aTime - bTime;
  });
}

export type FastPassTransactionRow = {
  id: number;
  purchaseId: number;
  type: (typeof fastPassTransactions.$inferSelect)["type"];
  amount: number;
  relatedTransactionId: number | null;
  paymentMethod: (typeof fastPassTransactions.$inferSelect)["paymentMethod"];
  createdAt: Date;
  channelLabel: string;
  operatorLabel: string | null;
  isCancellable: boolean;
};

export async function fetchFastPassTransactions(
  festivalId: number,
): Promise<FastPassTransactionRow[]> {
  if (!(await requireFastPassFestivalAdmin(festivalId))) return [];

  const rows = await db
    .select({
      id: fastPassTransactions.id,
      purchaseId: fastPassTransactions.purchaseId,
      type: fastPassTransactions.type,
      amount: fastPassTransactions.amount,
      paymentMethod: fastPassTransactions.paymentMethod,
      relatedTransactionId: fastPassTransactions.relatedTransactionId,
      createdAt: fastPassTransactions.createdAt,
      channel: fastPassPurchases.channel,
      posOperatorId: fastPassTransactions.posOperatorId,
    })
    .from(fastPassTransactions)
    .innerJoin(
      fastPassPurchases,
      eq(fastPassPurchases.id, fastPassTransactions.purchaseId),
    )
    .innerJoin(
      festivalDates,
      eq(festivalDates.id, fastPassPurchases.festivalDateId),
    )
    .where(eq(festivalDates.festivalId, festivalId))
    .orderBy(desc(fastPassTransactions.createdAt));

  const operatorIds = [
    ...new Set(rows.map((row) => row.posOperatorId).filter(Boolean)),
  ] as number[];

  const operators =
    operatorIds.length > 0
      ? await db.query.fastPassPosOperators.findMany({
          where: inArray(fastPassPosOperators.id, operatorIds),
        })
      : [];

  const operatorMap = new Map(
    operators.map((operator) => [operator.id, operator.displayName]),
  );
  const reversedSaleIds = new Set(
    rows
      .filter((row) => row.type === "cancellation" || row.type === "refund")
      .map((row) => row.relatedTransactionId)
      .filter((id): id is number => id !== null),
  );

  return rows.map((row) => ({
    id: row.id,
    purchaseId: row.purchaseId,
    type: row.type,
    amount: row.amount,
    relatedTransactionId: row.relatedTransactionId,
    paymentMethod: row.paymentMethod,
    createdAt: row.createdAt,
    channelLabel: FAST_PASS_CHANNEL_LABELS[row.channel],
    operatorLabel: row.posOperatorId
      ? (operatorMap.get(row.posOperatorId) ?? null)
      : null,
    isCancellable: row.type === "sale" && !reversedSaleIds.has(row.id),
  }));
}

export async function fetchFastPassNotificationFailureCount(
  festivalId: number,
): Promise<number> {
  if (!(await requireFastPassFestivalAdmin(festivalId))) return 0;

  const rows = await db
    .select({ id: fastPassEvents.id })
    .from(fastPassEvents)
    .innerJoin(
      fastPassPurchases,
      eq(fastPassPurchases.id, fastPassEvents.purchaseId),
    )
    .innerJoin(
      festivalDates,
      eq(festivalDates.id, fastPassPurchases.festivalDateId),
    )
    .where(
      and(
        eq(festivalDates.festivalId, festivalId),
        eq(fastPassEvents.eventType, "notification_failed"),
      ),
    );
  return rows.length;
}

export type FastPassTicketRow = {
  id: number;
  code: string;
  status: (typeof fastPassTickets.$inferSelect)["status"];
  holderName: string | null;
  festivalDateLabel: string;
  issuedAt: Date;
  activatedAt: Date | null;
  purchaseId: number;
};

export async function fetchFastPassTickets(
  festivalId: number,
): Promise<FastPassTicketRow[]> {
  if (!(await requireFastPassFestivalAdmin(festivalId))) return [];

  const rows = await db
    .select({
      id: fastPassTickets.id,
      code: fastPassTickets.code,
      status: fastPassTickets.status,
      holderFirstName: fastPassTickets.holderFirstName,
      holderLastName: fastPassTickets.holderLastName,
      issuedAt: fastPassTickets.issuedAt,
      activatedAt: fastPassTickets.activatedAt,
      purchaseId: fastPassPurchaseLines.purchaseId,
      startDate: festivalDates.startDate,
    })
    .from(fastPassTickets)
    .innerJoin(
      fastPassPurchaseLines,
      eq(fastPassPurchaseLines.id, fastPassTickets.purchaseLineId),
    )
    .innerJoin(
      festivalDates,
      eq(festivalDates.id, fastPassTickets.festivalDateId),
    )
    .where(eq(festivalDates.festivalId, festivalId))
    .orderBy(desc(fastPassTickets.issuedAt));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    holderName:
      [row.holderFirstName, row.holderLastName].filter(Boolean).join(" ") ||
      null,
    festivalDateLabel: formatFullDate(row.startDate),
    issuedAt: row.issuedAt,
    activatedAt: row.activatedAt,
    purchaseId: row.purchaseId,
  }));
}

export type FastPassPosOperatorRow = {
  id: number;
  settingsId: number;
  displayName: string;
  festivalDateLabel: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export async function fetchFastPassPosOperators(
  festivalId: number,
): Promise<FastPassPosOperatorRow[]> {
  if (!(await requireFastPassFestivalAdmin(festivalId))) return [];

  const rows = await db
    .select({
      id: fastPassPosOperators.id,
      settingsId: fastPassPosOperators.settingsId,
      displayName: fastPassPosOperators.displayName,
      expiresAt: fastPassPosOperators.expiresAt,
      revokedAt: fastPassPosOperators.revokedAt,
      lastUsedAt: fastPassPosOperators.lastUsedAt,
      createdAt: fastPassPosOperators.createdAt,
      startDate: festivalDates.startDate,
    })
    .from(fastPassPosOperators)
    .innerJoin(
      fastPassDaySettings,
      eq(fastPassDaySettings.id, fastPassPosOperators.settingsId),
    )
    .innerJoin(
      festivalDates,
      eq(festivalDates.id, fastPassDaySettings.festivalDateId),
    )
    .where(eq(festivalDates.festivalId, festivalId))
    .orderBy(desc(fastPassPosOperators.createdAt));

  return rows.map((row) => ({
    id: row.id,
    settingsId: row.settingsId,
    displayName: row.displayName,
    festivalDateLabel: formatFullDate(row.startDate),
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  }));
}

export type FastPassRefundRow = {
  id: number;
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  amount: number;
  paymentMethod: (typeof fastPassPurchases.$inferSelect)["paymentMethod"];
  status: (typeof fastPassRefunds.$inferSelect)["status"];
  createdAt: Date;
};

export async function fetchFastPassPendingRefunds(
  festivalId: number,
): Promise<FastPassRefundRow[]> {
  if (!(await requireFastPassFestivalAdmin(festivalId))) return [];

  const rows = await db
    .select({
      id: fastPassRefunds.id,
      purchaseId: fastPassRefunds.purchaseId,
      amount: fastPassRefunds.amount,
      status: fastPassRefunds.status,
      createdAt: fastPassRefunds.createdAt,
      buyerName: fastPassPurchases.buyerName,
      buyerEmail: fastPassPurchases.buyerEmail,
      paymentMethod: fastPassPurchases.paymentMethod,
    })
    .from(fastPassRefunds)
    .innerJoin(
      fastPassPurchases,
      eq(fastPassPurchases.id, fastPassRefunds.purchaseId),
    )
    .innerJoin(
      festivalDates,
      eq(festivalDates.id, fastPassPurchases.festivalDateId),
    )
    .where(
      and(
        eq(festivalDates.festivalId, festivalId),
        eq(fastPassRefunds.status, "pending"),
      ),
    )
    .orderBy(asc(fastPassRefunds.createdAt));

  return rows.map((row) => ({
    id: row.id,
    purchaseId: row.purchaseId,
    buyerName: row.buyerName ?? "Comprador",
    buyerEmail: row.buyerEmail ?? "",
    amount: row.amount,
    paymentMethod: row.paymentMethod,
    status: row.status,
    createdAt: row.createdAt,
  }));
}
