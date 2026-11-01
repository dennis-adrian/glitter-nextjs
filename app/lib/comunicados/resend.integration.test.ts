// @vitest-environment node

import { randomUUID } from "crypto";
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
  vi,
} from "vitest";

import type { ComunicadoAudience } from "@/app/lib/comunicados/definitions";
import type { BulkTiming } from "@/app/lib/notifications/bulk-email";
import * as schema from "@/db/schema";

/**
 * "Enviar a más personas" against a real database
 * (docs/IMPLEMENTATION-comunicados.md G10): who it reaches (people new to the
 * audience, people picked by name, never anyone with a row), the rows it
 * writes and the record it keeps, the channels and the essential mark each
 * row goes out with through the real fan-out and bulk lane, its refusals,
 * and the report. The send, fan-out, lane and driver are real; Resend is
 * mocked and there are no VAPID keys, so nothing leaves the test.
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
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: sendBatchMock,
}));
vi.mock("@/app/lib/notifications/push/config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/lib/notifications/push/config")
  >()),
  pushVapidConfig: () => null,
  pushPublicKey: () => null,
}));

type Role = "admin" | "festival_admin" | "user";
type Viewer = { id: number; role: Role };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  flagOn: true,
  vercelEnv: "production",
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 6 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Send = typeof import("@/app/lib/comunicados/send");
type Resend = typeof import("@/app/lib/comunicados/resend");
type ResendActions = typeof import("@/app/lib/comunicados/resend-actions");
type Retract = typeof import("@/app/lib/comunicados/retract");
type Edit = typeof import("@/app/lib/comunicados/edit");
type Driver = typeof import("@/app/lib/comunicados/driver");
type Report = typeof import("@/app/lib/comunicados/report");
type Queries = typeof import("@/app/lib/comunicados/queries");
let sendMod: Send;
let resendMod: Resend;
let resendActions: ResendActions;
let retractMod: Retract;
let editMod: Edit;
let driver: Driver;
let reportMod: Report;
let queries: Queries;

const BASE_URL = "https://glitter.test";
const DAY = 24 * 3600_000;
const REASON = "El armado se adelanta a las 7:00 por la lluvia";
const LATER = () => Date.now() + 60_000;
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

const created = {
  users: [] as number[],
  festivals: [] as number[],
  lists: [] as number[],
  comunicados: [] as number[],
  unsubscribes: [] as number[],
};

async function createUser(
  role: Role = "user",
  status: "verified" | "pending" = "verified",
) {
  const suffix = randomUUID();
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO users (clerk_id, email, display_name, role, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      `resend-${suffix}`,
      `resend-${suffix}@example.test`,
      `Reenvío ${suffix.slice(0, 8)}`,
      role,
      status,
    ],
  );
  created.users.push(rows[0]!.id);
  return rows[0]!.id;
}

async function emailOf(userId: number) {
  const { rows } = await pool!.query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]!.email;
}

async function createFixedList(memberIds: number[]) {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO distribution_lists (name, kind) VALUES ($1, 'fixed') RETURNING id`,
    [`Reenvío ${randomUUID()}`],
  );
  const listId = rows[0]!.id;
  created.lists.push(listId);
  await addToList(listId, memberIds);
  return listId;
}

async function addToList(listId: number, memberIds: number[]) {
  for (const userId of memberIds) {
    await pool!.query(
      "INSERT INTO distribution_list_members (list_id, user_id) VALUES ($1, $2)",
      [listId, userId],
    );
  }
}

let standNumber = 9400;

/** A current festival whose Confirmados are `holders`. */
async function createFestival(holders: number[]) {
  const { rows } = await pool!.query<{ id: number; name: string }>(
    `INSERT INTO festivals (name, status) VALUES ($1, 'active') RETURNING id, name`,
    [`Reenvío ${randomUUID()}`],
  );
  const festival = rows[0]!;
  created.festivals.push(festival.id);
  await pool!.query(
    `INSERT INTO festival_dates (festival_id, start_date, end_date)
     VALUES ($1, $2, $3)`,
    [
      festival.id,
      new Date(Date.now() + 10 * DAY),
      new Date(Date.now() + 11 * DAY),
    ],
  );
  await confirmAt(festival.id, holders);
  return festival;
}

/** Accepted reservations at the festival, one per holder. */
async function confirmAt(festivalId: number, holders: number[]) {
  for (const owner of holders) {
    const { rows: stand } = await pool!.query<{ id: number }>(
      "INSERT INTO stands (stand_number, festival_id) VALUES ($1, $2) RETURNING id",
      [standNumber++, festivalId],
    );
    const { rows: reservation } = await pool!.query<{ id: number }>(
      `INSERT INTO stand_reservations (stand_id, festival_id, status, owner_user_id)
       VALUES ($1, $2, 'accepted', $3) RETURNING id`,
      [stand[0]!.id, festivalId, owner],
    );
    await pool!.query(
      "INSERT INTO participations (user_id, reservation_id) VALUES ($1, $2)",
      [owner, reservation[0]!.id],
    );
  }
}

async function unsubscribe(userId: number, topic: "announcements" | "all") {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO email_unsubscribes (email_key, topic) VALUES ($1, $2) RETURNING id`,
    [(await emailOf(userId)).trim().toLowerCase(), topic],
  );
  created.unsubscribes.push(rows[0]!.id);
}

async function addDevice(userId: number) {
  await pool!.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, application_server_key)
     VALUES ($1, $2, 'p', 'a', 'k')`,
    [userId, `https://push.example.test/${randomUUID()}`],
  );
}

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

let admin: number;

type Sent = { comunicadoId: number; campaignId: number };

/** A comunicado sent now, by the real send, to `to`. */
async function sendTo(
  to: Partial<ComunicadoAudience>,
  values: {
    sendEmail?: boolean;
    sendPush?: boolean;
    essential?: boolean;
    typedCount?: number | null;
  } = {},
): Promise<Sent> {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (title, doc, audience, send_email, send_push, essential, essential_reason,
        created_by_user_id, updated_by_user_id)
     VALUES ('Cambio de horario de armado', $1::jsonb, $2::jsonb, $3, $4, $5, $6, $7, $7)
     RETURNING id`,
    [
      JSON.stringify([storedParagraph("El armado empieza a las 8:00.")]),
      JSON.stringify({ festivals: [], lists: [], people: [], ...to }),
      values.sendEmail ?? true,
      values.sendPush ?? false,
      values.essential ?? false,
      values.essential ? REASON : null,
      admin,
    ],
  );
  const comunicadoId = rows[0]!.id;
  created.comunicados.push(comunicadoId);
  const result = await sendMod.sendComunicadoNow({
    comunicadoId,
    by: admin,
    expectedVersion: 1,
    typedCount: values.typedCount ?? null,
  });
  if (result.kind !== "started") throw new Error("not started");
  return { comunicadoId, campaignId: result.campaignId };
}

function drain(sent: Sent) {
  return driver.runComunicadoWork({
    scope: { campaignId: sent.campaignId },
    deadline: LATER(),
    trigger: "send",
    emailTiming: FAST,
  });
}

function request(
  values: Partial<import("@/app/lib/comunicados/resend").ResendRequest> = {},
) {
  return {
    includeAudience: true,
    people: [] as number[],
    sendEmail: true,
    sendPush: false,
    ...values,
  };
}

function resend(
  sent: Sent,
  values: Partial<
    import("@/app/lib/comunicados/resend").ResendComunicadoOptions
  > = {},
) {
  return resendMod.resendComunicado(sent.comunicadoId, {
    ...request(),
    by: admin,
    requestKey: randomUUID(),
    expectEssential: false,
    typedCount: null,
    ...values,
  });
}

async function refusalOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof resendMod.ResendRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

type Row = {
  user_id: number;
  status: string;
  skipped_reason: string | null;
  source: string | null;
  resend_id: number | null;
};

async function recipientsOf(sent: Sent) {
  const { rows } = await pool!.query<Row>(
    `SELECT user_id, status, skipped_reason, source, resend_id
     FROM notification_campaign_recipients WHERE campaign_id = $1
     ORDER BY user_id`,
    [sent.campaignId],
  );
  return new Map(rows.map((row) => [row.user_id, row]));
}

async function deliveriesOf(sent: Sent, userId: number) {
  const { rows } = await pool!.query<{
    channel: string;
    status: string;
    last_error: string | null;
  }>(
    `SELECT d.channel, d.status, d.last_error
     FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
     WHERE n.campaign_id = $1 AND d.user_id = $2 ORDER BY d.id`,
    [sent.campaignId, userId],
  );
  return rows;
}

type BatchEmail = {
  to: string[];
  headers?: Record<string, string>;
  html: string;
};

function accepted(emails: BatchEmail[]) {
  return {
    data: {
      data: emails.map(() => ({ id: `re_${randomUUID()}` })),
      errors: [],
    },
    error: null,
    headers: {},
  };
}

/** Everyone a batch was sent to since the mock was last cleared. */
function mailedTo() {
  return sendBatchMock.mock.calls.flatMap(([emails]) =>
    (emails as BatchEmail[]).map((email) => email.to[0]),
  );
}

function mailTo(address: string) {
  return sendBatchMock.mock.calls
    .flatMap(([emails]) => emails as BatchEmail[])
    .find((email) => email.to[0] === address);
}

describeDatabase("sending a comunicado to more people (G10)", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    sendMod = await import("@/app/lib/comunicados/send");
    resendMod = await import("@/app/lib/comunicados/resend");
    resendActions = await import("@/app/lib/comunicados/resend-actions");
    retractMod = await import("@/app/lib/comunicados/retract");
    editMod = await import("@/app/lib/comunicados/edit");
    driver = await import("@/app/lib/comunicados/driver");
    reportMod = await import("@/app/lib/comunicados/report");
    queries = await import("@/app/lib/comunicados/queries");
    try {
      await pool!.query("SELECT id FROM comunicado_resends LIMIT 1");
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(async () => {
    sendBatchMock.mockReset();
    sendBatchMock.mockImplementation(async (emails: BatchEmail[]) =>
      accepted(emails),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    admin = await createUser("admin");
  });

  async function cleanUp() {
    const ids = created.comunicados;
    if (ids.length > 0) {
      const { rows } = await pool!.query<{ campaign_id: number | null }>(
        "SELECT campaign_id FROM comunicados WHERE id = ANY($1::int[])",
        [ids],
      );
      const campaigns = rows.flatMap((row) =>
        row.campaign_id == null ? [] : [row.campaign_id],
      );
      await pool!.query(
        "DELETE FROM notifications WHERE campaign_id = ANY($1::int[])",
        [campaigns],
      );
      await pool!.query(
        "DELETE FROM notification_campaign_recipients WHERE campaign_id = ANY($1::int[])",
        [campaigns],
      );
      await pool!.query(
        "DELETE FROM comunicado_resends WHERE comunicado_id = ANY($1::int[])",
        [ids],
      );
      await pool!.query(
        "DELETE FROM comunicado_revisions WHERE comunicado_id = ANY($1::int[])",
        [ids],
      );
      await pool!.query("DELETE FROM comunicados WHERE id = ANY($1::int[])", [
        ids,
      ]);
      await pool!.query(
        "DELETE FROM notification_campaigns WHERE id = ANY($1::int[])",
        [campaigns],
      );
    }
    await pool!.query(
      "DELETE FROM email_unsubscribes WHERE id = ANY($1::int[])",
      [created.unsubscribes],
    );
    await pool!.query(
      "DELETE FROM distribution_lists WHERE id = ANY($1::int[])",
      [created.lists],
    );
    await pool!.query(
      `DELETE FROM stand_reservations WHERE festival_id = ANY($1::int[])`,
      [created.festivals],
    );
    await pool!.query(`DELETE FROM stands WHERE festival_id = ANY($1::int[])`, [
      created.festivals,
    ]);
    await pool!.query("DELETE FROM users WHERE id = ANY($1::int[])", [
      created.users,
    ]);
    await pool!.query("DELETE FROM festivals WHERE id = ANY($1::int[])", [
      created.festivals,
    ]);
    for (const list of Object.values(created)) list.length = 0;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    afterMock.mockReset();
    revalidatePath.mockClear();
    state.viewer = null;
    state.flagOn = true;
    state.vercelEnv = "production";
    await cleanUp();
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("people new to the audience", () => {
    it("reaches only who has no row, in the current revision, and records it", async () => {
      const [ana, beto, caro, dani] = [
        await createUser(),
        await createUser(),
        await createUser(),
        await createUser("user", "pending"),
      ];
      const list = await createFixedList([ana, beto]);
      const sent = await sendTo({ lists: [list] });
      await drain(sent);
      expect(mailedTo().sort()).toEqual(
        [await emailOf(ana), await emailOf(beto)].sort(),
      );

      // Two joined the list since; Dani cannot receive it yet.
      await addToList(list, [caro, dani]);
      const preview = await resendMod.previewComunicadoResend(
        sent.comunicadoId,
        request(),
      );
      expect(preview).toMatchObject({
        ok: true,
        newcomers: 1,
        pickedByName: 0,
        eligible: 1,
        willReceive: 1,
        notReceiving: [{ reason: "Perfil no verificado", count: 1 }],
        essential: false,
        typedRequired: false,
        problem: null,
      });

      sendBatchMock.mockClear();
      const result = await resend(sent);
      expect(result).toMatchObject({ kind: "resent", willReceive: 1 });
      const rows = await recipientsOf(sent);
      // A recipient row for Caro only: Dani has none, so a later resend can
      // still reach them.
      expect([...rows.keys()].sort()).toEqual([ana, beto, caro].sort());
      expect(rows.get(caro)).toMatchObject({
        status: "pending",
        source: "list",
        resend_id: result.kind === "resent" ? result.resendId : -1,
      });
      expect(rows.get(ana)?.resend_id).toBeNull();

      const { rows: campaign } = await pool!.query(
        "SELECT status FROM notification_campaigns WHERE id = $1",
        [sent.campaignId],
      );
      expect(campaign[0]!.status).toBe("processing");

      await drain(sent);
      expect(mailedTo()).toEqual([await emailOf(caro)]);
      expect((await recipientsOf(sent)).get(caro)?.status).toBe("notified");
      const { rows: done } = await pool!.query(
        "SELECT status FROM notification_campaigns WHERE id = $1",
        [sent.campaignId],
      );
      expect(done[0]!.status).toBe("completed");

      // The record and the summary say so.
      const { rows: resends } = await pool!.query(
        `SELECT includes_audience, send_email, send_push, essential, revision,
                created_by_user_id, summary
         FROM comunicado_resends WHERE comunicado_id = $1`,
        [sent.comunicadoId],
      );
      expect(resends).toEqual([
        expect.objectContaining({
          includes_audience: true,
          send_email: true,
          send_push: false,
          essential: false,
          revision: 1,
          created_by_user_id: admin,
          summary: expect.objectContaining({
            newcomers: 1,
            willReceive: 1,
            channels: { email: true, push: false },
          }),
        }),
      ]);
      const { rows: k } = await pool!.query(
        "SELECT audience_summary FROM comunicados WHERE id = $1",
        [sent.comunicadoId],
      );
      expect(k[0]!.audience_summary).toMatchObject({
        willReceive: 2,
        resends: { count: 1, willReceive: 1, pickedByName: 0 },
      });

      // Nobody new now: refused, and nothing written.
      expect((await refusalOf(resend(sent))).code).toBe("NOBODY");

      // Once Dani is verified, the next resend reaches them.
      await pool!.query("UPDATE users SET status = 'verified' WHERE id = $1", [
        dani,
      ]);
      expect(await resend(sent)).toMatchObject({ willReceive: 1 });
      expect((await recipientsOf(sent)).get(dani)?.status).toBe("pending");
    });

    it("sends the current revision to newcomers", async () => {
      const [ana, caro] = [await createUser(), await createUser()];
      const list = await createFixedList([ana]);
      const sent = await sendTo({ lists: [list] });
      await drain(sent);
      const edited = await editMod.editSentComunicado(
        sent.comunicadoId,
        {
          expectedRevision: 1,
          title: "Nuevo horario",
          doc: [storedParagraph("El armado empieza a las 9:00.")],
          actionLabel: null,
          actionPath: null,
        },
        admin,
      );
      expect(edited).toMatchObject({ ok: true });
      sendBatchMock.mockClear();
      await addToList(list, [caro]);
      await resend(sent);
      await drain(sent);
      expect(mailTo(await emailOf(caro))!.html).toContain("9:00");
      const { rows } = await pool!.query(
        `SELECT title, data->>'revision' AS revision FROM notifications
         WHERE campaign_id = $1 AND user_id = $2`,
        [sent.campaignId, caro],
      );
      expect(rows[0]).toEqual({ title: "Nuevo horario", revision: "2" });
    });
  });

  describe("people picked by name, and the channels", () => {
    it("adds them with this resend's channels, skipping who already has it", async () => {
      const [ana, eva, fede] = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      await addDevice(eva);
      const sent = await sendTo({ people: [ana] });
      await drain(sent);
      sendBatchMock.mockClear();

      // Ana already has it: picking her again adds nobody.
      const preview = await resendMod.previewComunicadoResend(
        sent.comunicadoId,
        request({
          includeAudience: false,
          people: [ana, eva, fede],
          sendEmail: false,
          sendPush: true,
        }),
      );
      expect(preview).toMatchObject({
        ok: true,
        newcomers: 0,
        pickedByName: 2,
        eligible: 2,
        pushDevices: 1,
      });

      await resend(sent, {
        includeAudience: false,
        people: [ana, eva, fede],
        sendEmail: false,
        sendPush: true,
      });
      const rows = await recipientsOf(sent);
      expect(rows.get(eva)).toMatchObject({ source: "person" });
      expect(rows.get(ana)?.resend_id).toBeNull();
      await drain(sent);

      // No email this time, and a push row for Eva's device.
      expect(sendBatchMock).not.toHaveBeenCalled();
      expect((await deliveriesOf(sent, eva)).map((d) => d.channel)).toEqual([
        "push",
      ]);
      expect(await deliveriesOf(sent, fede)).toEqual([]);
      // Ana's email stays the one she got.
      expect(await deliveriesOf(sent, ana)).toEqual([
        expect.objectContaining({ channel: "email", status: "sent" }),
      ]);

      // The person search knows who already has it.
      state.viewer = { id: admin, role: "admin" };
      const found = await queries.searchComunicadoPeople("Reenvío", {
        campaignId: sent.campaignId,
      });
      expect(found.find((p) => p.id === ana)?.skipReason).toBe(
        "Ya está en este comunicado",
      );

      // The report reads each row's own channels.
      const report = await reportMod.fetchComunicadoReport(sent.comunicadoId);
      expect(report).toMatchObject({
        sendEmail: true,
        sendPush: true,
        sentChannels: { email: true, push: false },
        resends: [
          expect.objectContaining({ sendEmail: false, sendPush: true }),
        ],
      });
      const table = await reportMod.fetchComunicadoRecipients(
        sent.comunicadoId,
        { filter: "all", query: "", page: 1 },
      );
      const fedeRow = table!.rows.find((row) => row.userId === fede)!;
      expect(fedeRow).toMatchObject({ resent: true, emailLabel: "Sin correo" });
      expect(table!.rows.find((row) => row.userId === ana)?.resent).toBe(false);
    });
  });

  describe("refusals", () => {
    it("refuses a retracted, a draft, another environment's and an empty one", async () => {
      const ana = await createUser();
      const sent = await sendTo({ people: [ana] });
      expect(
        (await refusalOf(resend(sent, { includeAudience: false, people: [] })))
          .code,
      ).toBe("EMPTY");

      state.vercelEnv = "preview";
      expect((await refusalOf(resend(sent))).code).toBe("OTHER_ENV");
      state.vercelEnv = "production";

      await retractMod.retractComunicado(
        sent.comunicadoId,
        { reason: "Salió mal" },
        admin,
      );
      expect((await refusalOf(resend(sent))).code).toBe("RETRACTED");

      const { rows } = await pool!.query<{ id: number }>(
        `INSERT INTO comunicados (title, created_by_user_id) VALUES ('x', $1) RETURNING id`,
        [admin],
      );
      created.comunicados.push(rows[0]!.id);
      expect(
        (
          await refusalOf(
            resendMod.resendComunicado(rows[0]!.id, {
              ...request(),
              by: admin,
              requestKey: randomUUID(),
              expectEssential: false,
              typedCount: null,
            }),
          )
        ).code,
      ).toBe("NOT_SENT");
    });

    it("is one resend for a double submit", async () => {
      const [ana, beto] = [await createUser(), await createUser()];
      const list = await createFixedList([ana]);
      const sent = await sendTo({ lists: [list] });
      await addToList(list, [beto]);
      const requestKey = randomUUID();
      expect(await resend(sent, { requestKey })).toMatchObject({
        kind: "resent",
      });
      expect(await resend(sent, { requestKey })).toMatchObject({
        kind: "already_resent",
      });
      const { rows } = await pool!.query(
        "SELECT count(*)::int AS n FROM comunicado_resends WHERE comunicado_id = $1",
        [sent.comunicadoId],
      );
      expect(rows[0]!.n).toBe(1);
    });

    it("adds up two resends that ran at once in audience_summary", async () => {
      const [ana, beto, eva] = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      const list = await createFixedList([ana]);
      const sent = await sendTo({ lists: [list] });
      await addToList(list, [beto]);

      // Both resends read the summary, then wait on the campaign row.
      const holder = await pool!.connect();
      await holder.query("BEGIN");
      await holder.query(
        "SELECT id FROM notification_campaigns WHERE id = $1 FOR UPDATE",
        [sent.campaignId],
      );
      const first = resend(sent);
      const second = resend(sent, { includeAudience: false, people: [eva] });
      for (let attempt = 0; ; attempt += 1) {
        const { rows } = await pool!.query<{ waiting: number }>(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE datname = current_database()
             AND cardinality(pg_blocking_pids(pid)) > 0`,
        );
        if (rows[0]!.waiting >= 2) break;
        if (attempt > 250) throw new Error("Nothing ever waited.");
        await new Promise((r) => setTimeout(r, 20));
      }
      await holder.query("COMMIT");
      holder.release();

      expect(await first).toMatchObject({ kind: "resent", willReceive: 1 });
      expect(await second).toMatchObject({ kind: "resent", willReceive: 1 });
      const { rows } = await pool!.query(
        "SELECT audience_summary FROM comunicados WHERE id = $1",
        [sent.comunicadoId],
      );
      expect(rows[0]!.audience_summary.resends).toMatchObject({
        count: 2,
        willReceive: 2,
        pickedByName: 1,
      });
    });
  });

  describe("essential comunicados (B7)", () => {
    it("stays essential for the festival's newcomers inside the window", async () => {
      const ana = await createUser();
      const festival = await createFestival([ana]);
      const sent = await sendTo(
        { festivals: [festival.id] },
        { essential: true, typedCount: 1 },
      );
      await drain(sent);
      sendBatchMock.mockClear();

      const nico = await createUser();
      await unsubscribe(nico, "announcements");
      await confirmAt(festival.id, [nico]);

      // Nobody by name on an essential one.
      expect(
        (
          await refusalOf(
            resend(sent, { people: [ana], expectEssential: true }),
          )
        ).code,
      ).toBe("ESSENTIAL_PEOPLE");

      const preview = await resendMod.previewComunicadoResend(
        sent.comunicadoId,
        request(),
      );
      expect(preview).toMatchObject({
        ok: true,
        newcomers: 1,
        essential: true,
        essentialLapsed: false,
        typedRequired: true,
        email: { sendTo: 1, essentialOverride: 1 },
      });
      // Typed confirmation, as at the send.
      expect(
        (await refusalOf(resend(sent, { expectEssential: true }))).code,
      ).toBe("AUDIENCE_CHANGED");
      const result = await resend(sent, {
        expectEssential: true,
        typedCount: 1,
      });
      expect(result).toMatchObject({ kind: "resent", essential: true });

      const { rows } = await pool!.query(
        `SELECT essential, essential_confirmed_by_user_id FROM comunicado_resends
         WHERE comunicado_id = $1`,
        [sent.comunicadoId],
      );
      expect(rows).toEqual([
        { essential: true, essential_confirmed_by_user_id: admin },
      ]);

      // Their Anuncios opt-out is lifted: mailed, without one-click unsubscribe.
      await drain(sent);
      const email = mailTo(await emailOf(nico));
      expect(email).toBeDefined();
      expect(email!.headers).toBeUndefined();
      expect(email!.html).toContain(festival.name);
    });

    it("goes out normal once the festival ended more than 7 days ago", async () => {
      const ana = await createUser();
      const festival = await createFestival([ana]);
      const sent = await sendTo(
        { festivals: [festival.id] },
        { essential: true, typedCount: 1 },
      );
      await drain(sent);
      sendBatchMock.mockClear();
      await pool!.query(
        `UPDATE festival_dates SET start_date = $2, end_date = $3 WHERE festival_id = $1`,
        [
          festival.id,
          new Date(Date.now() - 12 * DAY),
          new Date(Date.now() - 10 * DAY),
        ],
      );

      const [nico, olga] = [await createUser(), await createUser()];
      await unsubscribe(nico, "announcements");
      await confirmAt(festival.id, [nico, olga]);

      const preview = await resendMod.previewComunicadoResend(
        sent.comunicadoId,
        request(),
      );
      expect(preview).toMatchObject({
        ok: true,
        newcomers: 2,
        essential: false,
        essentialLapsed: true,
        typedRequired: false,
        email: { sendTo: 1, unsubscribedAnnouncements: 1 },
      });
      // The dialog said essential: the window closed since.
      expect(
        (await refusalOf(resend(sent, { expectEssential: true }))).code,
      ).toBe("ESSENTIAL_CHANGED");

      await resend(sent, { expectEssential: false });
      await drain(sent);
      // Olga is mailed, as a normal comunicado; Nico's opt-out holds.
      expect(mailedTo()).toEqual([await emailOf(olga)]);
      expect(mailTo(await emailOf(olga))!.headers).toBeDefined();
      expect(mailTo(await emailOf(olga))!.html).not.toContain(
        "llega también a quienes se dieron de baja",
      );
      expect(await deliveriesOf(sent, nico)).toEqual([
        expect.objectContaining({
          channel: "email",
          status: "skipped",
          last_error: "unsubscribed",
        }),
      ]);
    });
  });

  describe("outside production (B6)", () => {
    it("writes the lists' newcomers skipped, as the send did", async () => {
      state.vercelEnv = "preview";
      const [ana, caro] = [await createUser(), await createUser()];
      const list = await createFixedList([ana]);
      const sent = await sendTo({ lists: [list] });
      await addToList(list, [caro]);

      const preview = await resendMod.previewComunicadoResend(
        sent.comunicadoId,
        request(),
      );
      expect(preview).toMatchObject({
        ok: true,
        newcomers: 1,
        narrowed: true,
        willReceive: 0,
      });
      expect(await resend(sent)).toMatchObject({ willReceive: 0 });
      expect((await recipientsOf(sent)).get(caro)).toMatchObject({
        status: "skipped",
        skipped_reason: "Entorno de prueba: no se envía a listas",
      });
    });
  });

  describe("resendComunicadoAction", () => {
    it("refuses anyone but a global admin, and drains after answering", async () => {
      const [ana, beto] = [await createUser(), await createUser()];
      const list = await createFixedList([ana]);
      const sent = await sendTo({ lists: [list] });
      await addToList(list, [beto]);
      const input = {
        comunicadoId: sent.comunicadoId,
        ...request(),
        requestKey: randomUUID(),
        expectEssential: false,
        typedCount: null,
      };

      state.viewer = {
        id: await createUser("festival_admin"),
        role: "festival_admin",
      };
      expect(await resendActions.resendComunicadoAction(input)).toMatchObject({
        success: false,
        code: "FORBIDDEN",
      });

      state.viewer = { id: admin, role: "admin" };
      expect(
        await resendActions.resendComunicadoAction({ ...input, people: "x" }),
      ).toMatchObject({ success: false, code: "INVALID" });
      expect(await resendActions.resendComunicadoAction(input)).toEqual({
        success: true,
        message: "Se lo estamos enviando a 1 persona más.",
      });
      expect(afterMock).toHaveBeenCalledTimes(1);
      expect(revalidatePath).toHaveBeenCalledWith(
        `/dashboard/communications/${sent.comunicadoId}`,
      );
      expect(
        await resendActions.loadComunicadoResendPreviewAction({
          comunicadoId: sent.comunicadoId,
          ...request(),
        }),
      ).toMatchObject({
        success: true,
        preview: {
          ok: true,
          eligible: 0,
          problem: "No hay nadie nuevo que pueda recibirlo.",
        },
      });
    });
  });
});
