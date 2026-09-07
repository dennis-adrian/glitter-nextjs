import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import {
  standHoldMembers,
  standReservationStands,
  stands,
} from "@/db/schema";
import {
  releaseStandIfVacant,
  standHasLiveOccupancy,
} from "@/app/lib/reservations/occupancy";

// Occupancy resolves through aggregate membership, so the stub keys off the
// member tables the query actually reads.
function occupancyTx(options: {
  liveHold?: boolean;
  liveReservation?: boolean;
  released?: boolean;
}) {
  const select = vi.fn(() => ({
    from: (table: unknown) => {
      const rows = async () => {
        if (table === standHoldMembers) {
          return options.liveHold ? [{ id: 11 }] : [];
        }
        if (table === standReservationStands) {
          return options.liveReservation ? [{ id: 22 }] : [];
        }
        return [];
      };
      const terminal = { where: () => ({ limit: rows }) };
      return { ...terminal, innerJoin: () => terminal };
    },
  }));
  const returning = vi.fn(async () =>
    options.released === false ? [] : [{ id: 7 }],
  );
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning })),
    })),
  }));
  return { select, update, returning };
}

describe("stand occupancy helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats a live hold as occupancy", async () => {
    const tx = occupancyTx({ liveHold: true });
    await expect(standHasLiveOccupancy(tx as never, 7)).resolves.toBe(true);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("treats a non-rejected reservation as occupancy", async () => {
    const tx = occupancyTx({ liveReservation: true });
    await expect(standHasLiveOccupancy(tx as never, 7)).resolves.toBe(true);
  });

  it("does not mark a vacant stand occupied", async () => {
    const tx = occupancyTx({});
    await expect(standHasLiveOccupancy(tx as never, 7)).resolves.toBe(false);
  });

  it("leaves an occupied stand unchanged", async () => {
    const tx = occupancyTx({ liveHold: true });
    await expect(releaseStandIfVacant(tx as never, 7)).resolves.toBe(false);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("sets held/reserved/confirmed stands available only when vacant", async () => {
    const tx = occupancyTx({ released: true });
    await expect(releaseStandIfVacant(tx as never, 7)).resolves.toBe(true);
    expect(tx.update).toHaveBeenCalled();
    expect(tx.returning).toHaveBeenCalled();
    expect(stands.status).toBeDefined();
  });
});
