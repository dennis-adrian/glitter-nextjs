import "server-only";

import { desc, eq } from "drizzle-orm";

import type { BaseProfile } from "@/app/api/users/definitions";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { userStatusEvents } from "@/db/schema";

export const STATUS_HISTORY_PAGE_SIZE = 20;
/** Far past any real history; keeps the offset a safe integer. */
const MAX_PAGE = 10_000;

export type StatusHistoryEvent = {
  id: number;
  fromStatus: BaseProfile["status"];
  toStatus: BaseProfile["status"];
  reason: string | null;
  createdAt: Date;
  createdByUserId: number | null;
  createdBy: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

export type StatusHistoryPage = {
  events: StatusHistoryEvent[];
  page: number;
  hasMore: boolean;
};

/**
 * One page of a user's status changes, newest first, for admins only: the
 * reasons are the team's own notes. Null for anyone else. Changes before
 * 2026-08-21 were never recorded, so older users may have none.
 */
export async function fetchUserStatusHistory(
  userId: number,
  page = 1,
): Promise<StatusHistoryPage | null> {
  if (!(await requireAdmin())) return null;

  const safePage =
    Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1;
  const rows = await db.query.userStatusEvents.findMany({
    where: eq(userStatusEvents.userId, userId),
    orderBy: [desc(userStatusEvents.createdAt), desc(userStatusEvents.id)],
    limit: STATUS_HISTORY_PAGE_SIZE + 1,
    offset: (safePage - 1) * STATUS_HISTORY_PAGE_SIZE,
    columns: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      createdByUserId: true,
    },
    with: {
      createdBy: {
        columns: {
          displayName: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return {
    events: rows.slice(0, STATUS_HISTORY_PAGE_SIZE),
    page: safePage,
    hasMore: rows.length > STATUS_HISTORY_PAGE_SIZE,
  };
}
