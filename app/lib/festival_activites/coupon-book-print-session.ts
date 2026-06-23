import "server-only";

import {
  CouponBookDraft,
  CouponBookExportScope,
  isCouponBookDraft,
} from "@/app/lib/festival_activites/coupon-book-draft";
import { db } from "@/db";
import { couponBookPrintSessions } from "@/db/schema";
import { eq, lt } from "drizzle-orm";

const SESSION_TTL_MS = 5 * 60 * 1000;

type CouponBookPrintSessionPayload = {
  draft: CouponBookDraft;
  exportScope: CouponBookExportScope;
};

async function purgeExpiredSessions() {
  await db
    .delete(couponBookPrintSessions)
    .where(lt(couponBookPrintSessions.expiresAt, new Date()));
}

export async function createCouponBookPrintSession(input: {
  draft: CouponBookDraft;
  exportScope: CouponBookExportScope;
}): Promise<string> {
  await purgeExpiredSessions();
  const sessionId = crypto.randomUUID();
  await db.insert(couponBookPrintSessions).values({
    id: sessionId,
    payload: {
      draft: input.draft,
      exportScope: input.exportScope,
    },
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return sessionId;
}

export async function getCouponBookPrintSession(
  sessionId: string,
): Promise<{
  draft: CouponBookDraft;
  exportScope: CouponBookExportScope;
} | null> {
  await purgeExpiredSessions();
  const row = await db.query.couponBookPrintSessions.findFirst({
    where: eq(couponBookPrintSessions.id, sessionId),
  });
  if (!row || row.expiresAt <= new Date()) {
    if (row) {
      await db
        .delete(couponBookPrintSessions)
        .where(eq(couponBookPrintSessions.id, sessionId));
    }
    return null;
  }

  const payload = row.payload;
  if (payload == null || typeof payload !== "object" || !("draft" in payload)) {
    await db
      .delete(couponBookPrintSessions)
      .where(eq(couponBookPrintSessions.id, sessionId));
    return null;
  }

  const typedPayload = payload as CouponBookPrintSessionPayload;
  if (!isCouponBookDraft(typedPayload.draft)) {
    await db
      .delete(couponBookPrintSessions)
      .where(eq(couponBookPrintSessions.id, sessionId));
    return null;
  }

  return {
    draft: typedPayload.draft,
    exportScope: typedPayload.exportScope,
  };
}

export async function deleteCouponBookPrintSession(
  sessionId: string,
): Promise<void> {
  await db
    .delete(couponBookPrintSessions)
    .where(eq(couponBookPrintSessions.id, sessionId));
}
