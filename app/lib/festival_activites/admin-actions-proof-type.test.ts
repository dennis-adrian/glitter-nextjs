// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
// Each awaited query takes the next queued result; `values` and `set` record
// writes, so a rejected input can be shown to leave the database untouched.
const dbState = vi.hoisted(() => ({
  results: [] as unknown[],
  writes: [] as unknown[],
  transactions: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/lib/festivals/actions", () => ({ fetchBaseFestival: vi.fn() }));
vi.mock("@/app/lib/users/queries", () => ({ fetchAdminUsers: vi.fn() }));
vi.mock("@/app/lib/uploadthing/storage", () => ({
  attemptStorageCleanupJob: vi.fn(),
  enqueueStorageCleanupJob: vi.fn(),
}));
vi.mock("@/app/lib/festival_activites/queries", () => ({
  wasRemovedFromActivity: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
}));
vi.mock("@/db", () => {
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

import {
  createFestivalActivity,
  updateFestivalActivity,
  type FestivalActivityInput,
} from "@/app/lib/festival_activites/admin-actions";

const ADMIN = { id: 1, role: "admin", status: "verified" };
const DEADLINE = new Date("2026-09-25T22:00:00Z");

function input(
  overrides: Partial<FestivalActivityInput> = {},
): FestivalActivityInput {
  return {
    name: "Carrera de sellos",
    type: "stamp_passport",
    accessLevel: "public",
    registrationStartDate: new Date("2026-09-22T13:00:00Z"),
    registrationEndDate: new Date("2026-09-24T21:00:00Z"),
    proofType: null,
    allowsVoting: false,
    details: [{ description: "General" }],
    ...overrides,
  };
}

// The two actions share the rule, so each case runs against both. `queries`
// are what an accepted save awaits, in order.
const actions = [
  {
    name: "createFestivalActivity",
    save: (data: FestivalActivityInput) => createFestivalActivity(490, data),
    // insert activity…returning, insert details
    queries: () => [[{ id: 16 }], undefined],
  },
  {
    name: "updateFestivalActivity",
    save: (data: FestivalActivityInput) =>
      updateFestivalActivity(16, 490, data),
    // update activity, select existing details, insert the new detail
    queries: () => [undefined, [], undefined],
  },
];

beforeEach(() => {
  profileMock.mockReset();
  profileMock.mockResolvedValue(ADMIN);
  dbState.results = [];
  dbState.writes = [];
  dbState.transactions = 0;
});

describe.each(actions)("$name proof type rule", ({ save, queries }) => {
  it.each([
    "stamp_passport",
    "sticker_hunt",
    "festival_sticker",
    "coupon_book",
  ] as const)(
    "rejects %s without material before touching the database",
    async (type) => {
      const result = await save(input({ type, proofType: null }));
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/^Elegí «.+»: el mapa solo marca/);
      expect(dbState.transactions).toBe(0);
      expect(dbState.writes).toEqual([]);
    },
  );

  it.each([
    ["stamp_passport", "text"],
    ["stamp_passport", "both"],
    ["sticker_hunt", "text"],
    ["festival_sticker", "both"],
    ["coupon_book", "image"],
  ] as const)(
    "rejects %s with %s material it cannot collect",
    async (type, proofType) => {
      const result = await save(
        input({ type, proofType, proofUploadLimitDate: DEADLINE }),
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/^Este tipo de actividad necesita/);
      expect(dbState.transactions).toBe(0);
    },
  );

  it("still requires a deadline for the right material", async () => {
    const result = await save(input({ proofType: "image" }));
    expect(result).toEqual({
      success: false,
      message:
        "Si la actividad exige prueba, debes indicar la fecha límite para cargar la prueba.",
    });
    expect(dbState.transactions).toBe(0);
  });

  it.each([
    ["stamp_passport", "image"],
    ["sticker_hunt", "image"],
    ["festival_sticker", "image"],
    ["coupon_book", "text"],
    ["coupon_book", "both"],
    ["best_stand", null],
    ["sticker_print", null],
  ] as const)("saves %s with %s material", async (type, proofType) => {
    dbState.results = queries();
    const result = await save(
      input({
        type,
        proofType,
        proofUploadLimitDate: proofType ? DEADLINE : undefined,
      }),
    );
    expect(result.success).toBe(true);
    expect(dbState.transactions).toBe(1);
    expect(dbState.writes[0]).toMatchObject({ type, proofType });
  });
});
