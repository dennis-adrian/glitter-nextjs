import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      standReservations: { findFirst: findFirstMock, findMany: findManyMock },
    },
    select: vi.fn(),
  },
}));

import {
  fetchFestivalReservationStandRefs,
  fetchReservationForAdmin,
} from "@/app/lib/reservations/queries";

describe("reservation admin reads", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    findFirstMock.mockReset();
    findManyMock.mockReset();
  });

  it("returns null for unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(fetchReservationForAdmin(3)).resolves.toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("returns null for unrelated participants", async () => {
    currentProfileMock.mockResolvedValue({ id: 9, role: "user" });
    await expect(fetchReservationForAdmin(3)).resolves.toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });
});

describe("fetchFestivalReservationStandRefs", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    findManyMock.mockReset();
  });

  it("returns an empty list for unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(fetchFestivalReservationStandRefs(10)).resolves.toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("loads only accepted reservations for the festival", async () => {
    currentProfileMock.mockResolvedValue({ id: 4, role: "user" });
    findManyMock.mockResolvedValue([
      {
        id: 21,
        stand: { id: 8, label: "A", standNumber: 2 },
        participants: [{ userId: 4 }],
      },
    ]);

    await expect(fetchFestivalReservationStandRefs(10)).resolves.toEqual([
      {
        id: 21,
        stand: { id: 8, label: "A", standNumber: 2 },
        participants: [{ userId: 4 }],
      },
    ]);

    expect(findManyMock).toHaveBeenCalledOnce();
    const where = findManyMock.mock.calls[0]?.[0]?.where as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain('"stand_reservations"."festival_id"');
    expect(query.sql).toContain('"stand_reservations"."status"');
    expect(query.params).toEqual([10, "accepted"]);
  });
});
