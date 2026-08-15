import "server-only";

import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  fastPassDaySettings,
  fastPassPosOperators,
  fastPassPurchases,
  fastPassRefunds,
  fastPassTickets,
  fastPassTransactions,
  festivalAdminAssignments,
  festivalDates,
} from "@/db/schema";

type FastPassAdmin = NonNullable<
  Awaited<ReturnType<typeof requireAdminOrFestivalAdmin>>
>;

const hasFestivalAssignment = cache(async function hasFestivalAssignment(
  userId: number,
  festivalId: number,
): Promise<boolean> {
  const [assignment] = await db
    .select({ id: festivalAdminAssignments.id })
    .from(festivalAdminAssignments)
    .where(
      and(
        eq(festivalAdminAssignments.userId, userId),
        eq(festivalAdminAssignments.festivalId, festivalId),
      ),
    )
    .limit(1);

  return Boolean(assignment);
});

async function authorizeFestival(
  admin: FastPassAdmin,
  festivalId: number,
): Promise<FastPassAdmin | null> {
  if (admin.role === "admin") return admin;
  return (await hasFestivalAssignment(admin.id, festivalId)) ? admin : null;
}

/** Global admins may manage every festival; festival admins need an assignment. */
export const requireFastPassFestivalAdmin = cache(async function (
  festivalId: number,
): Promise<FastPassAdmin | null> {
  if (!Number.isInteger(festivalId) || festivalId <= 0) return null;

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return null;

  return authorizeFestival(admin, festivalId);
});

async function requireResourceAdmin(
  resolveFestivalId: () => Promise<number | null>,
): Promise<FastPassAdmin | null> {
  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return null;
  if (admin.role === "admin") return admin;

  const festivalId = await resolveFestivalId();
  if (festivalId === null) return null;

  return authorizeFestival(admin, festivalId);
}

export function requireFastPassFestivalDateAdmin(festivalDateId: number) {
  return requireResourceAdmin(async () => {
    const [date] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(festivalDates)
      .where(eq(festivalDates.id, festivalDateId))
      .limit(1);
    return date?.festivalId ?? null;
  });
}

export function requireFastPassSettingsAdmin(settingsId: number) {
  return requireResourceAdmin(async () => {
    const [settings] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(fastPassDaySettings)
      .innerJoin(
        festivalDates,
        eq(festivalDates.id, fastPassDaySettings.festivalDateId),
      )
      .where(eq(fastPassDaySettings.id, settingsId))
      .limit(1);
    return settings?.festivalId ?? null;
  });
}

export function requireFastPassPurchaseAdmin(purchaseId: number) {
  return requireResourceAdmin(async () => {
    const [purchase] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(fastPassPurchases)
      .innerJoin(
        festivalDates,
        eq(festivalDates.id, fastPassPurchases.festivalDateId),
      )
      .where(eq(fastPassPurchases.id, purchaseId))
      .limit(1);
    return purchase?.festivalId ?? null;
  });
}

export function requireFastPassTransactionAdmin(transactionId: number) {
  return requireResourceAdmin(async () => {
    const [transaction] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(fastPassTransactions)
      .innerJoin(
        fastPassPurchases,
        eq(fastPassPurchases.id, fastPassTransactions.purchaseId),
      )
      .innerJoin(
        festivalDates,
        eq(festivalDates.id, fastPassPurchases.festivalDateId),
      )
      .where(eq(fastPassTransactions.id, transactionId))
      .limit(1);
    return transaction?.festivalId ?? null;
  });
}

export function requireFastPassTicketAdmin(input: {
  ticketId?: number;
  code?: string;
}) {
  return requireResourceAdmin(async () => {
    const identifier = input.ticketId
      ? eq(fastPassTickets.id, input.ticketId)
      : input.code
        ? eq(fastPassTickets.code, input.code)
        : null;
    if (!identifier) return null;

    const [ticket] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(fastPassTickets)
      .innerJoin(
        festivalDates,
        eq(festivalDates.id, fastPassTickets.festivalDateId),
      )
      .where(identifier)
      .limit(1);
    return ticket?.festivalId ?? null;
  });
}

export function requireFastPassPosOperatorAdmin(operatorId: number) {
  return requireResourceAdmin(async () => {
    const [operator] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(fastPassPosOperators)
      .innerJoin(
        fastPassDaySettings,
        eq(fastPassDaySettings.id, fastPassPosOperators.settingsId),
      )
      .innerJoin(
        festivalDates,
        eq(festivalDates.id, fastPassDaySettings.festivalDateId),
      )
      .where(eq(fastPassPosOperators.id, operatorId))
      .limit(1);
    return operator?.festivalId ?? null;
  });
}

export function requireFastPassRefundAdmin(refundId: number) {
  return requireResourceAdmin(async () => {
    const [refund] = await db
      .select({ festivalId: festivalDates.festivalId })
      .from(fastPassRefunds)
      .innerJoin(
        fastPassPurchases,
        eq(fastPassPurchases.id, fastPassRefunds.purchaseId),
      )
      .innerJoin(
        festivalDates,
        eq(festivalDates.id, fastPassPurchases.festivalDateId),
      )
      .where(eq(fastPassRefunds.id, refundId))
      .limit(1);
    return refund?.festivalId ?? null;
  });
}
