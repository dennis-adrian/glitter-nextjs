import "server-only";

import { desc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  programPromoCodeEvents,
  programPromoCodeRedemptions,
  programPromoCodes,
} from "@/db/schema";

export type PromoCodeDashboardRow = Awaited<
  ReturnType<typeof fetchProgramPromoCodeDashboard>
>[number];

export const fetchProgramPromoCodeDashboard = cache(async () => {
  const now = new Date();
  const [codes, redemptions] = await Promise.all([
    db.query.programPromoCodes.findMany({
      with: { program: true },
      orderBy: [desc(programPromoCodes.createdAt)],
    }),
    db.query.programPromoCodeRedemptions.findMany({
      with: { purchase: true },
      orderBy: [desc(programPromoCodeRedemptions.createdAt)],
    }),
  ]);

  const redemptionsByPromoCode = new Map<
    number,
    (typeof redemptions)[number][]
  >();
  for (const redemption of redemptions) {
    const uses = redemptionsByPromoCode.get(redemption.promoCodeId) ?? [];
    uses.push(redemption);
    redemptionsByPromoCode.set(redemption.promoCodeId, uses);
  }

  return codes.map((code) => {
    const uses = redemptionsByPromoCode.get(code.id) ?? [];
    let confirmedUses = 0;
    let inProgressUses = 0;
    let releasedAttempts = 0;
    let approvedBaseAmount = 0;
    let approvedDiscountAmount = 0;
    let approvedNetAmount = 0;

    for (const use of uses) {
      const { purchase } = use;
      if (purchase.approvedAt) {
        confirmedUses += 1;
        approvedBaseAmount += use.baseAmountSnapshot;
        approvedDiscountAmount += use.discountAmountSnapshot;
        approvedNetAmount += use.totalAmountSnapshot;
      } else if (
        purchase.status === "under_verification" ||
        purchase.status === "changes_requested" ||
        (purchase.status === "pending_upload" &&
          purchase.holdExpiresAt !== null &&
          purchase.holdExpiresAt > now)
      ) {
        inProgressUses += 1;
      } else {
        releasedAttempts += 1;
      }
    }

    return {
      ...code,
      confirmedUses,
      inProgressUses,
      releasedAttempts,
      approvedBaseAmount,
      approvedDiscountAmount,
      approvedNetAmount,
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
