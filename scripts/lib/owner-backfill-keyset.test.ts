import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  nextOwnerBackfillAfterId,
  ownerBackfillHasMore,
} from "@/scripts/lib/owner-backfill-keyset";

function paginate(
  rows: Array<{ reservationId: number }>,
  afterId: number,
  batchSize: number,
) {
  return rows
    .filter((row) => row.reservationId > afterId)
    .sort((a, b) => a.reservationId - b.reservationId)
    .slice(0, batchSize);
}

describe("owner backfill keyset", () => {
  it("walks past a full window of skip-only ownerless rows and terminates", () => {
    const ownerless = Array.from({ length: 5 }, (_, index) => ({
      reservationId: index + 1,
    }));
    const batchSize = 2;
    const maxSteps = ownerless.length + 2;
    let afterId = 0;
    let steps = 0;
    const examined: number[] = [];

    while (true) {
      steps += 1;
      expect(steps).toBeLessThanOrEqual(maxSteps);

      const rows = paginate(ownerless, afterId, batchSize);
      for (const row of rows) {
        examined.push(row.reservationId);
      }
      afterId = nextOwnerBackfillAfterId(afterId, rows);
      if (!ownerBackfillHasMore(rows.length, batchSize)) {
        break;
      }
    }

    expect(examined).toEqual([1, 2, 3, 4, 5]);
    expect(afterId).toBe(5);
    expect(steps).toBe(3);
  });

  it("leaves the cursor unchanged when a batch is empty", () => {
    expect(nextOwnerBackfillAfterId(12, [])).toBe(12);
    expect(ownerBackfillHasMore(0, 200)).toBe(false);
  });
});

describe("backfill-reservation-hardening owner query wiring", () => {
  it("applies the keyset to every examined ownerless row", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/backfill-reservation-hardening.ts"),
      "utf8",
    );
    const ownerFn = source.slice(
      source.indexOf("async function backfillOwners"),
      source.indexOf("async function backfillPriceSnapshots"),
    );

    expect(ownerFn).toContain("gt(standReservations.id, ownerAfterId)");
    expect(ownerFn).toContain("orderBy(asc(standReservations.id))");
    expect(ownerFn).toContain(
      "ownerAfterId = nextOwnerBackfillAfterId(ownerAfterId, rows)",
    );
    expect(ownerFn).toContain(
      "return ownerBackfillHasMore(rows.length, batchSize)",
    );
  });
});
