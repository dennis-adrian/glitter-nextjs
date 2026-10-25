// @vitest-environment node

import { randomUUID } from "crypto";
import { inArray, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ComunicadoAudience } from "@/app/lib/comunicados/definitions";
import * as schema from "@/db/schema";
import {
  comunicados,
  distributionListMembers,
  distributionLists,
  emailSuppressions,
  emailUnsubscribes,
  festivalDates,
  festivals,
  pendingUserDeletions,
  pushSubscriptions,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Who a comunicado would reach, against a real database
 * (docs/IMPLEMENTATION-comunicados.md B2, B4–B7, G3, G4). Every assertion is
 * about this file's own fixtures, never a total over the shared database:
 * where staging admins bring in every admin there is, only relations between
 * the numbers are pinned.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Viewer = { id: number; role: "admin" | "festival_admin" | "user" };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  vercelEnv: "production",
  maxRecipients: 3_000,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => state.viewer,
  requireAdmin: async () =>
    state.viewer?.role === "admin" ? state.viewer : null,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: async (key: string) => key === "comunicados",
  isFeatureLaunched: async () => false,
  featureFlagGuard: async (key: string) =>
    key === "comunicados"
      ? null
      : { success: false, message: "Esta funcionalidad no está disponible" },
}));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    serverEnv: new Proxy(actual.serverEnv, {
      get: (target, key) =>
        key === "VERCEL_ENV" ? state.vercelEnv : Reflect.get(target, key),
    }),
  };
});
// The cap is 3,000; a lowered one lets a few fixtures cross it.
vi.mock("@/app/lib/comunicados/definitions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/comunicados/definitions")>();
  return {
    ...actual,
    get COMUNICADO_MAX_RECIPIENTS() {
      return state.maxRecipients;
    },
  };
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Audience = typeof import("@/app/lib/comunicados/audience");
type Queries = typeof import("@/app/lib/comunicados/queries");
type Resolve = typeof import("@/app/lib/distribution_lists/resolve");
type EligibilityQueries =
  typeof import("@/app/lib/participants/recipient-eligibility-queries");
type AppDb = (typeof import("@/db"))["db"];
let audienceModule: Audience;
let queries: Queries;
let resolve: Resolve;
let eligibility: EligibilityQueries;
let appDb: AppDb;

const STAGING = "Entorno de prueba: no se envía a listas";
const MISSING_ID = 2_147_483_000;
const DAY = 24 * 3600_000;

const created = {
  users: [] as number[],
  festivals: [] as number[],
  stands: [] as number[],
  reservations: [] as number[],
  lists: [] as number[],
  deletions: [] as number[],
  unsubscribes: [] as number[],
  suppressions: [] as number[],
  comunicados: [] as number[],
};

type UserFixture = Partial<typeof users.$inferInsert> & { name?: string };

async function createUser(fixture: UserFixture = {}) {
  const suffix = randomUUID();
  const { name, ...values } = fixture;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `audience-${suffix}`,
      email: `audience-${suffix}@example.com`,
      displayName: name ?? `Audiencia ${suffix.slice(0, 8)}`,
      role: "user",
      status: "verified",
      ...values,
    })
    .returning({ id: users.id, email: users.email });
  created.users.push(user!.id);
  return user!.id;
}

async function emailOf(userId: number) {
  const [row] = await integrationDb!
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.id, [userId]));
  return row!.email;
}

async function createFestival(
  values: Partial<typeof festivals.$inferInsert> = {},
  dates: { start: Date; end: Date }[] = [],
) {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Audiencia ${randomUUID()}`, status: "active", ...values })
    .returning({ id: festivals.id, name: festivals.name });
  created.festivals.push(festival!.id);
  if (dates.length > 0) {
    await integrationDb!.insert(festivalDates).values(
      dates.map((date) => ({
        festivalId: festival!.id,
        startDate: date.start,
        endDate: date.end,
      })),
    );
  }
  return festival!;
}

let standNumber = 8100;

async function reserve(
  festivalId: number,
  { owner, partners = [] }: { owner: number; partners?: number[] },
) {
  const [stand] = await integrationDb!
    .insert(stands)
    .values({ standNumber: standNumber++, festivalId })
    .returning({ id: stands.id });
  created.stands.push(stand!.id);
  const [reservation] = await integrationDb!
    .insert(standReservations)
    .values({
      standId: stand!.id,
      festivalId,
      status: "accepted",
      ownerUserId: owner,
    })
    .returning({ id: standReservations.id });
  created.reservations.push(reservation!.id);
  await integrationDb!.insert(reservationParticipants).values(
    [owner, ...partners].map((userId) => ({
      userId,
      reservationId: reservation!.id,
    })),
  );
}

/** A festival whose Confirmados list is exactly `holders`, one reservation each. */
async function festivalWith(
  holders: number[],
  values: Partial<typeof festivals.$inferInsert> = {},
) {
  const festival = await createFestival(values, [
    {
      start: new Date(Date.now() + 10 * DAY),
      end: new Date(Date.now() + 11 * DAY),
    },
  ]);
  for (const owner of holders) await reserve(festival.id, { owner });
  return festival;
}

async function createFixedList(
  memberIds: number[],
  values: Partial<typeof distributionLists.$inferInsert> = {},
) {
  const [list] = await integrationDb!
    .insert(distributionLists)
    .values({ name: `Audiencia ${randomUUID()}`, kind: "fixed", ...values })
    .returning();
  created.lists.push(list!.id);
  if (memberIds.length > 0) {
    await integrationDb!
      .insert(distributionListMembers)
      .values(memberIds.map((userId) => ({ listId: list!.id, userId })));
  }
  return list!;
}

async function markDeleting(userId: number) {
  const [row] = await integrationDb!
    .insert(pendingUserDeletions)
    .values({ userId, clerkId: `audience-del-${randomUUID()}` })
    .returning({ id: pendingUserDeletions.id });
  created.deletions.push(row!.id);
}

async function unsubscribe(userId: number, topic: "announcements" | "all") {
  const [row] = await integrationDb!
    .insert(emailUnsubscribes)
    .values({ emailKey: (await emailOf(userId)).trim().toLowerCase(), topic })
    .returning({ id: emailUnsubscribes.id });
  created.unsubscribes.push(row!.id);
}

async function suppress(
  userId: number,
  reason: "bounce" | "complaint",
  liftedAt: Date | null = null,
) {
  const [row] = await integrationDb!
    .insert(emailSuppressions)
    .values({
      emailKey: (await emailOf(userId)).trim().toLowerCase(),
      reason,
      liftedAt,
    })
    .returning({ id: emailSuppressions.id });
  created.suppressions.push(row!.id);
}

async function addDevice(userId: number) {
  await integrationDb!.insert(pushSubscriptions).values({
    userId,
    endpoint: `https://push.example.test/${randomUUID()}`,
    p256dh: "p256dh",
    auth: "auth",
    applicationServerKey: "integration-test-key",
  });
}

function audience(value: Partial<ComunicadoAudience>): ComunicadoAudience {
  return { festivals: [], lists: [], people: [], ...value };
}

async function signInAsAdmin() {
  state.viewer = { id: await createUser({ role: "admin" }), role: "admin" };
  return state.viewer;
}

type SnapshotRow = { user_id: number; source: string; reason: string | null };

/** The rows the send would snapshot, for these ids only. */
async function snapshotOf(
  input: Parameters<Audience["comunicadoAudienceRowsSql"]>[0],
  ids: number[],
) {
  const result = await appDb.execute<SnapshotRow>(
    sql`SELECT r.user_id, r.source, r.reason
        FROM (${audienceModule.comunicadoAudienceRowsSql(input)}) AS r
        WHERE r.user_id = ANY(${sql.param(ids)}::int[])`,
  );
  return new Map(
    result.rows.map((row) => [
      Number(row.user_id),
      { source: row.source, reason: row.reason },
    ]),
  );
}

/** What writing would leave behind for this file's people. */
async function writtenFor(userIds: number[]) {
  const ids = sql`${sql.param(userIds)}::int[]`;
  const result = await integrationDb!.execute<{
    notifications: number;
    deliveries: number;
    recipients: number;
    comunicados: number;
    max_comunicado: number | null;
    max_campaign: number | null;
  }>(sql`SELECT
      (SELECT count(*) FROM notifications WHERE user_id = ANY(${ids}))::int AS notifications,
      (SELECT count(*) FROM notification_deliveries WHERE user_id = ANY(${ids}))::int AS deliveries,
      (SELECT count(*) FROM notification_campaign_recipients WHERE user_id = ANY(${ids}))::int AS recipients,
      (SELECT count(*) FROM comunicados
       WHERE created_by_user_id = ANY(${ids}) OR updated_by_user_id = ANY(${ids}))::int AS comunicados,
      (SELECT max(id) FROM comunicados) AS max_comunicado,
      (SELECT max(id) FROM notification_campaigns) AS max_campaign`);
  return result.rows[0]!;
}

describeDatabase("comunicado audience", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    audienceModule = await import("@/app/lib/comunicados/audience");
    queries = await import("@/app/lib/comunicados/queries");
    resolve = await import("@/app/lib/distribution_lists/resolve");
    eligibility =
      await import("@/app/lib/participants/recipient-eligibility-queries");
    appDb = (await import("@/db")).db;

    try {
      await integrationDb!
        .select({ id: comunicados.id })
        .from(comunicados)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  afterEach(() => {
    state.viewer = null;
    state.vercelEnv = "production";
    state.maxRecipients = 3_000;
  });

  afterAll(async () => {
    const db = integrationDb;
    if (db) {
      if (created.comunicados.length > 0) {
        await db
          .delete(comunicados)
          .where(inArray(comunicados.id, created.comunicados));
      }
      if (created.lists.length > 0) {
        await db
          .delete(distributionLists)
          .where(inArray(distributionLists.id, created.lists));
      }
      if (created.deletions.length > 0) {
        await db
          .delete(pendingUserDeletions)
          .where(inArray(pendingUserDeletions.id, created.deletions));
      }
      if (created.unsubscribes.length > 0) {
        await db
          .delete(emailUnsubscribes)
          .where(inArray(emailUnsubscribes.id, created.unsubscribes));
      }
      if (created.suppressions.length > 0) {
        await db
          .delete(emailSuppressions)
          .where(inArray(emailSuppressions.id, created.suppressions));
      }
      if (created.reservations.length > 0) {
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, created.reservations));
      }
      if (created.stands.length > 0) {
        await db.delete(stands).where(inArray(stands.id, created.stands));
      }
      if (created.users.length > 0) {
        await db.delete(users).where(inArray(users.id, created.users));
      }
      if (created.festivals.length > 0) {
        await db
          .delete(festivals)
          .where(inArray(festivals.id, created.festivals));
      }
    }
    await pool?.end();
  });

  /**
   * One festival, one fixed list and some people picked by name, covering
   * each row of B5. `ok` is on all three sources and `paused` on two.
   */
  async function b5Fixture() {
    const people = {
      ok: await createUser({ name: "Ana Puede" }),
      paused: await createUser({ status: "paused" }),
      banned: await createUser({ status: "banned" }),
      pending: await createUser({ status: "pending" }),
      adminOwner: await createUser({ role: "admin" }),
      deleting: await createUser(),
      listOnly: await createUser(),
      adminPicked: await createUser({ role: "admin" }),
      bannedAdminPicked: await createUser({ role: "admin", status: "banned" }),
      deletingAdminPicked: await createUser({ role: "admin" }),
      festivalAdminPicked: await createUser({ role: "festival_admin" }),
      adminBystander: await createUser({ role: "admin" }),
      bannedAdminBystander: await createUser({
        role: "admin",
        status: "banned",
      }),
      deletingAdminBystander: await createUser({ role: "admin" }),
    };
    await markDeleting(people.deleting);
    await markDeleting(people.deletingAdminPicked);
    await markDeleting(people.deletingAdminBystander);

    const festival = await createFestival();
    await reserve(festival.id, { owner: people.ok, partners: [people.paused] });
    await reserve(festival.id, {
      owner: people.banned,
      partners: [people.pending],
    });
    await reserve(festival.id, {
      owner: people.adminOwner,
      partners: [people.deleting],
    });
    const list = await createFixedList([
      people.ok,
      people.listOnly,
      people.paused,
    ]);
    const picked = [
      people.ok,
      people.adminPicked,
      people.bannedAdminPicked,
      people.deletingAdminPicked,
      people.festivalAdminPicked,
      MISSING_ID,
    ];
    const resolvable = {
      festivals: [festival.id],
      lists: [{ id: list.id, name: list.name, kind: list.kind, filter: null }],
      people: picked,
      hasListSource: true,
    };
    return { people, festival, list, picked, resolvable };
  }

  describe("comunicadoSkipReasonSql and the snapshot rows (B4, B5)", () => {
    it("judges each row in order and lets a pick by name beat a list", async () => {
      const { people, resolvable } = await b5Fixture();
      const rows = await snapshotOf({ ...resolvable, narrow: false }, [
        ...Object.values(people),
        MISSING_ID,
      ]);

      expect(rows.get(people.ok)).toEqual({ source: "person", reason: null });
      expect(rows.get(people.paused)).toEqual({ source: "list", reason: null });
      expect(rows.get(people.listOnly)).toEqual({
        source: "list",
        reason: null,
      });
      expect(rows.get(people.banned)?.reason).toBe("Cuenta suspendida");
      expect(rows.get(people.pending)?.reason).toBe("Perfil no verificado");
      // A global admin on a list is not a participant.
      expect(rows.get(people.adminOwner)).toEqual({
        source: "list",
        reason: "No es participante",
      });
      expect(rows.get(people.deleting)?.reason).toBe("Cuenta en eliminación");
      // Picked by name: an admin receives it, unless banned or being deleted
      // (row 1 comes before row 2).
      expect(rows.get(people.adminPicked)).toEqual({
        source: "person",
        reason: null,
      });
      expect(rows.get(people.bannedAdminPicked)?.reason).toBe(
        "No es participante",
      );
      expect(rows.get(people.deletingAdminPicked)?.reason).toBe(
        "Cuenta en eliminación",
      );
      expect(rows.get(people.festivalAdminPicked)?.reason).toBe(
        "No es participante",
      );
      // Not narrowed: no admin comes in for the lists, and an id that is no
      // longer a user drops out.
      expect(rows.has(people.adminBystander)).toBe(false);
      expect(rows.has(MISSING_ID)).toBe(false);
    });

    it("on a preview, skips eligible list members and brings in every admin instead", async () => {
      const { people, resolvable } = await b5Fixture();
      const rows = await snapshotOf(
        { ...resolvable, narrow: true },
        Object.values(people),
      );

      expect(rows.get(people.paused)).toEqual({
        source: "list",
        reason: STAGING,
      });
      expect(rows.get(people.listOnly)?.reason).toBe(STAGING);
      // Real ineligibility is judged before the narrowing.
      expect(rows.get(people.banned)?.reason).toBe("Cuenta suspendida");
      expect(rows.get(people.pending)?.reason).toBe("Perfil no verificado");
      expect(rows.get(people.deleting)?.reason).toBe("Cuenta en eliminación");
      // People picked by name are processed normally.
      expect(rows.get(people.ok)).toEqual({ source: "person", reason: null });
      expect(rows.get(people.adminPicked)).toEqual({
        source: "person",
        reason: null,
      });
      expect(rows.get(people.deletingAdminPicked)?.reason).toBe(
        "Cuenta en eliminación",
      );
      // An admin who was on the list now stands in for it.
      expect(rows.get(people.adminOwner)).toEqual({
        source: "staging_admin",
        reason: null,
      });
      expect(rows.get(people.adminBystander)).toEqual({
        source: "staging_admin",
        reason: null,
      });
      expect(rows.get(people.bannedAdminBystander)).toEqual({
        source: "staging_admin",
        reason: "No es participante",
      });
      expect(rows.get(people.deletingAdminBystander)).toEqual({
        source: "staging_admin",
        reason: "Cuenta en eliminación",
      });
    });

    it("brings in no admin when the audience is only people picked by name", async () => {
      const { people } = await b5Fixture();
      const input = {
        festivals: [],
        lists: [],
        people: [people.ok, people.adminPicked],
        narrow: true,
        hasListSource: false,
      };
      const rows = await snapshotOf(input, Object.values(people));
      expect([...rows.keys()].sort((a, b) => a - b)).toEqual(
        [people.ok, people.adminPicked].sort((a, b) => a - b),
      );
      expect(rows.get(people.ok)).toEqual({ source: "person", reason: null });

      const sources = await appDb.execute<{ user_id: number; via: string }>(
        sql`SELECT s.user_id, s.via FROM (${audienceModule.comunicadoAudienceSourcesSql(input)}) AS s
            WHERE s.via = 'staging_admin' AND s.user_id = ${people.adminBystander}`,
      );
      expect(sources.rows).toEqual([]);
    });

    it("skips a staging admin who is no longer one, and a missing source when narrowed", async () => {
      const participant = await createUser();
      const judge = (source: SQL, narrow: boolean) =>
        appDb.execute<{ reason: string | null }>(
          sql`SELECT ${eligibility.comunicadoSkipReasonSql(
            { id: users.id, role: users.role, status: users.status },
            source,
            narrow,
          )} AS reason FROM ${users} WHERE ${users.id} = ${participant}`,
        );
      // Row 3: added as an admin, a participant now.
      expect((await judge(sql`'staging_admin'`, true)).rows[0]?.reason).toBe(
        "No es participante",
      );
      // Row 7 is an allowlist: a NULL source never passes on a preview.
      expect((await judge(sql`NULL::text`, true)).rows[0]?.reason).toBe(
        STAGING,
      );
      expect((await judge(sql`'list'`, false)).rows[0]?.reason).toBeNull();
      expect((await judge(sql`'person'`, true)).rows[0]?.reason).toBeNull();
    });
  });

  describe("previewComunicadoAudience", () => {
    it("is for global admins only", async () => {
      const participant = await createUser();
      const spec = audience({ people: [participant] });
      const opts = { narrow: false, essential: false, sendEmail: true };
      expect(
        await audienceModule.previewComunicadoAudience(spec, opts),
      ).toBeNull();
      expect(await audienceModule.previewSkippedPeople(spec, opts)).toBeNull();
      state.viewer = {
        id: await createUser({ role: "festival_admin" }),
        role: "festival_admin",
      };
      expect(
        await audienceModule.previewComunicadoAudience(spec, opts),
      ).toBeNull();
      expect(await audienceModule.previewSkippedPeople(spec, opts)).toBeNull();
    });

    it("counts once per person, by source, before and after the rule (B4, B5)", async () => {
      const { people, festival, list, picked } = await b5Fixture();
      await signInAsAdmin();
      const spec = audience({
        festivals: [festival.id],
        lists: [list.id],
        people: picked,
      });
      const preview = (await audienceModule.previewComunicadoAudience(spec, {
        narrow: false,
        essential: false,
        sendEmail: true,
      }))!;

      expect(preview.sources).toEqual([
        {
          kind: "festival",
          id: festival.id,
          label: `Confirmados · ${festival.name}`,
          count: { eligible: 2, skipped: 4 },
          problem: null,
        },
        {
          kind: "list",
          id: list.id,
          label: list.name,
          count: { eligible: 3, skipped: 0 },
          problem: null,
        },
        {
          kind: "people",
          id: null,
          label: "6 personas por nombre",
          count: { eligible: 2, skipped: 3 },
          problem: null,
        },
      ]);
      // The festival chip says what the lists pages say.
      expect(preview.sources[0]!.count).toEqual(
        await resolve.countAudience(
          appDb,
          resolve.confirmadosMemberIdsSql([festival.id]),
        ),
      );
      // ok, paused, banned, pending, adminOwner, deleting, listOnly and four
      // picked by name; the missing id is nobody.
      expect(preview.matched).toBe(11);
      expect(preview.eligible).toBe(4);
      expect(preview.willReceive).toBe(4);
      // ok is on three sources and paused on two: each counted once.
      expect(preview.overlap).toBe(2);
      expect(preview.skipped).toEqual([
        { reason: "No es participante", count: 3 },
        { reason: "Cuenta en eliminación", count: 2 },
        { reason: "Cuenta suspendida", count: 1 },
        { reason: "Perfil no verificado", count: 1 },
      ]);
      expect(preview.skippedTotal).toBe(7);
      expect(preview.narrowed).toBe(false);
      expect(preview.stagingAdmins).toBe(0);
      expect(preview.tooLarge).toBe(false);

      const skipped = (await audienceModule.previewSkippedPeople(spec, {
        narrow: false,
      }))!;
      const reasons = new Map(skipped.map((row) => [row.userId, row.reason]));
      expect(reasons.get(people.banned)).toBe("Cuenta suspendida");
      expect(reasons.get(people.deletingAdminPicked)).toBe(
        "Cuenta en eliminación",
      );
      expect(reasons.has(people.ok)).toBe(false);
      expect(skipped).toHaveLength(7);
    });

    it("narrows a preview to the admins, counting the cap before narrowing (B6)", async () => {
      const { people, festival, list, picked } = await b5Fixture();
      await signInAsAdmin();
      const spec = audience({
        festivals: [festival.id],
        lists: [list.id],
        people: picked,
      });
      const preview = (await audienceModule.previewComunicadoAudience(spec, {
        narrow: true,
        essential: false,
        sendEmail: true,
      }))!;

      expect(preview.narrowed).toBe(true);
      // "Pueden recibirlo hoy" is the same number production would show.
      expect(preview.eligible).toBe(4);
      expect(preview.matched).toBe(11);
      // paused and listOnly go to the admins instead.
      expect(preview.skipped).toContainEqual({ reason: STAGING, count: 2 });
      // adminOwner, adminBystander and the viewer, at least.
      expect(preview.stagingAdmins).toBeGreaterThanOrEqual(3);
      // ok and adminPicked by name, plus the admins standing in.
      expect(preview.willReceive).toBe(preview.stagingAdmins + 2);

      const skipped = (await audienceModule.previewSkippedPeople(spec, {
        narrow: true,
      }))!;
      const firstStaging = skipped.findIndex((row) => row.reason === STAGING);
      expect(firstStaging).toBeGreaterThan(0);
      // Real reasons first, then the narrowing.
      expect(
        skipped.slice(firstStaging).every((row) => row.reason === STAGING),
      ).toBe(true);
      expect(
        skipped
          .filter((row) => row.reason === STAGING)
          .map((row) => row.userId)
          .sort((a, b) => a - b),
      ).toEqual([people.paused, people.listOnly].sort((a, b) => a - b));

      // People alone are not narrowed.
      const alone = (await audienceModule.previewComunicadoAudience(
        audience({ people: [people.ok, people.adminPicked] }),
        { narrow: true, essential: false, sendEmail: true },
      ))!;
      expect(alone).toMatchObject({
        narrowed: false,
        stagingAdmins: 0,
        willReceive: 2,
        eligible: 2,
      });

      // The cap counts before narrowing: 4 eligible is over a cap of 3.
      state.maxRecipients = 3;
      expect(
        (await audienceModule.previewComunicadoAudience(spec, {
          narrow: true,
          essential: false,
          sendEmail: true,
        }))!.tooLarge,
      ).toBe(true);
      state.maxRecipients = 4;
      expect(
        (await audienceModule.previewComunicadoAudience(spec, {
          narrow: true,
          essential: false,
          sendEmail: true,
        }))!.tooLarge,
      ).toBe(false);
    });

    it("names sources it cannot use, and still resolves an archived list", async () => {
      const member = await createUser();
      const archivedMember = await createUser();
      const unreadable = await createFixedList([], {
        kind: "filter",
        filter: { v: 99 },
      });
      const archived = await createFixedList([archivedMember], {
        archivedAt: new Date(),
      });
      const fine = await createFixedList([member]);
      await signInAsAdmin();

      const preview = (await audienceModule.previewComunicadoAudience(
        audience({
          festivals: [MISSING_ID],
          lists: [unreadable.id, archived.id, fine.id, MISSING_ID],
        }),
        { narrow: false, essential: false, sendEmail: true },
      ))!;
      expect(preview.sources).toEqual([
        {
          kind: "festival",
          id: MISSING_ID,
          label: `Festival #${MISSING_ID}`,
          count: { eligible: 0, skipped: 0 },
          problem: "No encontramos ese festival.",
        },
        {
          kind: "list",
          id: unreadable.id,
          label: unreadable.name,
          count: { eligible: 0, skipped: 0 },
          problem: `La lista «${unreadable.name}» tiene un filtro que ya no se puede leer; editala.`,
        },
        {
          kind: "list",
          id: archived.id,
          label: archived.name,
          count: { eligible: 1, skipped: 0 },
          problem: null,
        },
        {
          kind: "list",
          id: fine.id,
          label: fine.name,
          count: { eligible: 1, skipped: 0 },
          problem: null,
        },
        {
          kind: "list",
          id: MISSING_ID,
          label: `Lista #${MISSING_ID}`,
          count: { eligible: 0, skipped: 0 },
          problem: "Esa lista ya no está disponible.",
        },
      ]);
      // An unreadable filter never evaluates to everyone.
      expect(preview.eligible).toBe(2);
    });

    it("splits email by the send's rules, and essential lifts only the announcements opt-out (B7)", async () => {
      const plain = await createUser();
      const mixedCaseOptOut = await createUser({
        email: `Audiencia-${randomUUID()}@Example.COM`,
      });
      const allOptOut = await createUser();
      const complaint = await createUser();
      const bounce = await createUser();
      const liftedBounce = await createUser();
      const invalid = await createUser({
        email: `sin-arroba-${randomUUID()}.example.com`,
      });
      const unusual = await createUser({
        email: `ñandú-${randomUUID()}@example.com`,
      });
      const unusualOptOut = await createUser({
        email: `ñu-${randomUUID()}@example.com`,
      });
      const bannedOptOut = await createUser({ status: "banned" });
      await unsubscribe(mixedCaseOptOut, "announcements");
      await unsubscribe(unusualOptOut, "announcements");
      await unsubscribe(bannedOptOut, "announcements");
      await unsubscribe(allOptOut, "all");
      // An announcements opt-out under an `all` one is still `all`.
      await unsubscribe(allOptOut, "announcements");
      await suppress(complaint, "complaint");
      await suppress(bounce, "bounce");
      await suppress(liftedBounce, "bounce", new Date());
      const festival = await festivalWith([
        plain,
        mixedCaseOptOut,
        allOptOut,
        complaint,
        bounce,
        liftedBounce,
        invalid,
        unusual,
        unusualOptOut,
        bannedOptOut,
      ]);
      await signInAsAdmin();
      const spec = audience({ festivals: [festival.id] });
      const preview = (opts: { essential: boolean; sendEmail: boolean }) =>
        audienceModule
          .previewComunicadoAudience(spec, { narrow: false, ...opts })
          .then((value) => value!);

      const normal = await preview({ essential: false, sendEmail: true });
      expect(normal.willReceive).toBe(9);
      expect(normal.email).toEqual({
        sendTo: 3,
        unsubscribedAnnouncements: 2,
        unsubscribedAll: 1,
        suppressed: 2,
        invalid: 1,
        essentialOverride: 0,
      });

      const essential = await preview({ essential: true, sendEmail: true });
      expect(essential.essentialAllowed.ok).toBe(true);
      expect(essential.email).toEqual({
        sendTo: 5,
        unsubscribedAnnouncements: 0,
        unsubscribedAll: 1,
        suppressed: 2,
        invalid: 1,
        essentialOverride: 2,
      });

      // Every person who receives it falls in exactly one of these.
      for (const counts of [normal.email, essential.email]) {
        expect(
          counts.sendTo +
            counts.unsubscribedAnnouncements +
            counts.unsubscribedAll +
            counts.suppressed +
            counts.invalid,
        ).toBe(9);
      }

      // Essential where it is not allowed is counted as a normal send.
      const notAllowed = await preview({ essential: true, sendEmail: false });
      expect(notAllowed.essentialAllowed.ok).toBe(false);
      expect(notAllowed.email).toEqual(normal.email);
    });

    it("counts the people with a device, and their devices", async () => {
      const two = await createUser();
      const one = await createUser();
      const none = await createUser();
      const bannedWithDevice = await createUser({ status: "banned" });
      await addDevice(two);
      await addDevice(two);
      await addDevice(one);
      await addDevice(bannedWithDevice);
      const festival = await festivalWith([two, one, none, bannedWithDevice]);
      await signInAsAdmin();

      const preview = (await audienceModule.previewComunicadoAudience(
        audience({ festivals: [festival.id] }),
        { narrow: false, essential: false, sendEmail: false },
      ))!;
      expect(preview.willReceive).toBe(3);
      expect(preview.pushDevices).toBe(2);
      expect(preview.pushSubscriptions).toBe(3);
    });

    it("allows essential only for one current or upcoming festival, with email", async () => {
      const participant = await createUser();
      const now = Date.now();
      const upcoming = await createFestival({}, [
        { start: new Date(now + DAY), end: new Date(now + 2 * DAY) },
      ]);
      const endedSixDaysAgo = await createFestival({}, [
        { start: new Date(now - 7 * DAY), end: new Date(now - 6 * DAY) },
      ]);
      const endedEightDaysAgo = await createFestival({}, [
        { start: new Date(now - 9 * DAY), end: new Date(now - 8 * DAY) },
      ]);
      // Judged by its last day.
      const twoWeekends = await createFestival({}, [
        { start: new Date(now - 31 * DAY), end: new Date(now - 30 * DAY) },
        { start: new Date(now + 3 * DAY), end: new Date(now + 4 * DAY) },
      ]);
      const undated = await createFestival({ status: "published" });
      const archivedUndated = await createFestival({ status: "archived" });
      const archivedUpcoming = await createFestival({ status: "archived" }, [
        { start: new Date(now + DAY), end: new Date(now + 2 * DAY) },
      ]);
      const list = await createFixedList([participant]);
      await signInAsAdmin();

      const allowed = async (
        spec: Partial<ComunicadoAudience>,
        sendEmail = true,
      ) =>
        (await audienceModule.previewComunicadoAudience(audience(spec), {
          narrow: false,
          essential: true,
          sendEmail,
        }))!.essentialAllowed;
      const refused = {
        ok: false,
        reason:
          "Solo un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo, puede ser esencial.",
        festival: null,
      };

      expect(await allowed({ festivals: [upcoming.id] })).toEqual({
        ok: true,
        reason: null,
        festival: { id: upcoming.id, name: upcoming.name },
      });
      expect((await allowed({ festivals: [endedSixDaysAgo.id] })).ok).toBe(
        true,
      );
      expect((await allowed({ festivals: [twoWeekends.id] })).ok).toBe(true);
      expect((await allowed({ festivals: [undated.id] })).ok).toBe(true);
      expect(await allowed({ festivals: [endedEightDaysAgo.id] })).toEqual(
        refused,
      );
      expect(await allowed({ festivals: [archivedUndated.id] })).toEqual(
        refused,
      );
      expect(await allowed({ festivals: [archivedUpcoming.id] })).toEqual(
        refused,
      );
      expect(await allowed({ festivals: [upcoming.id] }, false)).toEqual(
        refused,
      );
      expect(
        await allowed({ festivals: [upcoming.id], lists: [list.id] }),
      ).toEqual(refused);
      expect(
        await allowed({ festivals: [upcoming.id], people: [participant] }),
      ).toEqual(refused);
      expect(await allowed({ festivals: [upcoming.id, undated.id] })).toEqual(
        refused,
      );
      expect(await allowed({ festivals: [MISSING_ID] })).toEqual(refused);

      // The same rule for the actions, without the counts.
      expect(
        await audienceModule.comunicadoEssentialAllowed(
          appDb,
          audience({ festivals: [endedSixDaysAgo.id] }),
          { sendEmail: true },
        ),
      ).toMatchObject({ ok: true });
      expect(
        await audienceModule.comunicadoEssentialAllowed(
          appDb,
          audience({ festivals: [endedEightDaysAgo.id] }),
          { sendEmail: true },
        ),
      ).toEqual(refused);
    });

    it("writes nothing", async () => {
      const { festival, list, picked } = await b5Fixture();
      const viewer = await signInAsAdmin();
      const spec = audience({
        festivals: [festival.id],
        lists: [list.id],
        people: picked,
      });
      const ours = [...created.users, viewer.id];
      const before = await writtenFor(ours);
      for (const narrow of [false, true]) {
        await audienceModule.previewComunicadoAudience(spec, {
          narrow,
          essential: false,
          sendEmail: true,
        });
        await audienceModule.previewSkippedPeople(spec, { narrow });
      }
      expect(await writtenFor(ours)).toEqual(before);
    });
  });

  describe("queries", () => {
    async function insertComunicado(
      values: Partial<typeof comunicados.$inferInsert>,
    ) {
      const [row] = await integrationDb!
        .insert(comunicados)
        .values(values)
        .returning({ id: comunicados.id });
      created.comunicados.push(row!.id);
      return row!.id;
    }

    it("answers anyone but a global admin with nothing", async () => {
      const id = await insertComunicado({ title: "Oculto" });
      state.viewer = {
        id: await createUser({ role: "festival_admin" }),
        role: "festival_admin",
      };
      expect(await queries.fetchComunicadoTabs()).toEqual({
        drafts: 0,
        scheduled: 0,
        sent: 0,
      });
      expect(
        await queries.fetchComunicadoList({ tab: "drafts", page: 1 }),
      ).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 });
      expect(await queries.fetchComunicadoForComposer(id)).toBeNull();
      expect(await queries.searchComunicadoPeople("Oculto")).toEqual([]);
    });

    it("lists each tab newest activity first, with who it is for and who wrote it", async () => {
      const author = await createUser({ name: "Dennis Autor" });
      const editor = await createUser({ name: "Ana Editora" });
      const festival = await createFestival();
      const listA = await createFixedList([]);
      const listB = await createFixedList([]);
      await signInAsAdmin();
      const before = await queries.fetchComunicadoTabs();

      // In the future, so they sort above anything else in the database.
      const at = (days: number) => new Date(Date.now() + days * DAY);
      const festivalAndPeople = await insertComunicado({
        title: "Cambio de horario",
        audience: { festivals: [festival.id], lists: [], people: [1, 2, 3] },
        createdByUserId: author,
        updatedByUserId: editor,
        updatedAt: at(30),
      });
      const twoLists = await insertComunicado({
        audience: { festivals: [], lists: [listA.id, listB.id], people: [4] },
        createdByUserId: author,
        updatedAt: at(29),
      });
      const empty = await insertComunicado({ updatedAt: at(28) });
      const unreadable = await insertComunicado({
        audience: { nope: true } as never,
        updatedAt: at(27),
      });
      const scheduled = await insertComunicado({
        status: "scheduled",
        scheduledAt: at(2),
        updatedAt: at(31),
      });

      const after = await queries.fetchComunicadoTabs();
      expect(after.drafts - before.drafts).toBe(4);
      expect(after.scheduled - before.scheduled).toBe(1);
      expect(after.sent - before.sent).toBe(0);

      const drafts = await queries.fetchComunicadoList({
        tab: "drafts",
        page: 1,
      });
      expect(drafts.rows.slice(0, 4).map((row) => row.id)).toEqual([
        festivalAndPeople,
        twoLists,
        empty,
        unreadable,
      ]);
      expect(drafts.rows[0]).toMatchObject({
        title: "Cambio de horario",
        status: "draft",
        audienceLabel: `Para: Confirmados · ${festival.name} y 3 personas`,
        createdByName: "Dennis Autor",
        updatedByName: "Ana Editora",
        sentByName: null,
        sending: false,
        editedAt: null,
      });
      expect(drafts.rows[1]).toMatchObject({
        title: "",
        audienceLabel: `Para: ${listA.name}, ${listB.name} y 1 persona`,
        updatedByName: null,
      });
      expect(drafts.rows[2]!.audienceLabel).toBeNull();
      expect(drafts.rows[3]!.audienceLabel).toBeNull();
      expect(drafts.rows.some((row) => row.id === scheduled)).toBe(false);

      const scheduledTab = await queries.fetchComunicadoList({
        tab: "scheduled",
        page: 1,
      });
      expect(scheduledTab.rows[0]).toMatchObject({
        id: scheduled,
        status: "scheduled",
      });

      // A page past the end shows the last one.
      const past = await queries.fetchComunicadoList({
        tab: "drafts",
        page: 999,
      });
      expect(past.page).toBe(past.pageCount);
      expect(past.rows.length).toBeGreaterThan(0);
    });

    it("loads the working copy with the names behind its audience", async () => {
      const festival = await createFestival();
      const archived = await createFixedList([], { archivedAt: new Date() });
      const participant = await createUser({ name: "Bea Participante" });
      const admin = await createUser({ name: "Ciro Admin", role: "admin" });
      const banned = await createUser({ status: "banned" });
      await signInAsAdmin();
      const id = await insertComunicado({
        title: "Armado",
        doc: [{ type: "paragraph" }],
        actionLabel: "Ver mi",
        actionPath: "/my_participations",
        sendPush: true,
        essential: true,
        essentialReason: "por la lluvia",
        audience: {
          festivals: [festival.id, MISSING_ID],
          lists: [archived.id],
          people: [admin, MISSING_ID, participant, banned],
        },
      });

      const comunicado = (await queries.fetchComunicadoForComposer(id))!;
      expect(comunicado).toMatchObject({
        id,
        status: "draft",
        version: 1,
        title: "Armado",
        doc: [{ type: "paragraph" }],
        actionLabel: "Ver mi",
        actionPath: "/my_participations",
        sendEmail: true,
        sendPush: true,
        essential: true,
        essentialReason: "por la lluvia",
        audienceUnreadable: false,
      });
      expect(comunicado.sources.festivals).toEqual([
        {
          id: festival.id,
          name: festival.name,
          label: `Confirmados · ${festival.name}`,
        },
      ]);
      expect(comunicado.sources.lists).toEqual([
        { id: archived.id, name: archived.name, kind: "fixed", archived: true },
      ]);
      expect(
        comunicado.sources.people.map((person) => [
          person.id,
          person.name,
          person.role,
          person.skipReason,
        ]),
      ).toEqual([
        [admin, "Ciro Admin", "admin", null],
        [participant, "Bea Participante", "user", null],
        [banned, expect.any(String), "user", "Cuenta suspendida"],
      ]);
      expect(comunicado.sources.missing).toEqual({
        festivals: [MISSING_ID],
        lists: [],
        people: [MISSING_ID],
      });

      const broken = await insertComunicado({
        audience: { festivals: "x" } as never,
      });
      expect(await queries.fetchComunicadoForComposer(broken)).toMatchObject({
        audienceUnreadable: true,
        audience: { festivals: [], lists: [], people: [] },
      });
      expect(await queries.fetchComunicadoForComposer(MISSING_ID)).toBeNull();
    });

    it("finds participants and global admins by name, with why they cannot receive it", async () => {
      const token = `Zorzal${randomUUID().slice(0, 8)}`;
      const participant = await createUser({ name: `${token} Ana` });
      const admin = await createUser({ name: `${token} Beto`, role: "admin" });
      const banned = await createUser({
        name: `${token} Carla`,
        status: "banned",
      });
      const deleting = await createUser({ name: `${token} Dario` });
      await markDeleting(deleting);
      await createUser({ name: `${token} Eva`, role: "festival_admin" });
      await createUser({ name: `${token} Fede`, role: "artist" });
      await signInAsAdmin();

      const byId = async () =>
        new Map(
          (await queries.searchComunicadoPeople(token)).map((option) => [
            option.id,
            option,
          ]),
        );

      state.vercelEnv = "preview";
      const onPreview = await byId();
      expect([...onPreview.keys()]).toEqual([
        participant,
        admin,
        banned,
        deleting,
      ]);
      expect(onPreview.get(participant)).toMatchObject({
        isAdmin: false,
        skipReason: null,
        realEmailOnPreview: true,
      });
      expect(onPreview.get(admin)).toMatchObject({
        isAdmin: true,
        skipReason: null,
        realEmailOnPreview: false,
      });
      expect(onPreview.get(banned)).toMatchObject({
        skipReason: "Cuenta suspendida",
        realEmailOnPreview: false,
      });
      expect(onPreview.get(deleting)?.skipReason).toBe("Cuenta en eliminación");

      for (const env of ["development", "production"]) {
        state.vercelEnv = env;
        expect(
          [...(await byId()).values()].some(
            (option) => option.realEmailOnPreview,
          ),
        ).toBe(false);
      }

      for (let i = 0; i < 6; i++) {
        await createUser({ name: `${token} Extra ${i}` });
      }
      expect(await queries.searchComunicadoPeople(token)).toHaveLength(8);
      expect(await queries.searchComunicadoPeople("Z")).toEqual([]);
    });
  });
});
