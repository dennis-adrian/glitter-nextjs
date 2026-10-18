// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
// Each awaited query takes the next queued result.
const dbState = vi.hoisted(() => ({
  results: [] as unknown[],
  writes: [] as unknown[],
  transactions: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/emails/festival-activity-registration", () => ({
  default: vi.fn(),
}));
vi.mock("@/app/lib/festivals/actions", () => ({ fetchBaseFestival: vi.fn() }));
vi.mock("@/app/lib/users/queries", () => ({ fetchAdminUsers: vi.fn() }));
vi.mock("@/app/lib/uploadthing/storage", () => ({
  attemptStorageCleanupJob: vi.fn(),
  enqueueStorageCleanupJob: vi.fn(),
}));
vi.mock("@/app/lib/festival_activites/queries", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
  requireProfileOwnerOrAdmin: vi.fn(),
}));
vi.mock("@/db", () => {
  // A query builder stand-in: every call chains, and awaiting the chain
  // resolves to the next queued result. `values` and `set` record writes.
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get(_target, prop) {
        if (prop === "then") {
          const result = dbState.results.shift();
          return (
            resolve: (value: unknown) => unknown,
            reject: (reason: unknown) => unknown,
          ) => Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "values" || prop === "set") {
          return (row: unknown) => {
            dbState.writes.push(row);
            return chain();
          };
        }
        if (prop === "transaction") {
          return async (run: (tx: unknown) => Promise<unknown>) => {
            dbState.transactions += 1;
            return run(chain());
          };
        }
        return chain();
      },
      apply() {
        return chain();
      },
    });
  return { db: chain() };
});

import type { BaseProfile } from "@/app/api/users/definitions";
import {
  enrollFromWaitlistInvitation,
  joinActivityWaitlist,
} from "@/app/lib/festival_activites/actions";

const OWNER = {
  id: 7,
  role: "user",
  status: "verified",
  category: "illustration",
};
const forProfile = { id: OWNER.id } as BaseProfile;
const HOUR = 60 * 60 * 1000;

/** A waitlist-enabled activity whose only variant is full. */
function fullActivity(
  type: string,
  participants: { userId: number; removedAt: Date | null }[],
) {
  return {
    id: 4,
    type,
    waitlistWindowMinutes: 60,
    details: [
      {
        id: 3,
        category: null,
        participationLimit: participants.length,
        participants,
      },
    ],
  };
}

const activeInvitation = {
  id: 9,
  activityId: 4,
  userId: OWNER.id,
  notifiedAt: new Date(Date.now() - HOUR),
  expiresAt: new Date(Date.now() + HOUR),
  notifiedForDetailId: 3,
};

beforeEach(() => {
  profileMock.mockReset();
  profileMock.mockResolvedValue(OWNER);
  dbState.results = [];
  dbState.writes = [];
  dbState.transactions = 0;
});

describe("joinActivityWaitlist", () => {
  it("refuses a best stand activity", async () => {
    dbState.results = [
      fullActivity("best_stand", [{ userId: 30, removedAt: null }]),
    ];

    expect(await joinActivityWaitlist(forProfile, 4)).toEqual({
      success: false,
      message: "No tenés permisos para inscribirte en esta actividad",
    });
    expect(dbState.transactions).toBe(0);
  });

  it("refuses a participant staff removed", async () => {
    dbState.results = [
      fullActivity("sticker_print", [
        { userId: 30, removedAt: null },
        { userId: OWNER.id, removedAt: new Date() },
      ]),
    ];

    expect(await joinActivityWaitlist(forProfile, 4)).toEqual({
      success: false,
      message: "No podés volver a inscribirte después de haber sido removido",
    });
    expect(dbState.transactions).toBe(0);
  });
});

describe("enrollFromWaitlistInvitation", () => {
  it("refuses an invitation to a best stand variant", async () => {
    dbState.results = [
      [activeInvitation],
      [{ id: 3, participationLimit: 1, activityType: "best_stand" }],
    ];

    expect(await enrollFromWaitlistInvitation(OWNER.id, 9, 1)).toEqual({
      success: false,
      message: "No tenés permisos para inscribirte en esta actividad",
    });
    expect(dbState.transactions).toBe(0);
    expect(dbState.writes).toEqual([]);
  });

  it("does not restore a participant staff removed", async () => {
    dbState.results = [
      [activeInvitation],
      [{ id: 3, participationLimit: 1, activityType: "sticker_print" }],
      [{ id: 50, removedAt: new Date() }],
    ];

    expect(await enrollFromWaitlistInvitation(OWNER.id, 9, 1)).toEqual({
      success: false,
      message: "No podés volver a inscribirte después de haber sido removido",
    });
    expect(dbState.writes).toEqual([]);
  });
});
