// @vitest-environment node

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  festivalCredentialRules,
  festivals,
  reservationParticipants,
  standReservations,
  standReservationStands,
  stands,
  users,
} from "@/db/schema";
import { ImpersonationReadOnlyError } from "@/db/write-guard";

/**
 * The credentials actions against a real database, with the signed-in staff
 * member and the feature flag simulated.
 */

const currentProfile = vi.hoisted(() => ({
  value: null as null | { id: number; role: "admin" | "festival_admin" },
}));
const flagOn = vi.hoisted(() => ({ value: true }));
const failNextTransaction = vi.hoisted(() => ({ value: false }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: vi.fn(async () => currentProfile.value),
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  featureFlagGuard: vi.fn(async () =>
    flagOn.value ? null : { success: false, message: "Esta funcionalidad no está disponible" },
  ),
}));

const dbHolder = vi.hoisted(() => ({ current: null as never }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "transaction" && failNextTransaction.value) {
          failNextTransaction.value = false;
          return async () => {
            throw new ImpersonationReadOnlyError();
          };
        }
        const value = (dbHolder.current as never as Record<string, unknown>)[prop as string];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(dbHolder.current)
          : value;
      },
    },
  ),
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(decodeURIComponent(new URL(url).pathname.slice(1)));
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error("TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.");
}

const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl, max: 8 }) : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/credentials/actions");
let actions: Actions;

const created = {
  users: [] as number[],
  festivals: [] as number[],
  externals: [] as number[],
  staff: [] as number[],
};

const DEFAULT_FORM = {
  illustration: { quantity: 2, namingMode: "one_per_participant" as const },
  entrepreneurship: { quantity: 2, namingMode: "one_per_participant" as const },
  gastronomy: { quantity: 2, namingMode: "all_named" as const },
  external: { quantity: 2 },
  volunteer: { quantity: 1 },
  staff: { quantity: 1 },
};

async function createFestival() {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Credenciales acciones ${randomUUID()}`, status: "published", festivalType: "glitter" })
    .returning({ id: festivals.id });
  created.festivals.push(festival!.id);
  return festival!.id;
}

async function createUser(displayName: string, role: "user" | "admin" | "festival_admin" = "user") {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `credentials-actions-${suffix}`,
      email: `credentials-actions-${suffix}@example.test`,
      displayName,
      role,
      status: "verified",
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

let standNumber = 1;

async function createReservation(
  festivalId: number,
  {
    userIds = [],
    standCount = 1,
    status = "accepted",
  }: { userIds?: number[]; standCount?: number; status?: "accepted" | "pending" | "cancelled" },
) {
  const db = integrationDb!;
  const standRows = await db
    .insert(stands)
    .values(
      Array.from({ length: standCount }, () => ({
        festivalId,
        label: "B",
        standNumber: standNumber++,
        standCategory: "illustration" as const,
        status: "reserved" as const,
      })),
    )
    .returning({ id: stands.id });
  const [reservation] = await db
    .insert(standReservations)
    .values({ standId: standRows[0]!.id, festivalId, status, ownerUserId: userIds[0] ?? null })
    .returning({ id: standReservations.id });
  await db.insert(standReservationStands).values(
    standRows.map((stand, position) => ({ reservationId: reservation!.id, standId: stand.id, position })),
  );
  const participations = userIds.length
    ? await db
        .insert(reservationParticipants)
        .values(userIds.map((userId) => ({ userId, reservationId: reservation!.id })))
        .returning({ id: reservationParticipants.id })
    : [];
  return {
    reservationId: reservation!.id,
    standIds: standRows.map((stand) => stand.id),
    participationIds: participations.map((row) => row.id),
  };
}

async function ruleRows(festivalId: number) {
  return integrationDb!
    .select({
      group: festivalCredentialRules.group,
      quantity: festivalCredentialRules.quantity,
      namingMode: festivalCredentialRules.namingMode,
    })
    .from(festivalCredentialRules)
    .where(eq(festivalCredentialRules.festivalId, festivalId));
}

describeDatabase("credentials actions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    dbHolder.current = integrationDb as never;
    actions = await import("@/app/lib/credentials/actions");
  });

  beforeEach(async () => {
    flagOn.value = true;
    failNextTransaction.value = false;
    currentProfile.value = { id: await createUser("Staff", "festival_admin"), role: "festival_admin" };
  });

  afterAll(async () => {
    const db = integrationDb!;
    if (created.festivals.length) {
      await db.delete(standReservations).where(inArray(standReservations.festivalId, created.festivals));
      await db.delete(stands).where(inArray(stands.festivalId, created.festivals));
      await db.delete(festivals).where(inArray(festivals.id, created.festivals));
    }
    if (created.externals.length) {
      await db.delete(schema.externalParticipants).where(inArray(schema.externalParticipants.id, created.externals));
    }
    if (created.staff.length) {
      await db.delete(schema.staffMembers).where(inArray(schema.staffMembers.id, created.staff));
    }
    if (created.users.length) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
    await pool?.end();
  });

  describe("gates", () => {
    it("refuses callers who are not staff, and every call while the flag is off", async () => {
      const festivalId = await createFestival();
      currentProfile.value = null;
      expect(await actions.resetCredentialRules({ festivalId })).toEqual({
        success: false,
        message: "No tenés permiso para hacer esto.",
      });
      currentProfile.value = { id: 1, role: "admin" };
      flagOn.value = false;
      expect(
        await actions.saveCredentialRules({ festivalId, rules: DEFAULT_FORM }),
      ).toEqual({ success: false, message: "Esta funcionalidad no está disponible" });
    });

    it("surfaces the impersonation read-only refusal", async () => {
      const festivalId = await createFestival();
      failNextTransaction.value = true;
      const result = await actions.resetCredentialRules({ festivalId });
      expect(result.success).toBe(false);
      expect(result.message).toBe(new ImpersonationReadOnlyError().message);
    });

    it("refuses a festival that does not exist", async () => {
      expect(await actions.resetCredentialRules({ festivalId: 2_000_000_000 })).toEqual({
        success: false,
        message: "No encontramos ese festival. Actualizá la página.",
      });
    });
  });

  describe("rules", () => {
    it("upserts only what differs from the default and resets to none", async () => {
      const festivalId = await createFestival();
      expect(
        await actions.saveCredentialRules({
          festivalId,
          rules: {
            ...DEFAULT_FORM,
            gastronomy: { quantity: 3, namingMode: "all_named" },
            volunteer: { quantity: 2 },
          },
        }),
      ).toEqual({ success: true, message: "Reglas guardadas." });
      expect(
        (await ruleRows(festivalId)).sort((a, b) => a.group.localeCompare(b.group)),
      ).toEqual([
        { group: "gastronomy", quantity: 3, namingMode: "all_named" },
        { group: "volunteer", quantity: 2, namingMode: null },
      ]);

      // Back to the default for gastronomy: its row goes; a naming change alone stays.
      await actions.saveCredentialRules({
        festivalId,
        rules: {
          ...DEFAULT_FORM,
          illustration: { quantity: 2, namingMode: "all_named" },
          volunteer: { quantity: 2 },
        },
      });
      expect(
        (await ruleRows(festivalId)).sort((a, b) => a.group.localeCompare(b.group)),
      ).toEqual([
        { group: "illustration", quantity: 2, namingMode: "all_named" },
        { group: "volunteer", quantity: 2, namingMode: null },
      ]);

      expect((await actions.resetCredentialRules({ festivalId })).success).toBe(true);
      expect(await ruleRows(festivalId)).toEqual([]);
    });

    it("never touches another festival's rules", async () => {
      const mine = await createFestival();
      const other = await createFestival();
      await actions.saveCredentialRules({
        festivalId: other,
        rules: { ...DEFAULT_FORM, staff: { quantity: 3 } },
      });
      await actions.resetCredentialRules({ festivalId: mine });
      expect(
        await integrationDb!
          .select({ quantity: festivalCredentialRules.quantity })
          .from(festivalCredentialRules)
          .where(
            and(
              eq(festivalCredentialRules.festivalId, other),
              eq(festivalCredentialRules.group, "staff"),
            ),
          ),
      ).toEqual([{ quantity: 3 }]);
    });
  });
});

