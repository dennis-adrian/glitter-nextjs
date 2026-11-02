import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireAdminMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/db", () => ({
  db: { query: { userStatusEvents: { findMany: findManyMock } } },
}));

import {
  fetchUserStatusHistory,
  STATUS_HISTORY_PAGE_SIZE,
} from "@/app/lib/users/status-history";

const row = (id: number) => ({ id });

beforeEach(() => {
  requireAdminMock.mockReset();
  findManyMock.mockReset();
});

describe("fetchUserStatusHistory", () => {
  it("refuses anyone but an admin", async () => {
    requireAdminMock.mockResolvedValue(null);

    await expect(fetchUserStatusHistory(7)).resolves.toBeNull();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("reads one page past the limit to know whether there is more", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    findManyMock.mockResolvedValue(
      Array.from({ length: STATUS_HISTORY_PAGE_SIZE + 1 }, (_, i) => row(i)),
    );

    const result = await fetchUserStatusHistory(7, 2);

    expect(result?.events).toHaveLength(STATUS_HISTORY_PAGE_SIZE);
    expect(result?.hasMore).toBe(true);
    expect(result?.page).toBe(2);
    expect(findManyMock.mock.calls[0][0]).toMatchObject({
      limit: STATUS_HISTORY_PAGE_SIZE + 1,
      offset: STATUS_HISTORY_PAGE_SIZE,
    });
  });

  it("reads only that user's rows, newest first", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    findManyMock.mockResolvedValue([]);

    await fetchUserStatusHistory(7);

    const { where, orderBy } = findManyMock.mock.calls[0][0] as {
      where: SQL;
      orderBy: SQL[];
    };
    const dialect = new PgDialect();
    const whereSql = dialect.sqlToQuery(where);
    expect(whereSql.sql).toBe('"user_status_events"."user_id" = $1');
    expect(whereSql.params).toEqual([7]);
    expect(orderBy.map((part) => dialect.sqlToQuery(part).sql)).toEqual([
      '"user_status_events"."created_at" desc',
      '"user_status_events"."id" desc',
    ]);
  });

  it("caps a huge page so the offset stays a safe integer", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    findManyMock.mockResolvedValue([]);

    const result = await fetchUserStatusHistory(7, 1e20);

    expect(result?.page).toBe(10_000);
    expect(
      Number.isSafeInteger(findManyMock.mock.calls[0][0].offset),
    ).toBe(true);
  });

  it("treats a nonsense page as the first", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    findManyMock.mockResolvedValue([row(1)]);

    const result = await fetchUserStatusHistory(7, -3);

    expect(result).toMatchObject({ page: 1, hasMore: false });
    expect(findManyMock.mock.calls[0][0]).toMatchObject({ offset: 0 });
  });
});
