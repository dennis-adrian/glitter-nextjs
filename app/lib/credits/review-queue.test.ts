import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: { select: selectMock, transaction: vi.fn() },
}));

vi.mock("@/app/lib/credits/service", () => ({
  readCreditBalances: vi.fn(),
}));

import { fetchCreditTopUpReviewQueue } from "@/app/lib/credits/queries";
import { creditHolds, creditLedgerEntries, creditTopUps } from "@/db/schema";

type Row = Record<string, unknown>;

/**
 * Minimal Drizzle stand-in: every builder method returns the same thenable, so
 * the query layer can chain freely and the test only decides which rows come
 * back per table.
 */
function installSelect(
  rowsByTable: Map<unknown, Row[]>,
  /** Overrides the count query result, so a page can be smaller than the scope. */
  totalOverride?: number,
) {
  selectMock.mockImplementation((fields?: Record<string, unknown>) => {
    const isCount = Boolean(fields && "total" in fields);
    const builder: Record<string, unknown> = {};
    let rows: Row[] = [];
    const chain = (name: string) => {
      builder[name] = (arg?: unknown) => {
        if (name === "from") {
          const tableRows = rowsByTable.get(arg) ?? [];
          rows = isCount
            ? [{ total: totalOverride ?? tableRows.length }]
            : tableRows;
        }
        return builder;
      };
    };
    for (const name of [
      "from",
      "innerJoin",
      "leftJoin",
      "where",
      "groupBy",
      "orderBy",
      "limit",
      "for",
    ]) {
      chain(name);
    }
    builder.then = (
      resolve: (value: Row[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return builder;
  });
}

describe("fetchCreditTopUpReviewQueue", () => {
  const submittedAt = new Date("2026-09-02T10:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns nothing for a participant", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    installSelect(new Map());

    expect(await fetchCreditTopUpReviewQueue("pending")).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns nothing when signed out", async () => {
    currentProfileMock.mockResolvedValue(null);
    installSelect(new Map());

    expect(await fetchCreditTopUpReviewQueue("pending")).toBeNull();
  });

  it("reads for a festival admin, who cannot act on the result", async () => {
    currentProfileMock.mockResolvedValue({ id: 3, role: "festival_admin" });
    installSelect(new Map([[creditTopUps, []]]));

    expect(await fetchCreditTopUpReviewQueue("pending")).toEqual({
      items: [],
      totalCount: 0,
      hasMore: false,
    });
  });

  it("projects the balance a rejection would leave behind", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    installSelect(
      new Map<unknown, Row[]>([
        [
          creditTopUps,
          [
            {
              id: 55,
              amount: 100,
              status: "under_review",
              voucherUrl: "https://utfs.io/f/voucher",
              submittedAt,
              reviewedAt: null,
              rejectionReason: null,
              intendedUseType: "feature",
              intendedUseId: null,
              uploadDeadlineAt: submittedAt,
              userId: 8,
              displayName: "Ada",
              firstName: null,
              lastName: null,
              email: "ada@example.com",
            },
          ],
        ],
        // Provisional credits already spent: 100 issued, 80 gone.
        [creditLedgerEntries, [{ userId: 8, amount: 20 }]],
        [creditHolds, []],
      ]),
    );

    const queue = await fetchCreditTopUpReviewQueue("pending");

    expect(queue!.items).toHaveLength(1);
    expect(queue!.items[0]).toMatchObject({
      id: 55,
      amount: 100,
      balanceAfterReversal: -80,
    });
    expect(queue).toMatchObject({ totalCount: 1, hasMore: false });
  });

  it("reports vouchers the page could not fit instead of hiding them", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    installSelect(
      new Map<unknown, Row[]>([
        [
          creditTopUps,
          [
            {
              id: 55,
              amount: 100,
              status: "under_review",
              voucherUrl: "https://utfs.io/f/voucher",
              submittedAt,
              reviewedAt: null,
              rejectionReason: null,
              intendedUseType: "feature",
              intendedUseId: null,
              uploadDeadlineAt: submittedAt,
              userId: 8,
              displayName: "Ada",
              firstName: null,
              lastName: null,
              email: "ada@example.com",
            },
          ],
        ],
        [creditLedgerEntries, [{ userId: 8, amount: 20 }]],
        [creditHolds, []],
      ]),
      64,
    );

    const queue = await fetchCreditTopUpReviewQueue("pending");

    expect(queue).toMatchObject({ totalCount: 64, hasMore: true });
    expect(queue!.items).toHaveLength(1);
  });
});
