// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
// Each awaited query in the vote transaction takes the next queued result.
const dbState = vi.hoisted(() => ({
  results: [] as unknown[],
  inserted: [] as unknown[],
  conditions: [] as unknown[],
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
  // resolves to the next queued result. `values` records what is inserted and
  // `where` the conditions each query filters on.
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
        if (prop === "values") {
          return (row: unknown) => {
            dbState.inserted.push(row);
            return chain();
          };
        }
        if (prop === "where") {
          return (condition: unknown) => {
            dbState.conditions.push(condition);
            return chain();
          };
        }
        return chain();
      },
      apply() {
        return chain();
      },
    });
  const tx = chain();
  return {
    db: {
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
    },
  };
});

import { addFestivalActivityVote } from "@/app/lib/festival_activites/actions";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/** The SQL text of the `index`th query's `where`, to check what it filters on. */
function conditionText(index: number) {
  return new PgDialect().sqlToQuery(dbState.conditions[index] as SQL).sql;
}

const VOTER = { id: 7, role: "user", status: "verified" };
const HOUR = 60 * 60 * 1000;
const openVariant = {
  festivalId: 1,
  allowsVoting: true,
  votingStartDate: new Date(Date.now() - HOUR),
  votingEndDate: new Date(Date.now() + HOUR),
};

const participantVote = {
  activityVariantId: 3,
  votableType: "participant",
  participantId: 12,
} as const;
const standVote = {
  activityVariantId: 3,
  votableType: "stand",
  standId: 11,
} as const;

beforeEach(() => {
  profileMock.mockReset();
  profileMock.mockResolvedValue(VOTER);
  dbState.results = [];
  dbState.inserted = [];
  dbState.conditions = [];
});

describe("addFestivalActivityVote", () => {
  it("refuses an activity without voting", async () => {
    dbState.results = [[{ ...openVariant, allowsVoting: false }]];

    expect(await addFestivalActivityVote(participantVote)).toEqual({
      success: false,
      message: "Esta actividad no tiene votación",
    });
    expect(dbState.inserted).toEqual([]);
  });

  it.each([
    [
      "before it opens",
      {
        votingStartDate: new Date(Date.now() + HOUR),
        votingEndDate: new Date(Date.now() + 2 * HOUR),
      },
    ],
    [
      "after it closes",
      {
        votingStartDate: new Date(Date.now() - 2 * HOUR),
        votingEndDate: new Date(Date.now() - HOUR),
      },
    ],
    ["with no dates", { votingStartDate: null, votingEndDate: null }],
  ])("refuses a vote %s", async (_, window) => {
    dbState.results = [[{ ...openVariant, ...window }]];

    expect(await addFestivalActivityVote(participantVote)).toEqual({
      success: false,
      message: "La votación no está abierta",
    });
    expect(dbState.inserted).toEqual([]);
  });

  it("refuses a participant outside the variant", async () => {
    dbState.results = [[openVariant], []];

    expect(await addFestivalActivityVote(participantVote)).toEqual({
      success: false,
      message: "El participante no existe",
    });
    expect(dbState.inserted).toEqual([]);
  });

  it("refuses a vote for the voter's own entry", async () => {
    dbState.results = [[openVariant], [{ userId: VOTER.id }]];

    expect(await addFestivalActivityVote(participantVote)).toMatchObject({
      success: false,
    });
    expect(dbState.inserted).toEqual([]);
  });

  it("refuses a stand nobody in the variant holds", async () => {
    dbState.results = [[openVariant], [{ userId: 30 }], []];

    expect(await addFestivalActivityVote(standVote)).toEqual({
      success: false,
      message: "El stand no existe",
    });
    expect(dbState.inserted).toEqual([]);
  });

  it("refuses a vote for the voter's own stand", async () => {
    dbState.results = [[openVariant], [{ userId: VOTER.id }]];

    expect(await addFestivalActivityVote(standVote)).toEqual({
      success: false,
      message: "No podés votar por tu propio stand",
    });
    expect(dbState.inserted).toEqual([]);
  });

  it("refuses a second vote in the same variant", async () => {
    dbState.results = [[openVariant], [{ userId: 30 }], { id: 99 }];

    expect(await addFestivalActivityVote(participantVote)).toEqual({
      success: false,
      message: "Ya tenés un voto registrado. No podés votar de nuevo.",
    });
    expect(dbState.inserted).toEqual([]);
  });

  it("inserts only the chosen target, voted by the session's profile", async () => {
    dbState.results = [[openVariant], [{ userId: 30 }], undefined, undefined];

    const forged = {
      ...participantVote,
      voterId: 999,
      standId: 11,
      id: 5,
      createdAt: new Date(0),
    } as unknown as Parameters<typeof addFestivalActivityVote>[0];

    expect(await addFestivalActivityVote(forged)).toMatchObject({
      success: true,
    });
    expect(dbState.inserted).toEqual([
      {
        activityVariantId: 3,
        votableType: "participant",
        standId: null,
        participantId: 12,
        voterId: VOTER.id,
      },
    ]);
  });

  it("only counts a participant with an uploaded design", async () => {
    dbState.results = [[openVariant], []];

    expect(await addFestivalActivityVote(participantVote)).toEqual({
      success: false,
      message: "El participante no existe",
    });
    // The participant lookup (the second query) requires an uploaded image.
    expect(conditionText(1)).toMatch(
      /exists \(\s*select 1 from "festival_activity_participant_proofs"\s+where "festival_activity_participant_proofs"\."participation_id" = "festival_activity_participants"\."id"\s+and "festival_activity_participant_proofs"\."image_url" is not null/,
    );
    expect(dbState.inserted).toEqual([]);
  });

  it("only counts a stand whose enrolled holder uploaded a design", async () => {
    dbState.results = [[openVariant], [{ userId: 30 }], []];

    expect(await addFestivalActivityVote(standVote)).toEqual({
      success: false,
      message: "El stand no existe",
    });
    // The enrolled-holder lookup (the third query) requires an uploaded image.
    expect(conditionText(2)).toMatch(
      /"festival_activity_participant_proofs"\."image_url" is not null/,
    );
    expect(dbState.inserted).toEqual([]);
  });

  it("inserts a stand vote held by an enrolled participant", async () => {
    dbState.results = [
      [openVariant],
      [{ userId: 30 }],
      [{ id: 40 }],
      undefined,
      undefined,
    ];

    expect(await addFestivalActivityVote(standVote)).toMatchObject({
      success: true,
    });
    expect(dbState.inserted).toEqual([
      {
        activityVariantId: 3,
        votableType: "stand",
        standId: 11,
        participantId: null,
        voterId: VOTER.id,
      },
    ]);
  });
});
