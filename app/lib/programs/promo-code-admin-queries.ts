import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { utcTimestamp } from "@/app/lib/sql-time";
import { db } from "@/db";
import {
  programPromoCodeEvents,
  programPromoCodeRedemptions,
  programPromoCodes,
  sessionPurchases,
} from "@/db/schema";

export type PromoCodeDashboardRow = Awaited<
  ReturnType<typeof fetchProgramPromoCodeDashboard>
>[number];

export const fetchProgramPromoCodeDashboard = cache(async () => {
  const now = new Date();
  const inProgressPurchase = sql`(
    ${sessionPurchases.status} IN ('under_verification', 'changes_requested')
    OR (
      ${sessionPurchases.status} = 'pending_upload'
      AND ${sessionPurchases.holdExpiresAt} IS NOT NULL
      AND ${sessionPurchases.holdExpiresAt} > ${utcTimestamp(now)}
    )
  )`;

  const [codes, groupedRedemptions] = await Promise.all([
    db.query.programPromoCodes.findMany({
      with: { program: true },
      orderBy: [desc(programPromoCodes.createdAt)],
    }),
    db
      .select({
        promoCodeId: programPromoCodeRedemptions.promoCodeId,
        confirmedUses:
          sql<number>`count(*) FILTER (WHERE ${sessionPurchases.approvedAt} IS NOT NULL)`.mapWith(
            Number,
          ),
        inProgressUses:
          sql<number>`count(*) FILTER (WHERE ${sessionPurchases.approvedAt} IS NULL AND ${inProgressPurchase})`.mapWith(
            Number,
          ),
        releasedAttempts:
          sql<number>`count(*) FILTER (WHERE ${sessionPurchases.approvedAt} IS NULL AND NOT ${inProgressPurchase})`.mapWith(
            Number,
          ),
        approvedBaseAmount:
          sql<number>`coalesce(sum(${programPromoCodeRedemptions.baseAmountSnapshot}) FILTER (WHERE ${sessionPurchases.approvedAt} IS NOT NULL), 0)`.mapWith(
            Number,
          ),
        approvedDiscountAmount:
          sql<number>`coalesce(sum(${programPromoCodeRedemptions.discountAmountSnapshot}) FILTER (WHERE ${sessionPurchases.approvedAt} IS NOT NULL), 0)`.mapWith(
            Number,
          ),
        approvedNetAmount:
          sql<number>`coalesce(sum(${programPromoCodeRedemptions.totalAmountSnapshot}) FILTER (WHERE ${sessionPurchases.approvedAt} IS NOT NULL), 0)`.mapWith(
            Number,
          ),
      })
      .from(programPromoCodeRedemptions)
      .innerJoin(
        sessionPurchases,
        eq(programPromoCodeRedemptions.purchaseId, sessionPurchases.id),
      )
      .groupBy(programPromoCodeRedemptions.promoCodeId),
  ]);

  const totalsByPromoCode = new Map(
    groupedRedemptions.map(
      ({ promoCodeId, ...totals }) => [promoCodeId, totals] as const,
    ),
  );

  return codes.map((code) => {
    const totals = totalsByPromoCode.get(code.id) ?? {
      confirmedUses: 0,
      inProgressUses: 0,
      releasedAttempts: 0,
      approvedBaseAmount: 0,
      approvedDiscountAmount: 0,
      approvedNetAmount: 0,
    };

    return {
      ...code,
      ...totals,
    };
  });
});

export const fetchProgramPromoCodeForAdmin = cache(
  async (promoCodeId: number) => {
    const [promoCode, redemptions, events] = await Promise.all([
      db.query.programPromoCodes.findFirst({
        where: eq(programPromoCodes.id, promoCodeId),
        with: { program: true },
      }),
      db.query.programPromoCodeRedemptions.findMany({
        where: eq(programPromoCodeRedemptions.promoCodeId, promoCodeId),
        with: {
          purchase: {
            with: {
              buyer: true,
              lines: {
                with: { session: true, occurrence: true },
                orderBy: (lines, { asc: orderAsc }) => [orderAsc(lines.id)],
              },
            },
          },
        },
        orderBy: [desc(programPromoCodeRedemptions.createdAt)],
      }),
      db.query.programPromoCodeEvents.findMany({
        where: eq(programPromoCodeEvents.promoCodeId, promoCodeId),
        with: { actor: true },
        orderBy: [desc(programPromoCodeEvents.createdAt)],
      }),
    ]);

    return promoCode ? { promoCode, redemptions, events } : null;
  },
);

export const fetchProgramsForPromoCodeForm = cache(async () => {
  return db.query.programs.findMany({
    columns: { id: true, name: true },
    orderBy: (programs, { asc: orderAsc }) => [orderAsc(programs.name)],
  });
});
