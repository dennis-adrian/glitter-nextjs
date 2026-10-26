// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import type { ComunicadoAudience } from "@/app/lib/comunicados/definitions";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  distributionListMembers,
  distributionLists,
  emailSuppressions,
  emailUnsubscribes,
  festivalDates,
  festivals,
  notificationCampaignRecipients,
  notificationCampaigns,
  notifications,
  pendingUserDeletions,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Starting a send against a real database (docs/IMPLEMENTATION-comunicados.md
 * D1, B4–B8, G5): the snapshot and its skips, the narrowing outside
 * production, the refusals and their order, the double click, the essential
 * record, a profile deletion racing the snapshot, and gifts never seeing a
 * comunicado. The driver is mocked: delivering is another file's. Every
 * assertion is about this file's own fixtures; where staging admins bring in
 * every admin there is, only this file's admins are looked at. Each test
 * removes its rows when it ends.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: afterMock }));
const runWorkMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/comunicados/driver", () => ({
  runComunicadoWork: runWorkMock,
}));
const resend = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  sendBatchEmails: vi.fn(),
}));
vi.mock("@/app/vendors/resend", () => resend);
const deleteClerkUser = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/users/clerk", () => ({ deleteClerkUser }));

type Viewer = { id: number; role: "admin" | "festival_admin" | "user" };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  flagOn: true,
  vercelEnv: "production",
  maxRecipients: 3_000,
  typeToConfirm: 300,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => state.viewer,
  requireAdmin: async () =>
    state.viewer?.role === "admin" ? state.viewer : null,
  requireAdminOrFestivalAdmin: async () =>
    state.viewer?.role === "admin" || state.viewer?.role === "festival_admin"
      ? state.viewer
      : null,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: async (key: string) =>
    key === "comunicados" && state.flagOn,
  isFeatureLaunched: async () => false,
  featureFlagGuard: async (key: string) =>
    key === "comunicados" && state.flagOn
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
// The cap is 3,000 and typing starts at 300; lowered ones let a few fixtures
// cross them.
vi.mock("@/app/lib/comunicados/definitions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/comunicados/definitions")>();
  return {
    ...actual,
    get COMUNICADO_MAX_RECIPIENTS() {
      return state.maxRecipients;
    },
    get COMUNICADO_TYPE_TO_CONFIRM_RECIPIENTS() {
      return state.typeToConfirm;
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

type Send = typeof import("@/app/lib/comunicados/send");
type SendActions = typeof import("@/app/lib/comunicados/send-actions");
type Audience = typeof import("@/app/lib/comunicados/audience");
type UserActions = typeof import("@/app/api/users/actions");
type GiftService = typeof import("@/app/lib/credit_gifts/service");
type GiftQueries = typeof import("@/app/lib/credit_gifts/queries");
type AppDb = (typeof import("@/db"))["db"];
let send: Send;
let sendActions: SendActions;
let audienceModule: Audience;
let userActions: UserActions;
let giftService: GiftService;
let giftQueries: GiftQueries;
let appDb: AppDb;

const BASE_URL = "https://glitter.test";
const STAGING = "Entorno de prueba: no se envía a listas";
const MISSING_ID = 2_147_483_000;
const DAY = 24 * 3600_000;
const REASON = "El armado se adelanta a las 7:00 por la lluvia";

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
      clerkId: `send-${suffix}`,
      email: `send-${suffix}@example.com`,
      displayName: name ?? `Envío ${suffix.slice(0, 8)}`,
      role: "user",
      status: "verified",
      ...values,
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

async function emailOf(userId: number) {
  const [row] = await integrationDb!
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return row!.email;
}

async function createFestival(
  values: Partial<typeof festivals.$inferInsert> = {},
  dates: { start: Date; end: Date }[] = [
    {
      start: new Date(Date.now() + 10 * DAY),
      end: new Date(Date.now() + 11 * DAY),
    },
  ],
) {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Envío ${randomUUID()}`, status: "active", ...values })
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

let standNumber = 8900;

/** A festival whose Confirmados list is exactly `holders`, one reservation each. */
async function festivalWith(
  holders: number[],
  values: Partial<typeof festivals.$inferInsert> = {},
  dates?: { start: Date; end: Date }[],
) {
  const festival = await createFestival(values, dates);
  for (const owner of holders) {
    const [stand] = await integrationDb!
      .insert(stands)
      .values({ standNumber: standNumber++, festivalId: festival.id })
      .returning({ id: stands.id });
    created.stands.push(stand!.id);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({
        standId: stand!.id,
        festivalId: festival.id,
        status: "accepted",
        ownerUserId: owner,
      })
      .returning({ id: standReservations.id });
    created.reservations.push(reservation!.id);
    await integrationDb!
      .insert(reservationParticipants)
      .values({ userId: owner, reservationId: reservation!.id });
  }
  return festival;
}

async function createFixedList(memberIds: number[]) {
  const [list] = await integrationDb!
    .insert(distributionLists)
    .values({ name: `Envío ${randomUUID()}`, kind: "fixed" })
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
    .values({ userId, clerkId: `send-del-${randomUUID()}` })
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

async function suppress(userId: number) {
  const [row] = await integrationDb!
    .insert(emailSuppressions)
    .values({
      emailKey: (await emailOf(userId)).trim().toLowerCase(),
      reason: "bounce",
    })
    .returning({ id: emailSuppressions.id });
  created.suppressions.push(row!.id);
}

function audience(value: Partial<ComunicadoAudience>): ComunicadoAudience {
  return { festivals: [], lists: [], people: [], ...value };
}

/** A paragraph as `normalizeAnnouncementDoc` stores it. */
function storedParagraph(text: string) {
  return {
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

/** A draft ready to send to `to`, written by `authorId`. */
async function insertDraft(
  authorId: number,
  to: Partial<ComunicadoAudience>,
  values: Partial<typeof comunicados.$inferInsert> = {},
) {
  const [row] = await integrationDb!
    .insert(comunicados)
    .values({
      title: "Cambio de horario de armado",
      doc: [storedParagraph("El armado empieza a las 8:00.")],
      audience: audience(to),
      createdByUserId: authorId,
      updatedByUserId: authorId,
      ...values,
    })
    .returning({ id: comunicados.id });
  created.comunicados.push(row!.id);
  return row!.id;
}

async function rowOf(id: number) {
  const [row] = await integrationDb!
    .select()
    .from(comunicados)
    .where(eq(comunicados.id, id));
  return row!;
}

async function campaignsOf(comunicadoId: number) {
  return integrationDb!
    .select()
    .from(notificationCampaigns)
    .where(
      eq(notificationCampaigns.idempotencyKey, `comunicado:${comunicadoId}`),
    );
}

type Recipient = {
  status: string;
  skippedReason: string | null;
  source: string | null;
  processed: boolean;
};

/** The campaign's recipient rows, by person. */
async function recipientsOf(campaignId: number) {
  const rows = await integrationDb!
    .select({
      userId: notificationCampaignRecipients.userId,
      status: notificationCampaignRecipients.status,
      skippedReason: notificationCampaignRecipients.skippedReason,
      source: notificationCampaignRecipients.source,
      processedAt: notificationCampaignRecipients.processedAt,
    })
    .from(notificationCampaignRecipients)
    .where(eq(notificationCampaignRecipients.campaignId, campaignId));
  return new Map<number, Recipient>(
    rows.map((row) => [
      row.userId,
      {
        status: row.status,
        skippedReason: row.skippedReason,
        source: row.source,
        processed: row.processedAt !== null,
      },
    ]),
  );
}

const pending = (source: string): Recipient => ({
  status: "pending",
  skippedReason: null,
  source,
  processed: false,
});
const skipped = (source: string, reason: string): Recipient => ({
  status: "skipped",
  skippedReason: reason,
  source,
  processed: true,
});

let sender: number;

async function sendNow(
  id: number,
  values: { expectedVersion?: number; typedCount?: number | null } = {},
) {
  return send.sendComunicadoNow({
    comunicadoId: id,
    by: sender,
    expectedVersion: values.expectedVersion ?? 1,
    typedCount: values.typedCount ?? null,
  });
}

async function started(
  id: number,
  values: { expectedVersion?: number; typedCount?: number | null } = {},
) {
  const result = await sendNow(id, values);
  if (result.kind !== "started") throw new Error(`not started: ${result.kind}`);
  return result;
}

async function refusalOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof send.SendRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

/** The comunicado untouched, and no campaign or recipient row for it. */
async function expectNothingWritten(id: number, version = 1) {
  expect(await rowOf(id)).toMatchObject({
    status: "draft",
    version,
    campaignId: null,
    currentRevision: null,
    audienceSummary: null,
    sentAt: null,
  });
  expect(await campaignsOf(id)).toEqual([]);
  const [revisions] = await integrationDb!
    .select({ n: sql<number>`count(*)::int` })
    .from(comunicadoRevisions)
    .where(eq(comunicadoRevisions.comunicadoId, id));
  expect(revisions!.n).toBe(0);
}

/** Resolves once some connection waits on a lock that backend `pid` holds. */
async function waitUntilBlockedBy(pid: number) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
      [pid],
    );
    if (rows[0]!.waiting > 0) return;
    if (attempt > 250) throw new Error("Nothing ever waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

let consoleLog: MockInstance<typeof console.log>;
let consoleWarn: MockInstance<typeof console.warn>;
let consoleError: MockInstance<typeof console.error>;

/**
 * Every string a logged statement carried as a parameter: the app's query
 * logger prints them all (db/index.ts), so an address must only ever be read
 * in SQL. Fixture addresses are all at example.com.
 */
function loggedParams() {
  return consoleLog.mock.calls.flatMap(([entry]) =>
    entry && typeof entry === "object" && "query" in entry
      ? ((entry as { params: unknown[] }).params ?? []).filter(
          (param): param is string => typeof param === "string",
        )
      : [],
  );
}

describeDatabase("starting a comunicado send", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    send = await import("@/app/lib/comunicados/send");
    sendActions = await import("@/app/lib/comunicados/send-actions");
    audienceModule = await import("@/app/lib/comunicados/audience");
    userActions = await import("@/app/api/users/actions");
    giftService = await import("@/app/lib/credit_gifts/service");
    giftQueries = await import("@/app/lib/credit_gifts/queries");
    appDb = (await import("@/db")).db;

    try {
      await integrationDb!
        .select({ id: comunicados.id, key: comunicados.autosaveKey })
        .from(comunicados)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(async () => {
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn");
    consoleError = vi.spyOn(console, "error");
    sender = await createUser({ role: "admin", name: "Dennis Envía" });
  });

  /** Deletes what the test just made, so no later test counts it. */
  async function cleanUp() {
    const db = integrationDb!;
    if (created.comunicados.length > 0) {
      const sent = await db
        .select({ campaignId: comunicados.campaignId })
        .from(comunicados)
        .where(inArray(comunicados.id, created.comunicados));
      const campaignIds = sent.flatMap((row) =>
        row.campaignId === null ? [] : [row.campaignId],
      );
      if (campaignIds.length > 0) {
        await db
          .delete(notifications)
          .where(inArray(notifications.campaignId, campaignIds));
      }
      // Revisions hold their comunicado (RESTRICT), which holds its campaign
      // and its essential confirmer.
      await db
        .delete(comunicadoRevisions)
        .where(inArray(comunicadoRevisions.comunicadoId, created.comunicados));
      await db
        .delete(comunicados)
        .where(inArray(comunicados.id, created.comunicados));
      if (campaignIds.length > 0) {
        await db
          .delete(notificationCampaigns)
          .where(inArray(notificationCampaigns.id, campaignIds));
      }
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
    if (created.users.length > 0) {
      await db
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.userId, created.users));
    }
    if (created.lists.length > 0) {
      await db
        .delete(distributionLists)
        .where(inArray(distributionLists.id, created.lists));
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
    for (const ids of Object.values(created)) ids.length = 0;
  }

  afterEach(async () => {
    try {
      // Logs carry ids, codes and counts; no address is ever a parameter.
      expect(consoleError).not.toHaveBeenCalled();
      const comunicadoLines = consoleLog.mock.calls.filter(
        ([first]) =>
          typeof first === "string" && first.startsWith("[comunicados]"),
      );
      expect(JSON.stringify(comunicadoLines)).not.toContain("@");
      expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain("@");
      expect(
        loggedParams().filter((param) => param.includes("@example.com")),
      ).toEqual([]);
    } finally {
      vi.restoreAllMocks();
      afterMock.mockReset();
      runWorkMock.mockReset();
      revalidatePath.mockClear();
      state.viewer = null;
      state.flagOn = true;
      state.vercelEnv = "production";
      state.maxRecipients = 3_000;
      state.typeToConfirm = 300;
      process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
      await cleanUp();
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("the snapshot (B4, B5)", () => {
    it("writes one row per person, and a pick by name beats a list", async () => {
      const ana = await createUser();
      const luis = await createUser();
      const sol = await createUser();
      const festival = await festivalWith([ana, luis]);
      const list = await createFixedList([ana, luis, sol]);
      const id = await insertDraft(sender, {
        festivals: [festival.id],
        lists: [list.id],
        people: [ana],
      });

      const result = await started(id);

      expect(result).toEqual({
        kind: "started",
        comunicadoId: id,
        campaignId: result.campaignId,
        eligible: 3,
        willReceive: 3,
        skipped: 0,
        narrowed: false,
      });
      const recipients = await recipientsOf(result.campaignId);
      expect(recipients).toEqual(
        new Map([
          [ana, pending("person")],
          [luis, pending("list")],
          [sol, pending("list")],
        ]),
      );
      expect((await rowOf(id)).audienceSummary).toMatchObject({
        v: 1,
        env: "production",
        narrowed: false,
        matched: 3,
        eligible: 3,
        willReceive: 3,
        stagingAdmins: 0,
        pickedByName: 1,
        skipped: [],
        sources: [
          {
            kind: "festival",
            id: festival.id,
            label: `Confirmados · ${festival.name}`,
            matched: 2,
            eligible: 2,
          },
          {
            kind: "list",
            id: list.id,
            label: list.name,
            matched: 3,
            eligible: 3,
          },
          {
            kind: "people",
            id: null,
            label: "1 persona por nombre",
            matched: 1,
            eligible: 1,
          },
        ],
      });
    });

    it("stores every B5 reason, first match winning, with its source", async () => {
      const people = {
        ok: await createUser(),
        paused: await createUser({ status: "paused" }),
        banned: await createUser({ status: "banned" }),
        unverified: await createUser({ status: "pending" }),
        adminOwner: await createUser({ role: "admin" }),
        deleting: await createUser(),
        adminPicked: await createUser({ role: "admin" }),
        bannedAdminPicked: await createUser({
          role: "admin",
          status: "banned",
        }),
        deletingAdminPicked: await createUser({ role: "admin" }),
        festivalAdminPicked: await createUser({ role: "festival_admin" }),
      };
      await markDeleting(people.deleting);
      await markDeleting(people.deletingAdminPicked);
      const festival = await festivalWith([
        people.ok,
        people.paused,
        people.banned,
        people.unverified,
        people.adminOwner,
        people.deleting,
      ]);
      const id = await insertDraft(sender, {
        festivals: [festival.id],
        people: [
          people.adminPicked,
          people.bannedAdminPicked,
          people.deletingAdminPicked,
          people.festivalAdminPicked,
          MISSING_ID,
        ],
      });

      const result = await started(id);

      expect(await recipientsOf(result.campaignId)).toEqual(
        new Map([
          [people.ok, pending("list")],
          [people.paused, pending("list")],
          [people.banned, skipped("list", "Cuenta suspendida")],
          [people.unverified, skipped("list", "Perfil no verificado")],
          [people.adminOwner, skipped("list", "No es participante")],
          [people.deleting, skipped("list", "Cuenta en eliminación")],
          [people.adminPicked, pending("person")],
          [people.bannedAdminPicked, skipped("person", "No es participante")],
          [
            people.deletingAdminPicked,
            skipped("person", "Cuenta en eliminación"),
          ],
          [people.festivalAdminPicked, skipped("person", "No es participante")],
        ]),
      );
      expect(result).toMatchObject({ eligible: 3, willReceive: 3, skipped: 7 });
      expect((await rowOf(id)).audienceSummary).toMatchObject({
        matched: 10,
        eligible: 3,
        willReceive: 3,
        pickedByName: 1,
        skipped: [
          { reason: "No es participante", count: 3 },
          { reason: "Cuenta en eliminación", count: 2 },
          { reason: "Cuenta suspendida", count: 1 },
          { reason: "Perfil no verificado", count: 1 },
        ],
      });
    });
  });

  describe("outside production (B6)", () => {
    it.each(["preview", "development"])(
      "on %s, sends the lists to the admins and the people picked by name as they are",
      async (env) => {
        state.vercelEnv = env;
        const ana = await createUser();
        const sol = await createUser();
        const luis = await createUser();
        const adminOwner = await createUser({ role: "admin" });
        const adminBystander = await createUser({ role: "admin" });
        const adminPicked = await createUser({ role: "admin" });
        const festivalAdmin = await createUser({ role: "festival_admin" });
        const festival = await festivalWith([ana, adminOwner]);
        const list = await createFixedList([sol]);
        const id = await insertDraft(sender, {
          festivals: [festival.id],
          lists: [list.id],
          people: [luis, adminPicked, festivalAdmin],
        });

        const result = await started(id);

        expect(result).toMatchObject({ eligible: 4, narrowed: true });
        const recipients = await recipientsOf(result.campaignId);
        expect(recipients.get(ana)).toEqual(skipped("list", STAGING));
        expect(recipients.get(sol)).toEqual(skipped("list", STAGING));
        expect(recipients.get(adminOwner)).toEqual(pending("staging_admin"));
        expect(recipients.get(adminBystander)).toEqual(
          pending("staging_admin"),
        );
        expect(recipients.get(sender)).toEqual(pending("staging_admin"));
        expect(recipients.get(luis)).toEqual(pending("person"));
        expect(recipients.get(adminPicked)).toEqual(pending("person"));
        expect(recipients.get(festivalAdmin)).toEqual(
          skipped("person", "No es participante"),
        );

        const summary = (await rowOf(id)).audienceSummary!;
        expect(summary).toMatchObject({
          env,
          narrowed: true,
          // Counted before narrowing: ana, sol, luis and the admin picked.
          matched: 6,
          eligible: 4,
          pickedByName: 2,
        });
        expect(summary.stagingAdmins).toBeGreaterThanOrEqual(3);
        expect(summary.willReceive).toBe((summary.stagingAdmins as number) + 2);
        expect(summary.skipped).toContainEqual({ reason: STAGING, count: 2 });
      },
    );

    it("sends to people alone exactly them, with no admin standing in", async () => {
      state.vercelEnv = "preview";
      const luis = await createUser();
      const bystander = await createUser({ role: "admin" });
      const id = await insertDraft(sender, { people: [luis] });

      const result = await started(id);

      expect(result).toMatchObject({
        eligible: 1,
        willReceive: 1,
        narrowed: false,
      });
      expect(await recipientsOf(result.campaignId)).toEqual(
        new Map([[luis, pending("person")]]),
      );
      expect(bystander).toBeGreaterThan(0);
      expect((await rowOf(id)).audienceSummary).toMatchObject({
        env: "preview",
        narrowed: false,
        stagingAdmins: 0,
      });
    });
  });

  describe("refusals (D1, B8)", () => {
    it("does not find a comunicado that does not exist", async () => {
      const refusal = await refusalOf(sendNow(MISSING_ID));
      expect(refusal).toMatchObject({
        code: "NOT_FOUND",
        message: "No encontramos este comunicado.",
      });
    });

    it("refuses a draft that changed since the dialog opened", async () => {
      const ana = await createUser();
      const id = await insertDraft(sender, { people: [ana] });

      expect(
        await refusalOf(sendNow(id, { expectedVersion: 2 })),
      ).toMatchObject({
        code: "STALE",
        message:
          "El borrador cambió desde que abriste la confirmación. Revisalo y confirmá de nuevo.",
      });
      await expectNothingWritten(id);
    });

    it("checks the content first, as the send stage of C2 does", async () => {
      const id = await insertDraft(sender, {}, { title: "   " });

      expect(await refusalOf(sendNow(id))).toMatchObject({
        code: "INVALID_CONTENT",
        message: "Escribí un título.",
      });
      await expectNothingWritten(id);
    });

    it.each([
      [
        "an audience that no longer parses",
        async () => ({ festivals: "todos" }) as unknown as ComunicadoAudience,
        "No pudimos leer los destinatarios guardados. Elegilos de nuevo.",
      ],
      [
        "an empty audience",
        async () => audience({}),
        "Elegí al menos una lista o una persona.",
      ],
      [
        "a list that is gone",
        async () =>
          audience({ lists: [MISSING_ID], people: [await createUser()] }),
        "Esa lista ya no está disponible.",
      ],
      [
        "a festival that is gone",
        async () => audience({ festivals: [MISSING_ID] }),
        "No encontramos ese festival.",
      ],
    ])("refuses %s", async (_label, makeAudience, message) => {
      const id = await insertDraft(
        sender,
        {},
        { audience: await makeAudience() },
      );

      expect(await refusalOf(sendNow(id))).toMatchObject({
        code: "INVALID_AUDIENCE",
        message,
      });
      await expectNothingWritten(id);
    });

    it("refuses a list whose filter no longer parses, rather than reach everyone (V9)", async () => {
      await createUser();
      const [list] = await integrationDb!
        .insert(distributionLists)
        .values({
          name: `Envío ${randomUUID()}`,
          kind: "filter",
          filter: { v: 2, areas: ["painting"] },
        })
        .returning();
      created.lists.push(list!.id);
      const id = await insertDraft(sender, { lists: [list!.id] });

      expect(await refusalOf(sendNow(id))).toMatchObject({
        code: "INVALID_AUDIENCE",
        message: `La lista «${list!.name}» tiene un filtro que ya no se puede leer; editala.`,
      });
      await expectNothingWritten(id);
    });

    it("counts the cap before narrowing, so a preview refuses what production would", async () => {
      state.vercelEnv = "preview";
      state.maxRecipients = 2;
      const holders = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      const festival = await festivalWith(holders);
      const id = await insertDraft(sender, { festivals: [festival.id] });

      const refusal = await refusalOf(sendNow(id));
      expect(refusal).toMatchObject({
        code: "AUDIENCE_TOO_LARGE",
        eligible: 3,
        message:
          "Por ahora un comunicado llega a 2 personas como máximo. Achicá la audiencia con una lista más precisa.",
      });
      await expectNothingWritten(id);

      // At the cap it goes, to the admins instead.
      state.maxRecipients = 3;
      const result = await started(id);
      expect(result).toMatchObject({ eligible: 3, narrowed: true });
      const recipients = await recipientsOf(result.campaignId);
      for (const holder of holders) {
        expect(recipients.get(holder)).toEqual(skipped("list", STAGING));
      }
    });

    it("refuses an audience nobody in can receive it, before narrowing", async () => {
      state.vercelEnv = "preview";
      const banned = await createUser({ status: "banned" });
      const unverified = await createUser({ status: "pending" });
      const festival = await festivalWith([banned, unverified]);
      // The admins would stand in, but nobody on the list could receive it.
      const id = await insertDraft(sender, { festivals: [festival.id] });

      expect(await refusalOf(sendNow(id))).toMatchObject({
        code: "NO_ELIGIBLE_RECIPIENTS",
        eligible: 0,
        message: "Nadie de esta audiencia puede recibirlo.",
      });
      await expectNothingWritten(id);
    });

    describe("the public base URL", () => {
      it("refuses email from a preview whose links would not work", async () => {
        state.vercelEnv = "preview";
        process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
        const id = await insertDraft(sender, { people: [await createUser()] });

        expect(await refusalOf(sendNow(id))).toMatchObject({
          code: "BASE_URL",
          message:
            "Falta configurar la dirección pública del sitio: los enlaces del correo no funcionarían.",
        });
        expect(consoleError).toHaveBeenCalledWith(
          "[comunicados] email links would not work:",
          'the public base URL "http://localhost:3000" is not https',
        );
        consoleError.mockClear();
        await expectNothingWritten(id);
      });

      it("lets it go without email, and anywhere in development", async () => {
        process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
        state.vercelEnv = "preview";
        const ana = await createUser();
        const withoutEmail = await insertDraft(
          sender,
          { people: [ana] },
          { sendEmail: false },
        );
        await started(withoutEmail);

        state.vercelEnv = "development";
        await started(await insertDraft(sender, { people: [ana] }));
      });
    });

    describe("the typed count (B8)", () => {
      it("refuses a count that differs, or is missing, where one is required", async () => {
        state.typeToConfirm = 2;
        const festival = await festivalWith([
          await createUser(),
          await createUser(),
          await createUser(),
        ]);
        const id = await insertDraft(sender, { festivals: [festival.id] });

        for (const typedCount of [2, null]) {
          expect(await refusalOf(sendNow(id, { typedCount }))).toMatchObject({
            code: "AUDIENCE_CHANGED",
            eligible: 3,
            message:
              "La audiencia cambió: ahora son 3 personas. Revisá y confirmá de nuevo.",
          });
          await expectNothingWritten(id);
        }
        expect(await started(id, { typedCount: 3 })).toMatchObject({
          eligible: 3,
        });
      });

      it("accepts a small drift below the threshold", async () => {
        state.typeToConfirm = 4;
        const festival = await festivalWith([
          await createUser(),
          await createUser(),
          await createUser(),
        ]);
        const id = await insertDraft(sender, { festivals: [festival.id] });

        expect(await started(id, { typedCount: 1 })).toMatchObject({
          eligible: 3,
        });
      });
    });
  });

  describe("a double click (V5)", () => {
    it("is one send: the second waits for the first and hears it is on its way", async () => {
      const ana = await createUser();
      const luis = await createUser();
      const id = await insertDraft(sender, { people: [ana, luis] });

      let holding!: (pid: number) => void;
      const firstPid = new Promise<number>((resolve) => {
        holding = resolve;
      });
      let commitFirst!: () => void;
      const firstMayCommit = new Promise<void>((resolve) => {
        commitFirst = resolve;
      });
      const realTransaction = appDb.transaction.bind(appDb);
      const hold = vi.spyOn(appDb, "transaction").mockImplementationOnce(((
        callback,
        config,
      ) =>
        realTransaction(async (tx) => {
          const result = await callback(tx);
          const { rows } = await tx.execute<{ pid: number }>(
            sql`select pg_backend_pid() as pid`,
          );
          holding(rows[0]!.pid);
          await firstMayCommit;
          return result;
        }, config)) as AppDb["transaction"]);

      const first = sendNow(id);
      try {
        const pid = await firstPid;
        const second = sendNow(id);
        second.catch(() => undefined);
        await waitUntilBlockedBy(pid);
        commitFirst();

        const [one, two] = await Promise.all([first, second]);
        if (one.kind !== "started") throw new Error("the first did not start");
        expect(two).toEqual({
          kind: "already_sent",
          comunicadoId: id,
          campaignId: one.campaignId,
        });
      } finally {
        commitFirst();
        hold.mockRestore();
        await first.catch(() => undefined);
      }

      const campaigns = await campaignsOf(id);
      expect(campaigns).toHaveLength(1);
      expect((await recipientsOf(campaigns[0]!.id)).size).toBe(2);
      expect(await rowOf(id)).toMatchObject({ status: "sent", version: 2 });
    });

    it("answers a later click with the campaign, whatever version it saw", async () => {
      const id = await insertDraft(sender, { people: [await createUser()] });
      const first = await started(id);

      expect(await sendNow(id, { expectedVersion: 1 })).toEqual({
        kind: "already_sent",
        comunicadoId: id,
        campaignId: first.campaignId,
      });
      expect(await campaignsOf(id)).toHaveLength(1);
    });
  });

  describe("what the send writes (A4–A6, D1)", () => {
    it("writes revision 1, the campaign from it, and the working copy as sent", async () => {
      const ana = await createUser();
      const id = await insertDraft(
        sender,
        { people: [ana] },
        {
          title: "  Cambio de horario de armado  ",
          doc: [
            {
              type: "heading",
              props: { level: 2 },
              content: [{ type: "text", text: "Nuevo horario", styles: {} }],
              children: [],
            },
            storedParagraph("El armado empieza a las 7:00."),
          ],
          actionLabel: "  Ver mi reserva ",
          actionPath: " /my_participations ",
          sendPush: true,
          scheduleMissedAt: new Date(Date.now() - DAY),
          scheduleMissedReason: "late",
          scheduleMissedDetail: "Se programó para ayer.",
        },
      );

      const result = await started(id);

      const [revision] = await integrationDb!
        .select()
        .from(comunicadoRevisions)
        .where(eq(comunicadoRevisions.comunicadoId, id));
      expect(revision).toMatchObject({
        revision: 1,
        title: "Cambio de horario de armado",
        actionLabel: "Ver mi reserva",
        actionPath: "/my_participations",
        editNote: null,
        createdByUserId: sender,
      });
      expect(revision!.html).toContain("<h2");
      expect(revision!.html).toContain("Nuevo horario");
      expect(revision!.html).toContain("El armado empieza a las 7:00.");
      expect(revision!.text).toContain("Nuevo horario");
      expect(revision!.text).toContain("El armado empieza a las 7:00.");
      expect(revision!.doc).toHaveLength(2);

      const [campaign] = await campaignsOf(id);
      expect(campaign).toMatchObject({
        id: result.campaignId,
        type: "comunicado",
        status: "processing",
        title: revision!.title,
        message: revision!.text,
        createdByUserId: sender,
        completedAt: null,
      });

      const row = await rowOf(id);
      expect(row).toMatchObject({
        status: "sent",
        version: 2,
        campaignId: result.campaignId,
        currentRevision: 1,
        sentByUserId: sender,
        updatedByUserId: sender,
        title: "Cambio de horario de armado",
        actionLabel: "Ver mi reserva",
        actionPath: "/my_participations",
        essential: false,
        essentialReason: null,
        essentialConfirmedByUserId: null,
        essentialConfirmedAt: null,
        // A draft back from a missed schedule can be sent.
        scheduleMissedAt: null,
        scheduleMissedReason: null,
        scheduleMissedDetail: null,
      });
      expect(row.sentAt).toBeInstanceOf(Date);
      expect(row.audienceSummary).toMatchObject({
        channels: { email: true, push: true },
      });
    });

    it("zeros the email split in the summary when email is not ticked", async () => {
      const ana = await createUser();
      const id = await insertDraft(
        sender,
        { people: [ana] },
        { sendEmail: false },
      );
      await started(id);

      expect((await rowOf(id)).audienceSummary).toMatchObject({
        channels: { email: false, push: false },
        email: {
          sendTo: 0,
          unsubscribedAnnouncements: 0,
          unsubscribedAll: 0,
          suppressed: 0,
          invalid: 0,
        },
      });
    });
  });

  describe("essential (B7)", () => {
    async function essentialDraft(
      to: Partial<ComunicadoAudience>,
      values: Partial<typeof comunicados.$inferInsert> = {},
    ) {
      return insertDraft(sender, to, {
        essential: true,
        essentialReason: `  ${REASON}  `,
        ...values,
      });
    }

    it.each([
      ["an upcoming festival", undefined],
      [
        "a festival that ended within the grace days",
        [
          {
            start: new Date(Date.now() - 4 * DAY),
            end: new Date(Date.now() - 3 * DAY),
          },
        ],
      ],
      ["a festival without dates, by its status", []],
    ])(
      "is allowed for one Confirmados list of %s, with email",
      async (_label, dates) => {
        const ana = await createUser();
        const festival = await festivalWith([ana], {}, dates);
        const id = await essentialDraft({ festivals: [festival.id] });

        // Typed even for one person.
        expect(await refusalOf(sendNow(id))).toMatchObject({
          code: "AUDIENCE_CHANGED",
          message:
            "La audiencia cambió: ahora es 1 persona. Revisá y confirmá de nuevo.",
        });
        await started(id, { typedCount: 1 });

        const row = await rowOf(id);
        expect(row).toMatchObject({
          essential: true,
          essentialReason: REASON,
          essentialConfirmedByUserId: sender,
          sentByUserId: sender,
        });
        expect(row.essentialConfirmedAt).toBeInstanceOf(Date);
        expect(row.audienceSummary).toMatchObject({
          essentialFestival: { id: festival.id, name: festival.name },
        });
      },
    );

    it.each([
      [
        "a festival and a list",
        async () => {
          const ana = await createUser();
          return {
            to: {
              festivals: [(await festivalWith([ana])).id],
              lists: [(await createFixedList([ana])).id],
            },
          };
        },
      ],
      [
        "a festival and someone picked by name",
        async () => {
          const ana = await createUser();
          return {
            to: {
              festivals: [(await festivalWith([ana])).id],
              people: [await createUser()],
            },
          };
        },
      ],
      ["people alone", async () => ({ to: { people: [await createUser()] } })],
      [
        "an archived festival",
        async () => ({
          to: {
            festivals: [
              (await festivalWith([await createUser()], { status: "archived" }))
                .id,
            ],
          },
        }),
      ],
      [
        "a festival that ended more than 7 days ago",
        async () => ({
          to: {
            festivals: [
              (
                await festivalWith([await createUser()], {}, [
                  {
                    start: new Date(Date.now() - 9 * DAY),
                    end: new Date(Date.now() - 8 * DAY),
                  },
                ])
              ).id,
            ],
          },
        }),
      ],
      [
        "a festival without email",
        async () => ({
          to: { festivals: [(await festivalWith([await createUser()])).id] },
          values: { sendEmail: false },
        }),
      ],
    ])("is refused for %s", async (_label, make) => {
      const { to, values } = (await make()) as {
        to: Partial<ComunicadoAudience>;
        values?: Partial<typeof comunicados.$inferInsert>;
      };
      const id = await essentialDraft(to, values);

      expect(await refusalOf(sendNow(id, { typedCount: 1 }))).toMatchObject({
        code: "ESSENTIAL_NOT_ALLOWED",
        message:
          "Solo un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo, puede ser esencial.",
      });
      await expectNothingWritten(id);
    });

    it("reaches the announcements opt-outs, never an `all` opt-out or a suppression, and records both counts", async () => {
      const plain = await createUser();
      const optedOut = await createUser();
      const optedOutAll = await createUser();
      const bounced = await createUser();
      await unsubscribe(optedOut, "announcements");
      await unsubscribe(optedOutAll, "all");
      await suppress(bounced);
      const holders = [plain, optedOut, optedOutAll, bounced];

      const normal = await insertDraft(sender, {
        festivals: [(await festivalWith(holders)).id],
      });
      await started(normal);
      expect((await rowOf(normal)).audienceSummary).toMatchObject({
        email: {
          sendTo: 1,
          unsubscribedAnnouncements: 1,
          unsubscribedAll: 1,
          suppressed: 1,
          invalid: 0,
        },
        essentialFestival: null,
        essentialOverride: 0,
        essentialNotOverridden: 0,
      });

      const essential = await essentialDraft({
        festivals: [(await festivalWith(holders)).id],
      });
      await started(essential, { typedCount: 4 });
      expect((await rowOf(essential)).audienceSummary).toMatchObject({
        willReceive: 4,
        email: {
          sendTo: 2,
          unsubscribedAnnouncements: 0,
          unsubscribedAll: 1,
          suppressed: 1,
          invalid: 0,
        },
        essentialOverride: 1,
        essentialNotOverridden: 2,
      });
    });

    it("keeps who confirmed it for good (A4)", async () => {
      const festival = await festivalWith([await createUser()]);
      const id = await essentialDraft({ festivals: [festival.id] });
      await started(id, { typedCount: 1 });

      state.viewer = { id: await createUser({ role: "admin" }), role: "admin" };
      expect(
        await userActions.deleteProfile(sender, {
          success: false,
          message: "",
        }),
      ).toEqual({
        success: false,
        message:
          "No se puede eliminar un perfil con registros administrativos vinculados.",
      });
      expect(deleteClerkUser).not.toHaveBeenCalled();
      const deletions = await integrationDb!
        .select({ id: pendingUserDeletions.id })
        .from(pendingUserDeletions)
        .where(eq(pendingUserDeletions.userId, sender));
      expect(deletions).toEqual([]);

      await expect(
        pool!.query("DELETE FROM users WHERE id = $1", [sender]),
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "comunicados_essential_confirmed_by_user_id_users_id_fk",
      });
    });
  });

  describe("a profile deletion racing the snapshot (B4, F4)", () => {
    it("waits for the deletion, retries once, and leaves the deleted person out", async () => {
      const ana = await createUser();
      const doomed = await createUser();
      const list = await createFixedList([ana, doomed]);
      const id = await insertDraft(sender, { lists: [list.id] });

      const deleter: PoolClient = await pool!.connect();
      const transaction = vi.spyOn(appDb, "transaction");
      let sending: Promise<unknown> | null = null;
      try {
        await deleter.query("BEGIN");
        await deleter.query("DELETE FROM users WHERE id = $1", [doomed]);
        const { rows } = await deleter.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        sending = sendNow(id);
        sending.catch(() => undefined);
        await waitUntilBlockedBy(rows[0]!.pid);
        await deleter.query("COMMIT");
      } finally {
        await deleter.query("ROLLBACK").catch(() => undefined);
        deleter.release();
      }

      const result = (await sending) as Awaited<ReturnType<typeof sendNow>>;
      if (result.kind !== "started") throw new Error("not started");
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(await recipientsOf(result.campaignId)).toEqual(
        new Map([[ana, pending("list")]]),
      );
      expect(result).toMatchObject({ eligible: 1, willReceive: 1 });
      expect(await campaignsOf(id)).toHaveLength(1);
    });
  });

  describe("scheduled sends (D1, D-17)", () => {
    async function scheduledDraft(
      schedulerId: number | null,
      at: Date,
      values: Partial<typeof comunicados.$inferInsert> = {},
    ) {
      return insertDraft(
        sender,
        { people: [await createUser()] },
        {
          status: "scheduled",
          scheduledAt: at,
          scheduledByUserId: schedulerId,
          ...values,
        },
      );
    }

    // A release names no sender: it sends as whoever scheduled it.
    function release(id: number) {
      return appDb.transaction((tx) =>
        send.startComunicadoSend(tx, id, { trigger: "schedule" }),
      );
    }

    it("releases nothing that is not scheduled and due", async () => {
      const draft = await insertDraft(sender, { people: [await createUser()] });
      const later = await scheduledDraft(sender, new Date(Date.now() + DAY));

      expect(await release(draft)).toEqual({ kind: "not_due" });
      expect(await release(later)).toEqual({ kind: "not_due" });
      expect(await rowOf(later)).toMatchObject({
        status: "scheduled",
        campaignId: null,
      });
    });

    it("refuses a schedule whose admin no longer is one", async () => {
      const former = await createUser({ role: "admin" });
      const id = await scheduledDraft(former, new Date(Date.now() - 60_000));
      await integrationDb!
        .update(users)
        .set({ role: "user" })
        .where(eq(users.id, former));

      expect(await refusalOf(release(id))).toMatchObject({
        code: "SENDER_NOT_ADMIN",
        message:
          "La persona que lo programó ya no es administradora, así que no se envió.",
      });
      const orphaned = await scheduledDraft(
        null,
        new Date(Date.now() - 60_000),
      );
      expect(await refusalOf(release(orphaned))).toMatchObject({
        code: "SENDER_NOT_ADMIN",
      });
    });

    it("sends a due one without a typed count, keeping its essential confirmation", async () => {
      state.typeToConfirm = 1;
      const confirmedAt = new Date("2026-10-20T15:00:00Z");
      const festival = await festivalWith([await createUser()]);
      const id = await insertDraft(
        sender,
        { festivals: [festival.id] },
        {
          status: "scheduled",
          scheduledAt: new Date(Date.now() - 60_000),
          scheduledByUserId: sender,
          essential: true,
          essentialReason: REASON,
          essentialConfirmedByUserId: sender,
          essentialConfirmedAt: confirmedAt,
        },
      );

      expect(await release(id)).toMatchObject({ kind: "started", eligible: 1 });
      expect(await rowOf(id)).toMatchObject({
        status: "sent",
        sentByUserId: sender,
        essentialConfirmedByUserId: sender,
        essentialConfirmedAt: confirmedAt,
      });
    });

    it("sends as whoever scheduled it, not as its author", async () => {
      const scheduler = await createUser({ role: "admin" });
      const id = await scheduledDraft(scheduler, new Date(Date.now() - 60_000));

      const result = await release(id);
      if (result.kind !== "started") throw new Error("not started");
      expect(await rowOf(id)).toMatchObject({
        status: "sent",
        createdByUserId: sender,
        sentByUserId: scheduler,
        updatedByUserId: scheduler,
      });
      const [campaign] = await campaignsOf(id);
      expect(campaign).toMatchObject({
        id: result.campaignId,
        createdByUserId: scheduler,
      });
      const [revision] = await integrationDb!
        .select()
        .from(comunicadoRevisions)
        .where(eq(comunicadoRevisions.comunicadoId, id));
      expect(revision).toMatchObject({
        revision: 1,
        createdByUserId: scheduler,
      });
    });

    it("refuses one more than an hour late before asking who scheduled it (E4)", async () => {
      const former = await createUser({ role: "admin" });
      const late = await scheduledDraft(
        former,
        new Date(Date.now() - 61 * 60_000),
      );
      const orphaned = await scheduledDraft(
        null,
        new Date(Date.now() - 61 * 60_000),
      );
      await integrationDb!
        .update(users)
        .set({ role: "user" })
        .where(eq(users.id, former));

      for (const id of [late, orphaned]) {
        expect(await refusalOf(release(id))).toMatchObject({
          code: "LATE",
          message: "Se atrasó más de una hora, así que no se envió.",
          eligible: null,
        });
        expect(await rowOf(id)).toMatchObject({
          status: "scheduled",
          version: 1,
          campaignId: null,
        });
      }

      // Within the hour it still goes out.
      const onTime = await scheduledDraft(
        sender,
        new Date(Date.now() - 59 * 60_000),
      );
      expect(await release(onTime)).toMatchObject({ kind: "started" });
    });

    it("lets «Enviar ahora» send a scheduled one at the version it saw", async () => {
      const id = await scheduledDraft(sender, new Date(Date.now() + DAY));
      expect(await started(id)).toMatchObject({ kind: "started" });
      expect(await rowOf(id)).toMatchObject({ status: "sent" });
    });
  });

  describe("gifts never see a comunicado (A6)", () => {
    it("is left out of the gift list, the gift report and the gift resume", async () => {
      const ana = await createUser();
      const id = await insertDraft(sender, { people: [ana] });
      const { campaignId } = await started(id);
      state.viewer = { id: sender, role: "admin" };

      const gifts = await giftQueries.listCreditGifts();
      expect(gifts!.map((gift) => gift.id)).not.toContain(campaignId);
      expect(await giftQueries.fetchCreditGift(campaignId)).toBeNull();

      await giftService.resumeProcessingCreditGifts({ budgetMs: 2_000 });
      expect(await recipientsOf(campaignId)).toEqual(
        new Map([[ana, pending("person")]]),
      );
      const [campaign] = await campaignsOf(id);
      expect(campaign!.status).toBe("processing");
      const inbox = await integrationDb!
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.campaignId, campaignId));
      expect(inbox).toEqual([]);
    });
  });

  describe("sendComunicadoNowAction", () => {
    it("sends as the acting admin, logs ids and counts, and drains after the answer", async () => {
      state.viewer = { id: sender, role: "admin" };
      const ana = await createUser();
      const id = await insertDraft(sender, { people: [ana] });
      const before = Date.now();

      expect(
        await sendActions.sendComunicadoNowAction({
          comunicadoId: id,
          expectedVersion: 1,
          typedCount: null,
        }),
      ).toEqual({
        success: true,
        alreadySent: false,
        message: "Lo estamos enviando.",
      });
      const row = await rowOf(id);
      expect(row).toMatchObject({ status: "sent", sentByUserId: sender });
      expect(consoleLog).toHaveBeenCalledWith("[comunicados] send", {
        comunicadoId: id,
        eligible: 1,
        skipped: 0,
        narrowed: false,
      });
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/communications");
      expect(revalidatePath).toHaveBeenCalledWith(
        `/dashboard/communications/${id}`,
      );

      expect(afterMock).toHaveBeenCalledTimes(1);
      await afterMock.mock.calls[0]![0]();
      const [work] = runWorkMock.mock.calls[0]!;
      expect(work).toMatchObject({
        scope: { campaignId: row.campaignId },
        trigger: "send",
      });
      expect(work.deadline).toBeGreaterThanOrEqual(before + 85_000);
      expect(work.deadline).toBeLessThanOrEqual(Date.now() + 85_000);

      expect(
        await sendActions.sendComunicadoNowAction({
          comunicadoId: id,
          expectedVersion: 1,
          typedCount: null,
        }),
      ).toEqual({
        success: true,
        alreadySent: true,
        message: "Este comunicado ya se está enviando.",
      });
      expect(afterMock).toHaveBeenCalledTimes(1);
    });

    it("refuses a festival admin, and an admin while the flag is off, sending nothing", async () => {
      const id = await insertDraft(sender, { people: [await createUser()] });
      const input = { comunicadoId: id, expectedVersion: 1, typedCount: null };

      state.viewer = {
        id: await createUser({ role: "festival_admin" }),
        role: "festival_admin",
      };
      expect(await sendActions.sendComunicadoNowAction(input)).toEqual({
        success: false,
        code: "FORBIDDEN",
        message: "No autorizado.",
      });
      state.viewer = { id: sender, role: "admin" };
      state.flagOn = false;
      expect(await sendActions.sendComunicadoNowAction(input)).toMatchObject({
        success: false,
        code: "FORBIDDEN",
      });
      await expectNothingWritten(id);
      expect(afterMock).not.toHaveBeenCalled();
    });

    it("answers a refusal with its code and message", async () => {
      state.viewer = { id: sender, role: "admin" };
      const id = await insertDraft(sender, { people: [await createUser()] });

      expect(
        await sendActions.sendComunicadoNowAction({
          comunicadoId: id,
          expectedVersion: 5,
          typedCount: null,
        }),
      ).toEqual({
        success: false,
        code: "STALE",
        message:
          "El borrador cambió desde que abriste la confirmación. Revisalo y confirmá de nuevo.",
      });
      expect(afterMock).not.toHaveBeenCalled();
    });
  });

  describe("loadComunicadoSendConfirmationAction (G5)", () => {
    it("counts the stored draft as the send would, without writing", async () => {
      state.vercelEnv = "preview";
      state.viewer = { id: sender, role: "admin" };
      const holder = await createUser();
      const zoe = await createUser({ name: "Zoe Rojas" });
      const ana = await createUser({ name: "Ana Pérez" });
      const banned = await createUser({ status: "banned", name: "Beto" });
      const festival = await festivalWith([holder]);
      const people = [zoe, ana, banned];
      const id = await insertDraft(
        sender,
        { festivals: [festival.id], people },
        { sendPush: true },
      );

      const result = await sendActions.loadComunicadoSendConfirmationAction(id);
      if (!result.success) throw new Error(result.message);
      const expected = await audienceModule.summarizeComunicadoAudience(
        appDb,
        audience({ festivals: [festival.id], people }),
        { narrow: true, essential: false, sendEmail: true },
      );
      expect(result.confirmation).toEqual({
        comunicadoId: id,
        version: 1,
        title: "Cambio de horario de armado",
        sendEmail: true,
        sendPush: true,
        essential: false,
        essentialReason: null,
        essentialFestivalName: null,
        preview: expected,
        pickedReceiving: { count: 2, names: ["Ana Pérez", "Zoe Rojas"] },
        typedRequired: false,
        env: "preview",
        notificationsLaunched: false,
        problem: null,
      });
      expect(expected).toMatchObject({ eligible: 3, narrowed: true });
      await expectNothingWritten(id);

      await started(id);
      expect(
        await sendActions.loadComunicadoSendConfirmationAction(id),
      ).toEqual({ success: false, message: "Este comunicado ya se envió." });
    });

    it("says what the send would refuse", async () => {
      state.viewer = { id: sender, role: "admin" };
      const banned = await createUser({ status: "banned" });
      const nobody = await insertDraft(sender, { people: [banned] });
      const result =
        await sendActions.loadComunicadoSendConfirmationAction(nobody);
      expect(result).toMatchObject({
        success: true,
        confirmation: {
          problem: "Nadie de esta audiencia puede recibirlo.",
          preview: { eligible: 0, skippedTotal: 1 },
        },
      });

      const unreadable = await insertDraft(
        sender,
        {},
        { audience: { festivals: "todos" } as unknown as ComunicadoAudience },
      );
      expect(
        await sendActions.loadComunicadoSendConfirmationAction(unreadable),
      ).toMatchObject({
        success: true,
        confirmation: {
          problem:
            "No pudimos leer los destinatarios guardados. Elegilos de nuevo.",
          preview: { eligible: 0, sources: [] },
          pickedReceiving: { count: 0, names: [] },
        },
      });
    });

    it("is for global admins with the flag only", async () => {
      const id = await insertDraft(sender, { people: [await createUser()] });
      state.viewer = {
        id: await createUser({ role: "festival_admin" }),
        role: "festival_admin",
      };
      expect(
        await sendActions.loadComunicadoSendConfirmationAction(id),
      ).toEqual({ success: false, message: "No autorizado." });
    });
  });
});
