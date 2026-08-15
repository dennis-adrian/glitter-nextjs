import { beforeEach, describe, expect, it, vi } from "vitest";

const purchaseGuardMock = vi.hoisted(() => vi.fn());
const settingsGuardMock = vi.hoisted(() => vi.fn());
const ticketGuardMock = vi.hoisted(() => vi.fn());
const purchaseFindFirstMock = vi.hoisted(() => vi.fn());
const purchaseFindManyMock = vi.hoisted(() => vi.fn());
const ticketFindFirstMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/fast-pass/admin-auth", () => ({
  requireFastPassFestivalAdmin: vi.fn(),
  requireFastPassPurchaseAdmin: purchaseGuardMock,
  requireFastPassSettingsAdmin: settingsGuardMock,
  requireFastPassTicketAdmin: ticketGuardMock,
}));
vi.mock("@/db", () => ({
  db: {
    query: {
      fastPassPurchases: {
        findFirst: purchaseFindFirstMock,
        findMany: purchaseFindManyMock,
      },
      fastPassTickets: { findFirst: ticketFindFirstMock },
    },
  },
}));

import {
  fetchPurchaseForAdmin,
  fetchPurchasesAwaitingReview,
  fetchTicketByCode,
} from "@/app/lib/fast-pass/purchase-queries";

describe("FastPass admin query authorization", () => {
  beforeEach(() => {
    purchaseGuardMock.mockReset();
    settingsGuardMock.mockReset();
    ticketGuardMock.mockReset();
    purchaseFindFirstMock.mockReset();
    purchaseFindManyMock.mockReset();
    ticketFindFirstMock.mockReset();
  });

  it("preserves denial results without querying protected records", async () => {
    purchaseGuardMock.mockResolvedValue(null);
    settingsGuardMock.mockResolvedValue(null);
    ticketGuardMock.mockResolvedValue(null);

    await expect(fetchPurchaseForAdmin(101)).resolves.toBeUndefined();
    await expect(fetchPurchasesAwaitingReview(202)).resolves.toEqual([]);
    await expect(fetchTicketByCode("CODE-303")).resolves.toBeUndefined();

    expect(purchaseFindFirstMock).not.toHaveBeenCalled();
    expect(purchaseFindManyMock).not.toHaveBeenCalled();
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });
});
