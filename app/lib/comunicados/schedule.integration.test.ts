// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
import {
  CANCEL_ALREADY_DRAFT_MESSAGE,
  CANCEL_SENT_MESSAGE,
  CANCELLED_TOAST,
  RESCHEDULE_NOT_SCHEDULED_MESSAGE,
  RESCHEDULE_SENT_MESSAGE,
  rescheduledToast,
  SCHEDULE_DEVELOPMENT_REFUSAL,
  SCHEDULE_STALE_MESSAGE,
  scheduledToast,
} from "@/app/lib/comunicados/schedule-copy";
import { SCHEDULE_DATE_MESSAGES } from "@/app/lib/comunicados/schedule-rules";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  festivalDates,
  festivals,
  notificationCampaigns,
  notifications,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * "Programar", "Cambiar fecha" and "Cancelar programación" against a real
 * database (docs/IMPLEMENTATION-comunicados.md E1, E3, E5, G2): the send's
 * checks under the draft's lock, the content written as the release reads
 * it, the essential confirmation recorded and cleared, each compare-and-set
 * losing to the others and to a send, and development never scheduling.
 * Releasing is another file's. Every assertion is about this file's own
 * rows, and each test removes them when it ends.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
// Nothing here sends email; a send only renders it to measure it.
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: vi.fn(),
}));

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

type Schedule = typeof import("@/app/lib/comunicados/schedule");
type ScheduleActions = typeof import("@/app/lib/comunicados/schedule-actions");
type Send = typeof import("@/app/lib/comunicados/send");
type Drafts = typeof import("@/app/lib/comunicados/drafts");
let scheduleMod: Schedule;
let scheduleActions: ScheduleActions;
let send: Send;
let drafts: Drafts;

const BASE_URL = "https://glitter.test";
const MISSING_ID = 2_147_483_000;
const MINUTE = 60_000;
const DAY = 24 * 3600_000;
const REASON = "El armado se adelanta a las 7:00 por la lluvia";
const LONG_AGO = new Date("2001-01-01T00:00:00Z");
const NOT_FOUND = "No encontramos este comunicado.";

const created = {
  users: [] as number[],
  festivals: [] as number[],
  stands: [] as number[],
  reservations: [] as number[],
  comunicados: [] as number[],
};

type UserFixture = Partial<typeof users.$inferInsert>;

async function createUser(fixture: UserFixture = {}) {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `schedule-${suffix}`,
      email: `schedule-${suffix}@example.com`,
      displayName: `Programa ${suffix.slice(0, 8)}`,
      role: "user",
      status: "verified",
      ...fixture,
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

let standNumber = 9400;

/** An upcoming festival whose Confirmados list is exactly `holders`. */
async function festivalWith(holders: number[]) {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Programa ${randomUUID()}`, status: "active" })
    .returning({ id: festivals.id });
  created.festivals.push(festival!.id);
  await integrationDb!.insert(festivalDates).values({
    festivalId: festival!.id,
    startDate: new Date(Date.now() + 10 * DAY),
    endDate: new Date(Date.now() + 11 * DAY),
  });
  for (const owner of holders) {
    const [stand] = await integrationDb!
      .insert(stands)
      .values({ standNumber: standNumber++, festivalId: festival!.id })
      .returning({ id: stands.id });
    created.stands.push(stand!.id);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({
        standId: stand!.id,
        festivalId: festival!.id,
        status: "accepted",
        ownerUserId: owner,
      })
      .returning({ id: standReservations.id });
    created.reservations.push(reservation!.id);
    await integrationDb!
      .insert(reservationParticipants)
      .values({ userId: owner, reservationId: reservation!.id });
  }
  return festival!.id;
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

let author: number;

/** A draft ready to send to `to`, last saved long ago. */
async function insertDraft(
  to: Partial<ComunicadoAudience>,
  values: Partial<typeof comunicados.$inferInsert> = {},
) {
  const [row] = await integrationDb!
    .insert(comunicados)
    .values({
      title: "Cambio de horario de armado",
      doc: [storedParagraph("El armado empieza a las 8:00.")],
      audience: audience(to),
      createdByUserId: author,
      updatedByUserId: author,
      updatedAt: LONG_AGO,
      ...values,
    })
    .returning({ id: comunicados.id });
  created.comunicados.push(row!.id);
  return row!.id;
}

/** A draft to one verified person. */
async function plainDraft(
  values: Partial<typeof comunicados.$inferInsert> = {},
) {
  return insertDraft({ people: [await createUser()] }, values);
}

/** An essential draft to one upcoming festival's Confirmados. */
async function essentialDraft() {
  return insertDraft(
    { festivals: [await festivalWith([await createUser()])] },
    { essential: true, essentialReason: `  ${REASON}  ` },
  );
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
    .select({ id: notificationCampaigns.id })
    .from(notificationCampaigns)
    .where(
      eq(notificationCampaigns.idempotencyKey, `comunicado:${comunicadoId}`),
    );
}

function inDays(days: number) {
  return new Date(Date.now() + days * DAY);
}

let scheduler: number;

function schedule(
  id: number,
  values: {
    expectedVersion?: number;
    at?: Date;
    typedCount?: number | null;
    by?: number;
    nowMs?: number;
  } = {},
) {
  return scheduleMod.scheduleComunicado({
    comunicadoId: id,
    by: values.by ?? scheduler,
    expectedVersion: values.expectedVersion ?? 1,
    scheduledAt: values.at ?? inDays(1),
    typedCount: values.typedCount ?? null,
    nowMs: values.nowMs,
  });
}

async function scheduled(
  id: number,
  values: Parameters<typeof schedule>[1] = {},
) {
  const outcome = await schedule(id, values);
  if (!outcome.ok) throw new Error(`not scheduled: ${outcome.message}`);
  return outcome;
}

function reschedule(
  id: number,
  expectedVersion: number,
  at: Date,
  by = scheduler,
) {
  return scheduleMod.rescheduleComunicado({
    comunicadoId: id,
    by,
    expectedVersion,
    scheduledAt: at,
  });
}

function cancel(id: number, by = scheduler) {
  return scheduleMod.cancelComunicadoSchedule({ comunicadoId: id, by });
}

/** "Enviar ahora" on it, as the admin who scheduled it. */
async function sendNow(id: number, expectedVersion: number) {
  const result = await send.sendComunicadoNow({
    comunicadoId: id,
    by: scheduler,
    expectedVersion,
    typedCount: null,
  });
  expect(result.kind).toBe("started");
}

/** The draft as it was inserted: no schedule and nothing sent. */
async function expectUntouchedDraft(id: number) {
  expect(await rowOf(id)).toMatchObject({
    status: "draft",
    version: 1,
    scheduledAt: null,
    scheduledByUserId: null,
    essentialConfirmedByUserId: null,
    essentialConfirmedAt: null,
    updatedAt: LONG_AGO,
    campaignId: null,
  });
  expect(await campaignsOf(id)).toEqual([]);
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

describeDatabase("scheduling a comunicado", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    scheduleMod = await import("@/app/lib/comunicados/schedule");
    scheduleActions = await import("@/app/lib/comunicados/schedule-actions");
    send = await import("@/app/lib/comunicados/send");
    drafts = await import("@/app/lib/comunicados/drafts");

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
    author = await createUser({ role: "admin" });
    scheduler = await createUser({ role: "admin" });
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

  describe("Programar (E1, E3)", () => {
    it.each([
      [
        "an empty one, as the autosave stores a switched-on button",
        "",
        "",
        null,
        null,
      ],
      [
        "one with spaces around it",
        "  Ver tu stand ",
        " /my_participations ",
        "Ver tu stand",
        "/my_participations",
      ],
    ])(
      "schedules a draft as the acting admin, writing its title and button %s as the release reads them",
      async (_label, actionLabel, actionPath, label, path) => {
        const id = await plainDraft({
          title: "  Cambio de horario de armado  ",
          actionLabel,
          actionPath,
          essentialReason: "  Lo había marcado esencial  ",
        });
        const at = inDays(2);

        expect(await schedule(id, { at })).toEqual({
          ok: true,
          version: 2,
          scheduledAt: at,
        });

        const row = await rowOf(id);
        expect(row).toMatchObject({
          status: "scheduled",
          scheduledAt: at,
          scheduledByUserId: scheduler,
          title: "Cambio de horario de armado",
          actionLabel: label,
          actionPath: path,
          // Kept only while essential, as the send writes it.
          essentialReason: null,
          essential: false,
          essentialConfirmedByUserId: null,
          essentialConfirmedAt: null,
          scheduleMissedAt: null,
          version: 2,
          updatedByUserId: scheduler,
          createdByUserId: author,
          campaignId: null,
          sentAt: null,
        });
        expect(row.updatedAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
        // Counted, not snapshotted: the release resolves it again (E3).
        expect(await campaignsOf(id)).toEqual([]);
        expect(consoleLog).toHaveBeenCalledWith("[comunicados] schedule", {
          comunicadoId: id,
          eligible: 1,
        });
      },
    );

    it("records an essential one's confirmation now, since nobody confirms at release", async () => {
      const id = await essentialDraft();

      // Typed even for one person.
      expect(await schedule(id)).toEqual({
        ok: false,
        code: "AUDIENCE_CHANGED",
        message:
          "La audiencia cambió: ahora es 1 persona. Revisá y confirmá de nuevo.",
      });
      await scheduled(id, { typedCount: 1 });

      const row = await rowOf(id);
      expect(row).toMatchObject({
        status: "scheduled",
        essential: true,
        essentialReason: REASON,
        essentialConfirmedByUserId: scheduler,
      });
      expect(row.essentialConfirmedAt).toBeInstanceOf(Date);
    });

    it("schedules a draft back from a missed schedule afresh, as the admin scheduling it now", async () => {
      const before = await createUser({ role: "admin" });
      const id = await plainDraft({
        scheduledByUserId: before,
        scheduleMissedAt: new Date(Date.now() - DAY),
        scheduleMissedReason: "empty",
        scheduleMissedDetail:
          "Al enviarlo, nadie de la audiencia podía recibirlo. Quedó como borrador.",
      });

      await scheduled(id);

      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        scheduledByUserId: scheduler,
        scheduleMissedAt: null,
        scheduleMissedReason: null,
        scheduleMissedDetail: null,
      });
    });

    it("refuses a draft that changed since the dialog opened, and one no longer a draft", async () => {
      const id = await plainDraft();
      const stale = {
        ok: false,
        code: "STALE",
        message: SCHEDULE_STALE_MESSAGE,
      };

      expect(await schedule(id, { expectedVersion: 2 })).toEqual(stale);
      await expectUntouchedDraft(id);

      const first = inDays(1);
      await scheduled(id, { at: first });
      // A second click, and a tab that saw the new version.
      expect(await schedule(id, { at: inDays(3) })).toEqual(stale);
      expect(await schedule(id, { expectedVersion: 2, at: inDays(3) })).toEqual(
        stale,
      );
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        version: 2,
        scheduledAt: first,
      });

      // The version is the answer before the content is: the admin is
      // looking at something else.
      const changed = await plainDraft({ title: "   " });
      expect(await schedule(changed, { expectedVersion: 2 })).toEqual(stale);
    });

    it("does not find a comunicado that does not exist", async () => {
      expect(await schedule(MISSING_ID)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: NOT_FOUND,
      });
    });

    it.each([
      [
        "content that would not send",
        { title: "   " },
        "INVALID_CONTENT",
        "Escribí un título.",
      ],
      [
        "an empty audience",
        { audience: audience({}) },
        "INVALID_AUDIENCE",
        "Elegí al menos una lista o una persona.",
      ],
    ] as const)(
      "refuses %s, as the send would",
      async (_label, values, code, message) => {
        const id = await plainDraft(values);

        expect(await schedule(id)).toEqual({ ok: false, code, message });
        await expectUntouchedDraft(id);
      },
    );

    it("counts the cap before narrowing, so a preview refuses what production would", async () => {
      state.vercelEnv = "preview";
      state.maxRecipients = 2;
      const festival = await festivalWith([
        await createUser(),
        await createUser(),
        await createUser(),
      ]);
      const id = await insertDraft({ festivals: [festival] });

      expect(await schedule(id)).toEqual({
        ok: false,
        code: "AUDIENCE_TOO_LARGE",
        message:
          "Por ahora un comunicado llega a 2 personas como máximo. Achicá la audiencia con una lista más precisa.",
      });
      await expectUntouchedDraft(id);

      state.maxRecipients = 3;
      await scheduled(id);
    });

    it("refuses an audience nobody in can receive it", async () => {
      const festival = await festivalWith([
        await createUser({ status: "banned" }),
        await createUser({ status: "pending" }),
      ]);
      const id = await insertDraft({ festivals: [festival] });

      expect(await schedule(id)).toEqual({
        ok: false,
        code: "NO_ELIGIBLE_RECIPIENTS",
        message: "Nadie de esta audiencia puede recibirlo.",
      });
      await expectUntouchedDraft(id);
    });

    it("asks for the count from the threshold up, and accepts a drift below it", async () => {
      state.typeToConfirm = 2;
      const holders = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      const id = await insertDraft({
        festivals: [await festivalWith(holders)],
      });

      for (const typedCount of [2, null]) {
        expect(await schedule(id, { typedCount })).toEqual({
          ok: false,
          code: "AUDIENCE_CHANGED",
          message:
            "La audiencia cambió: ahora son 3 personas. Revisá y confirmá de nuevo.",
        });
        await expectUntouchedDraft(id);
      }
      await scheduled(id, { typedCount: 3 });

      state.typeToConfirm = 4;
      const below = await insertDraft({
        festivals: [await festivalWith(holders)],
      });
      await scheduled(below, { typedCount: 1 });
    });

    it("refuses a time too soon, too far or unreadable, on the server's clock", async () => {
      const id = await plainDraft();
      const nowMs = Date.now();

      for (const [at, message] of [
        [new Date(nowMs - MINUTE), SCHEDULE_DATE_MESSAGES.tooSoon],
        [new Date(nowMs + 4 * MINUTE), SCHEDULE_DATE_MESSAGES.tooSoon],
        [new Date(nowMs + 61 * DAY), SCHEDULE_DATE_MESSAGES.tooFar],
        [new Date(Number.NaN), SCHEDULE_DATE_MESSAGES.invalid],
      ] as const) {
        expect(await schedule(id, { at, nowMs })).toEqual({
          ok: false,
          code: "INVALID_DATE",
          message,
        });
      }
      await expectUntouchedDraft(id);

      // Exactly five minutes ahead is allowed.
      const at = new Date(nowMs + 5 * MINUTE);
      expect(await schedule(id, { at, nowMs })).toMatchObject({
        ok: true,
        scheduledAt: at,
      });
    });
  });

  describe("Cambiar fecha (E1, D9)", () => {
    it("moves the time at the version shown, still sent by whoever scheduled it", async () => {
      const id = await plainDraft();
      await scheduled(id);
      const other = await createUser({ role: "admin" });
      const later = inDays(5);

      expect(await reschedule(id, 2, later, other)).toEqual({
        ok: true,
        version: 3,
        scheduledAt: later,
      });
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        scheduledAt: later,
        scheduledByUserId: scheduler,
        updatedByUserId: other,
        version: 3,
      });
      expect(consoleLog).toHaveBeenCalledWith("[comunicados] reschedule", {
        comunicadoId: id,
      });

      // A tab that saw the previous version.
      expect(await reschedule(id, 2, inDays(6))).toEqual({
        ok: false,
        code: "STALE",
        message: SCHEDULE_STALE_MESSAGE,
      });
      expect(await rowOf(id)).toMatchObject({ scheduledAt: later, version: 3 });
    });

    it("moves one about to fall due, or already due and not yet released: only the new time is checked", async () => {
      for (const dueIn of [MINUTE, -30_000]) {
        const id = await plainDraft({
          status: "scheduled",
          scheduledAt: new Date(Date.now() + dueIn),
          scheduledByUserId: scheduler,
        });
        const at = inDays(1);

        expect(await reschedule(id, 1, at)).toEqual({
          ok: true,
          version: 2,
          scheduledAt: at,
        });
      }
    });

    it("refuses a new time too soon", async () => {
      const id = await plainDraft();
      const { scheduledAt } = await scheduled(id);

      expect(await reschedule(id, 2, new Date(Date.now() + MINUTE))).toEqual({
        ok: false,
        code: "INVALID_DATE",
        message: SCHEDULE_DATE_MESSAGES.tooSoon,
      });
      expect(await rowOf(id)).toMatchObject({ scheduledAt, version: 2 });
    });

    it("refuses once it started sending, once it is a draft again, and one that is gone", async () => {
      const id = await plainDraft();
      await scheduled(id);
      await sendNow(id, 2);

      expect(await reschedule(id, 3, inDays(2))).toEqual({
        ok: false,
        code: "NOT_SCHEDULED",
        message: RESCHEDULE_SENT_MESSAGE,
      });
      expect(await rowOf(id)).toMatchObject({ status: "sent", version: 3 });

      const draft = await plainDraft();
      expect(await reschedule(draft, 1, inDays(2))).toEqual({
        ok: false,
        code: "NOT_SCHEDULED",
        message: RESCHEDULE_NOT_SCHEDULED_MESSAGE,
      });
      await expectUntouchedDraft(draft);

      expect(await reschedule(MISSING_ID, 1, inDays(2))).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: NOT_FOUND,
      });
    });
  });

  describe("Cancelar programación (E1, D10)", () => {
    it("puts it back to a draft without its scheduler or its essential confirmation, which an autosave can then untick", async () => {
      const id = await essentialDraft();
      await scheduled(id, { typedCount: 1 });
      const other = await createUser({ role: "admin" });

      expect(await cancel(id, other)).toEqual({
        ok: true,
        version: 3,
        alreadyDraft: false,
      });
      expect(await rowOf(id)).toMatchObject({
        status: "draft",
        scheduledAt: null,
        scheduledByUserId: null,
        essential: true,
        essentialReason: REASON,
        essentialConfirmedByUserId: null,
        essentialConfirmedAt: null,
        updatedByUserId: other,
        version: 3,
      });
      expect(consoleLog).toHaveBeenCalledWith(
        "[comunicados] schedule cancelled",
        { comunicadoId: id },
      );

      // With the confirmation left behind, this would break the CHECK.
      const row = await rowOf(id);
      expect(
        await drafts.saveComunicadoDraft(
          {
            comunicadoId: id,
            expectedVersion: 3,
            saveKey: randomUUID(),
            title: row.title,
            doc: row.doc,
            actionLabel: null,
            actionPath: null,
            sendEmail: true,
            sendPush: false,
            audience: row.audience,
            essential: false,
            essentialReason: null,
          },
          author,
        ),
      ).toMatchObject({ ok: true, version: 4 });

      // And it can be scheduled again.
      await scheduled(id, { expectedVersion: 4 });
    });

    it("answers one that is already a draft as done, changing nothing", async () => {
      const id = await plainDraft();

      expect(await cancel(id)).toEqual({
        ok: true,
        version: 1,
        alreadyDraft: true,
      });
      await expectUntouchedDraft(id);
    });

    it("refuses once it started sending, and one that is gone", async () => {
      const id = await plainDraft();
      await scheduled(id);
      await sendNow(id, 2);

      expect(await cancel(id)).toEqual({
        ok: false,
        code: "NOT_SCHEDULED",
        message: CANCEL_SENT_MESSAGE,
      });
      expect(await rowOf(id)).toMatchObject({ status: "sent", version: 3 });

      expect(await cancel(MISSING_ID)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: NOT_FOUND,
      });
    });
  });

  describe("development (E1, K9)", () => {
    it("refuses Programar and Cambiar fecha before anything else, and lets Cancelar stop one", async () => {
      state.vercelEnv = "development";
      const development = {
        ok: false,
        code: "DEVELOPMENT",
        message: SCHEDULE_DEVELOPMENT_REFUSAL,
      };

      const draft = await plainDraft();
      expect(await schedule(draft)).toEqual(development);
      expect(await schedule(draft, { at: new Date(Date.now() - DAY) })).toEqual(
        development,
      );
      await expectUntouchedDraft(draft);

      // One scheduled from somewhere else, in a database this server shares.
      const at = inDays(1);
      const id = await plainDraft({
        status: "scheduled",
        scheduledAt: at,
        scheduledByUserId: scheduler,
      });
      expect(await reschedule(id, 1, inDays(2))).toEqual(development);
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        scheduledAt: at,
        version: 1,
      });

      expect(await cancel(id)).toMatchObject({ ok: true, alreadyDraft: false });
      expect(await rowOf(id)).toMatchObject({
        status: "draft",
        scheduledAt: null,
      });
    });
  });

  describe("a scheduled comunicado is frozen (E1)", () => {
    it("refuses an autosave, changing nothing", async () => {
      const id = await plainDraft();
      await scheduled(id);
      const before = await rowOf(id);

      expect(
        await drafts.saveComunicadoDraft(
          {
            comunicadoId: id,
            expectedVersion: 2,
            saveKey: randomUUID(),
            title: "Otro título",
            doc: before.doc,
            actionLabel: null,
            actionPath: null,
            sendEmail: true,
            sendPush: true,
            audience: before.audience,
            essential: false,
            essentialReason: null,
          },
          author,
        ),
      ).toEqual({
        ok: false,
        code: "NOT_DRAFT",
        message: "Este comunicado ya no es un borrador.",
      });
      expect(await rowOf(id)).toEqual(before);
    });
  });

  describe("the actions (G2)", () => {
    it("schedule, move and cancel as the acting admin, and refresh the list and the page", async () => {
      state.viewer = { id: scheduler, role: "admin" };
      const id = await plainDraft();
      const paths = [
        ["/dashboard/communications"],
        [`/dashboard/communications/${id}`],
      ];
      const at = inDays(2);

      expect(
        await scheduleActions.scheduleComunicadoAction({
          comunicadoId: id,
          expectedVersion: 1,
          scheduledAt: at.toISOString(),
          typedCount: null,
        }),
      ).toEqual({ success: true, message: scheduledToast(at) });
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        scheduledAt: at,
        scheduledByUserId: scheduler,
      });
      expect(revalidatePath.mock.calls).toEqual(paths);

      revalidatePath.mockClear();
      const later = inDays(3);
      expect(
        await scheduleActions.rescheduleComunicadoAction({
          comunicadoId: id,
          expectedVersion: 2,
          scheduledAt: later.toISOString(),
        }),
      ).toEqual({ success: true, message: rescheduledToast(later) });
      expect(await rowOf(id)).toMatchObject({ scheduledAt: later });
      expect(revalidatePath.mock.calls).toEqual(paths);

      revalidatePath.mockClear();
      expect(
        await scheduleActions.cancelComunicadoScheduleAction({
          comunicadoId: id,
        }),
      ).toEqual({ success: true, message: CANCELLED_TOAST });
      expect(revalidatePath.mock.calls).toEqual(paths);
      expect(
        await scheduleActions.cancelComunicadoScheduleAction({
          comunicadoId: id,
        }),
      ).toEqual({ success: true, message: CANCEL_ALREADY_DRAFT_MESSAGE });
      expect(await rowOf(id)).toMatchObject({ status: "draft", version: 4 });
    });

    it("answer a refusal with its code and message, refreshing nothing", async () => {
      state.viewer = { id: scheduler, role: "admin" };
      const id = await plainDraft();
      const input = {
        comunicadoId: id,
        expectedVersion: 2,
        scheduledAt: inDays(1).toISOString(),
        typedCount: null,
      };

      expect(await scheduleActions.scheduleComunicadoAction(input)).toEqual({
        success: false,
        code: "STALE",
        message: SCHEDULE_STALE_MESSAGE,
      });
      state.vercelEnv = "development";
      expect(
        await scheduleActions.scheduleComunicadoAction({
          ...input,
          expectedVersion: 1,
        }),
      ).toEqual({
        success: false,
        code: "DEVELOPMENT",
        message: SCHEDULE_DEVELOPMENT_REFUSAL,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
      await expectUntouchedDraft(id);
    });

    it("refuse a festival admin, and an admin while the flag is off, changing nothing", async () => {
      const at = inDays(1);
      const id = await plainDraft({
        status: "scheduled",
        scheduledAt: at,
        scheduledByUserId: scheduler,
      });
      const draft = await plainDraft();
      const calls = () => [
        scheduleActions.scheduleComunicadoAction({
          comunicadoId: draft,
          expectedVersion: 1,
          scheduledAt: at.toISOString(),
          typedCount: null,
        }),
        scheduleActions.rescheduleComunicadoAction({
          comunicadoId: id,
          expectedVersion: 1,
          scheduledAt: inDays(2).toISOString(),
        }),
        scheduleActions.cancelComunicadoScheduleAction({ comunicadoId: id }),
      ];

      state.viewer = {
        id: await createUser({ role: "festival_admin" }),
        role: "festival_admin",
      };
      for (const result of await Promise.all(calls())) {
        expect(result).toEqual({
          success: false,
          code: "FORBIDDEN",
          message: "No autorizado.",
        });
      }
      state.viewer = { id: scheduler, role: "admin" };
      state.flagOn = false;
      for (const result of await Promise.all(calls())) {
        expect(result).toMatchObject({ success: false, code: "FORBIDDEN" });
      }

      await expectUntouchedDraft(draft);
      expect(await rowOf(id)).toMatchObject({
        status: "scheduled",
        scheduledAt: at,
        version: 1,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
