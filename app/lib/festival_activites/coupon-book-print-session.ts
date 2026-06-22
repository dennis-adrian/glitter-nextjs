import "server-only";

import {
  CouponBookDraft,
  CouponBookExportScope,
  isCouponBookDraft,
} from "@/app/lib/festival_activites/coupon-book-draft";

const SESSION_TTL_MS = 5 * 60 * 1000;

type CouponBookPrintSession = {
  draft: CouponBookDraft;
  exportScope: CouponBookExportScope;
  expiresAt: number;
};

const globalForSessions = globalThis as unknown as {
  couponBookPrintSessions?: Map<string, CouponBookPrintSession>;
};

function getSessionStore(): Map<string, CouponBookPrintSession> {
  if (!globalForSessions.couponBookPrintSessions) {
    globalForSessions.couponBookPrintSessions = new Map();
  }
  return globalForSessions.couponBookPrintSessions;
}

function purgeExpiredSessions(store: Map<string, CouponBookPrintSession>) {
  const now = Date.now();
  for (const [sessionId, session] of store.entries()) {
    if (session.expiresAt <= now) {
      store.delete(sessionId);
    }
  }
}

export function createCouponBookPrintSession(input: {
  draft: CouponBookDraft;
  exportScope: CouponBookExportScope;
}): string {
  const store = getSessionStore();
  purgeExpiredSessions(store);
  const sessionId = crypto.randomUUID();
  store.set(sessionId, {
    draft: input.draft,
    exportScope: input.exportScope,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return sessionId;
}

export function getCouponBookPrintSession(
  sessionId: string,
): { draft: CouponBookDraft; exportScope: CouponBookExportScope } | null {
  const store = getSessionStore();
  purgeExpiredSessions(store);
  const session = store.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    store.delete(sessionId);
    return null;
  }
  if (!isCouponBookDraft(session.draft)) {
    store.delete(sessionId);
    return null;
  }
  return {
    draft: session.draft,
    exportScope: session.exportScope,
  };
}

export function deleteCouponBookPrintSession(sessionId: string): void {
  getSessionStore().delete(sessionId);
}
