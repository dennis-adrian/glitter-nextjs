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
  type MockInstance,
  vi,
} from "vitest";

import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import * as schema from "@/db/schema";

/**
 * A sent comunicado's report against a real database
 * (docs/IMPLEMENTATION-comunicados.md F6, G3, G6): the KPIs, the bounce
 * join, each row's labels, the chips, the search, the paging, the banners'
 * predicates and the retraction counts. The fixtures are raw rows shaped as
 * the send, the fan-out and the lane leave them; every assertion is about
 * this file's own campaigns, never a total over the shared database.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));

type Viewer = { id: number; role: "admin" | "festival_admin" | "user" };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  vercelEnv: "production",
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

type Report = typeof import("@/app/lib/comunicados/report");
type Queries = typeof import("@/app/lib/comunicados/queries");
type Retry = typeof import("@/app/lib/comunicados/retry");
let report: Report;
let queries: Queries;
let retry: Retry;

const STAGING = "Entorno de prueba: no se envía a listas";
const RETRACTED = "Retirado antes de enviarse";
/** 10:14 AM in La Paz, as the columns hold it: naive UTC. */
const SENT_AT = "2026-10-24 14:14:00";

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
};

async function createUser(name?: string) {
  const suffix = randomUUID();
  const result = await pool!.query<{ id: number }>(
    `INSERT INTO users (clerk_id, email, display_name, role, status)
     VALUES ($1, $2, $3, 'user', 'verified') RETURNING id`,
    [
      `report-${suffix}`,
      `report-${suffix}@example.com`,
      name ?? `Informe ${suffix.slice(0, 8)}`,
    ],
  );
  const id = result.rows[0]!.id;
  created.users.push(id);
  return id;
}

async function signInAsAdmin() {
  const id = await createUser("Dennis Admin");
  await pool!.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [id]);
  state.viewer = { id, role: "admin" };
  return id;
}

function summaryFor(
  overrides: Partial<ComunicadoAudienceSummary> = {},
): ComunicadoAudienceSummary {
  return {
    v: 1,
    env: "production",
    narrowed: false,
    sources: [
      {
        kind: "list",
        id: 1,
        label: "Ilustradores",
        matched: 15,
        eligible: 12,
      },
    ],
    matched: 15,
    eligible: 12,
    willReceive: 11,
    stagingAdmins: 0,
    pickedByName: 0,
    skipped: [],
    channels: { email: true, push: true },
    email: {
      sendTo: 8,
      unsubscribedAnnouncements: 1,
      unsubscribedAll: 1,
      suppressed: 1,
      invalid: 0,
    },
    essentialFestival: null,
    essentialOverride: 0,
    essentialNotOverridden: 0,
    ...overrides,
  };
}

type SentOptions = {
  sendEmail?: boolean;
  sendPush?: boolean;
  currentRevision?: number;
  campaignStatus?: "processing" | "completed";
  /** How long ago the campaign was written, in minutes. */
  campaignAgeMinutes?: number;
  summary?: ComunicadoAudienceSummary | Record<string, unknown>;
  essential?: { reason: string; confirmedBy: number } | null;
  retracted?: { reason: string; by: number } | null;
};

/** A sent comunicado as the send leaves it: campaign, row, revisions. */
async function insertSent(authorId: number, options: SentOptions = {}) {
  const {
    sendEmail = true,
    sendPush = true,
    currentRevision = 2,
    campaignStatus = "processing",
    campaignAgeMinutes = 0,
    summary = summaryFor(),
    essential = null,
    retracted = null,
  } = options;
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key,
        completed_at, created_at)
     VALUES ('comunicado', $1::notification_campaign_status, 'Cambio de horario', 'El armado empieza a las 8.',
             $2, $3, CASE WHEN $1::text = 'completed' THEN now() END,
             now() - make_interval(mins => $4))
     RETURNING id`,
    [
      campaignStatus,
      authorId,
      `comunicado:report-test-${randomUUID()}`,
      campaignAgeMinutes,
    ],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, sent_at, sent_by_user_id,
        send_email, send_push, audience_summary, essential, essential_reason,
        essential_confirmed_by_user_id, essential_confirmed_at,
        retracted_at, retracted_by_user_id, retract_reason,
        created_by_user_id, updated_by_user_id)
     VALUES ('sent', 'Cambio de horario', $1, $2, $3::timestamp, $4, $5, $6,
             $7::jsonb, $8, $9, $10, CASE WHEN $8 THEN now() END,
             CASE WHEN $11::text IS NOT NULL THEN now() END, $12, $11, $4, $4)
     RETURNING id`,
    [
      campaignId,
      currentRevision,
      SENT_AT,
      authorId,
      sendEmail,
      sendPush,
      JSON.stringify(summary),
      essential !== null,
      essential?.reason ?? null,
      essential?.confirmedBy ?? null,
      retracted?.reason ?? null,
      retracted?.by ?? null,
    ],
  );
  const id = comunicado.rows[0]!.id;
  created.comunicados.push(id);
  for (let revision = 1; revision <= currentRevision; revision += 1) {
    await pool!.query(
      `INSERT INTO comunicado_revisions
         (comunicado_id, revision, title, doc, html, text, created_by_user_id)
       VALUES ($1, $2, $3, '[]'::jsonb, $4, $5, $6)`,
      [
        id,
        revision,
        `Cambio de horario v${revision}`,
        `<p>Texto de la versión ${revision}</p>`,
        `Texto de la versión ${revision}`,
        authorId,
      ],
    );
  }
  return { id, campaignId };
}

type RecipientOptions = {
  status: "pending" | "notified" | "skipped" | "failed";
  reason?: string;
  source?: "list" | "person" | "staging_admin" | null;
  read?: boolean;
};

/**
 * A recipient row; a notified one with its inbox item, as the fan-out
 * writes them. Returns the item's id, or null.
 */
async function addRecipient(
  sent: { id: number; campaignId: number },
  userId: number,
  { status, reason, source = "list", read = false }: RecipientOptions,
) {
  let notificationId: number | null = null;
  if (status === "notified") {
    const item = await pool!.query<{ id: number }>(
      `INSERT INTO notifications
         (user_id, kind, category, title, body, data, campaign_id, dedupe_key, read_at)
       VALUES ($1, 'comunicado', 'announcements', 'Cambio de horario',
               'El armado empieza a las 8.', $2::jsonb, $3, $4,
               CASE WHEN $5 THEN now() END)
       RETURNING id`,
      [
        userId,
        JSON.stringify({ comunicadoId: sent.id }),
        sent.campaignId,
        `comunicado:${sent.id}`,
        read,
      ],
    );
    notificationId = item.rows[0]!.id;
  }
  await pool!.query(
    `INSERT INTO notification_campaign_recipients
       (campaign_id, user_id, status, skipped_reason, source, notification_id,
        processed_at)
     VALUES ($1, $2, $3::notification_campaign_recipient_status, $4,
             $5::campaign_recipient_source, $6,
             CASE WHEN $3::text = 'pending' THEN NULL ELSE now() END)`,
    [sent.campaignId, userId, status, reason ?? null, source, notificationId],
  );
  return notificationId;
}

type EmailOptions = {
  status: "pending" | "processing" | "sent" | "failed" | "skipped";
  lastError?: string | null;
  maybeSent?: boolean;
  providerId?: string | null;
  contentRevision?: number | null;
  /** Minutes since the row last changed. */
  updatedMinutesAgo?: number;
};

/** An email row; the address is read from the person in SQL, as notifyMany does. */
async function addEmail(notificationId: number, options: EmailOptions) {
  const {
    status,
    lastError = null,
    maybeSent = false,
    providerId = null,
    contentRevision = null,
    updatedMinutesAgo = 0,
  } = options;
  await pool!.query(
    `INSERT INTO notification_deliveries
       (notification_id, user_id, template_key, channel, lane, recipient_email,
        payload, idempotency_key, status, last_error, batch_key, maybe_sent_at,
        provider_message_id, content_revision, sent_at, updated_at)
     SELECT n.id, n.user_id, 'comunicado', 'email', 'bulk', u.email,
            '{}'::jsonb, $2, $3::notification_delivery_status, $4,
            CASE WHEN $5 THEN 'comunicado-batch:report-test' END,
            CASE WHEN $5 THEN now() END, $6, $7,
            CASE WHEN $3::text = 'sent' THEN $8::timestamp END,
            now() - make_interval(mins => $9)
     FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.id = $1`,
    [
      notificationId,
      `notification:${notificationId}:email:${randomUUID()}`,
      status,
      lastError,
      maybeSent,
      providerId,
      contentRevision,
      SENT_AT,
      updatedMinutesAgo,
    ],
  );
}

async function addPush(notificationId: number, status: "sent" | "failed") {
  await pool!.query(
    `INSERT INTO notification_deliveries
       (notification_id, user_id, template_key, channel, lane, payload,
        idempotency_key, status)
     SELECT n.id, n.user_id, 'comunicado', 'push', 'bulk', '{}'::jsonb, $2,
            $3::notification_delivery_status
     FROM notifications n WHERE n.id = $1`,
    [
      notificationId,
      `notification:${notificationId}:push:${randomUUID()}`,
      status,
    ],
  );
}

async function unsubscribe(userId: number, topic: "announcements" | "all") {
  await pool!.query(
    `INSERT INTO email_unsubscribes (email_key, topic)
     SELECT lower(trim(email)), $2::email_topic FROM users WHERE id = $1`,
    [userId, topic],
  );
}

/** A bounce whose latest event came from the email `resendEmailId`. */
async function bounce(userId: number, resendEmailId: string | null) {
  await pool!.query(
    `INSERT INTO email_suppressions (email_key, reason, resend_email_id)
     SELECT lower(trim(email)), 'bounce', $2 FROM users WHERE id = $1`,
    [userId, resendEmailId],
  );
}

async function cleanUp() {
  if (created.campaigns.length > 0) {
    // Deliveries go with their items; recipients with their campaign.
    await pool!.query(
      `DELETE FROM notifications WHERE campaign_id = ANY($1::int[])`,
      [created.campaigns],
    );
  }
  if (created.comunicados.length > 0) {
    await pool!.query(
      `DELETE FROM comunicado_revisions WHERE comunicado_id = ANY($1::int[])`,
      [created.comunicados],
    );
    await pool!.query(`DELETE FROM comunicados WHERE id = ANY($1::int[])`, [
      created.comunicados,
    ]);
  }
  if (created.campaigns.length > 0) {
    await pool!.query(
      `DELETE FROM notification_campaigns WHERE id = ANY($1::int[])`,
      [created.campaigns],
    );
  }
  if (created.users.length > 0) {
    for (const table of ["email_unsubscribes", "email_suppressions"]) {
      await pool!.query(
        `DELETE FROM ${table} WHERE email_key IN (
           SELECT lower(trim(email)) FROM users WHERE id = ANY($1::int[]))`,
        [created.users],
      );
    }
    await pool!.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [
      created.users,
    ]);
  }
  created.users = [];
  created.campaigns = [];
  created.comunicados = [];
}

type People = Record<string, number>;

/**
 * One of every state the report tells apart, on a comunicado at revision 2
 * with email and push ticked, still sending.
 */
async function mixedReport(authorId: number) {
  const sent = await insertSent(authorId);
  const people: People = {};
  const names = "abcdefghijklmno".split("");
  for (const name of names) {
    people[name] = await createUser(`Informe ${name.toUpperCase()}`);
  }
  const notified = async (
    name: string,
    email: EmailOptions | null,
    extra: Partial<RecipientOptions> = {},
  ) => {
    const item = await addRecipient(sent, people[name]!, {
      status: "notified",
      ...extra,
    });
    if (email) await addEmail(item!, email);
    return item!;
  };

  const a = await notified(
    "a",
    { status: "sent", providerId: `prov-a-${sent.id}`, contentRevision: 2 },
    { read: true },
  );
  await addPush(a, "sent");
  await addPush(a, "failed");
  await notified(
    "b",
    { status: "sent", providerId: `prov-b-${sent.id}`, contentRevision: 1 },
    { source: "person" },
  );
  await notified(
    "c",
    { status: "sent", lastError: "idempotent_replay" },
    { source: "staging_admin" },
  );
  await notified("d", { status: "skipped", lastError: "unsubscribed" });
  await unsubscribe(people.d!, "all");
  await unsubscribe(people.d!, "announcements");
  await notified("e", { status: "skipped", lastError: "unsubscribed" });
  await unsubscribe(people.e!, "announcements");
  await notified("f", { status: "skipped", lastError: "suppressed" });
  await notified("g", {
    status: "failed",
    lastError: "resend:daily_quota_exceeded",
  });
  await notified("h", { status: "pending" });
  await notified("i", {
    status: "pending",
    maybeSent: true,
    lastError: "timeout",
  });
  await notified("j", { status: "skipped", lastError: "invalid_address" });
  await addRecipient(sent, people.k!, { status: "pending" });
  await addRecipient(sent, people.l!, {
    status: "skipped",
    reason: "Cuenta suspendida",
  });
  await addRecipient(sent, people.m!, { status: "skipped", reason: STAGING });
  await addRecipient(sent, people.n!, { status: "failed", source: null });
  await addRecipient(sent, people.o!, { status: "skipped", reason: RETRACTED });

  // a bounced from this very email; b's address bounced from another one.
  await bounce(people.a!, `prov-a-${sent.id}`);
  await bounce(people.b!, `prov-elsewhere-${sent.id}`);
  return { sent, people };
}

async function rowsOf(
  comunicadoId: number,
  opts: Partial<Parameters<Report["fetchComunicadoRecipients"]>[1]> = {},
) {
  const page = await report.fetchComunicadoRecipients(comunicadoId, {
    filter: "all",
    query: "",
    page: 1,
    ...opts,
  });
  if (!page) throw new Error("expected a page of recipients");
  return page;
}

function idsOf(page: { rows: { userId: number }[] }) {
  return page.rows.map((row) => row.userId).sort((x, y) => x - y);
}

function pick(people: People, names: string) {
  return names
    .split("")
    .map((name) => people[name]!)
    .sort((x, y) => x - y);
}

describeDatabase("comunicado report", () => {
  let logSpy: MockInstance<typeof console.log>;
  let errorSpy: MockInstance<typeof console.error>;
  let warnSpy: MockInstance<typeof console.warn>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = "https://glitter.test";
    report = await import("@/app/lib/comunicados/report");
    queries = await import("@/app/lib/comunicados/queries");
    retry = await import("@/app/lib/comunicados/retry");

    try {
      await pool!.query(
        `SELECT id, audience_summary, current_revision FROM comunicados LIMIT 1`,
      );
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    // The app's database logger prints every statement with its params.
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error");
    warnSpy = vi.spyOn(console, "warn");
  });

  afterEach(async () => {
    try {
      expect(errorSpy).not.toHaveBeenCalled();
      // No address ever travels as a parameter of the report's statements,
      // nor reaches a warning.
      for (const call of [...logSpy.mock.calls, ...warnSpy.mock.calls]) {
        expect(JSON.stringify(call)).not.toContain("@");
      }
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      state.viewer = null;
      state.vercelEnv = "production";
      await cleanUp();
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("fetchComunicadoReport", () => {
    it("counts the KPIs over every recipient, item and email state", async () => {
      const admin = await signInAsAdmin();
      const { sent } = await mixedReport(admin);

      const result = await report.fetchComunicadoReport(sent.id);

      expect(result).toMatchObject({
        id: sent.id,
        campaignId: sent.campaignId,
        campaignStatus: "processing",
        currentRevision: 2,
        title: "Cambio de horario v2",
        html: "<p>Texto de la versión 2</p>",
        sentAt: new Date("2026-10-24T14:14:00Z"),
        sentByName: "Dennis Admin",
        sendEmail: true,
        sendPush: true,
        retractedAt: null,
        summary: summaryFor(),
      });
      expect(result!.kpis).toEqual({
        // a–j notified, k still pending.
        recipients: 11,
        // l suspended, n failed, o retracted; m is the narrowing's own.
        notReceived: 3,
        stagingSkipped: 1,
        read: 1,
        notified: 10,
        emailSent: 3,
        // sent a, b, c + queued h, i + failed g.
        emailPlanned: 6,
        emailUnsubscribed: 2,
        emailSuppressed: 1,
        emailFailed: 1,
        emailOtherSkipped: 1,
        emailQueued: 2,
        maybeSent: 1,
        // Only a's bounce came from this comunicado.
        bounces: 1,
        // c's replay carries no provider id and is not confirmed per person.
        confirmedSent: 2,
        pushSent: 1,
        pushTotal: 2,
        pendingRecipients: 1,
      });
      expect(result!.banners).toMatchObject({
        quota: true,
        configStalled: false,
        stalledSince: null,
      });
    });

    it("counts what a retraction would reach, the maybe-sent apart", async () => {
      const admin = await signInAsAdmin();
      const { sent } = await mixedReport(admin);

      const result = await report.fetchComunicadoReport(sent.id);

      expect(result!.retractCounts).toEqual({
        people: 11,
        // h: i may have landed, so it is not counted as still to go.
        queuedEmails: 1,
        maybeSentEmails: 1,
        sentEmails: 3,
      });
    });

    it("counts what a retry would reach, as the retry then picks it", async () => {
      const admin = await signInAsAdmin();
      const { sent } = await mixedReport(admin);
      // p failed after an attempt that may have landed: never retried (V7).
      const p = await createUser();
      const pItem = await addRecipient(sent, p, { status: "notified" });
      await addEmail(pItem!, {
        status: "failed",
        lastError: "outcome_unknown",
        maybeSent: true,
      });
      // q failed and was retried already: its latest email is the new one.
      const q = await createUser();
      const qItem = await addRecipient(sent, q, { status: "notified" });
      await addEmail(qItem!, {
        status: "failed",
        lastError: "resend:validation_error",
      });
      await addEmail(qItem!, { status: "pending" });
      // r failed outright, with no attempt that may have landed.
      const r = await createUser();
      const rItem = await addRecipient(sent, r, { status: "notified" });
      await addEmail(rItem!, { status: "failed", lastError: "expired" });

      const before = await report.fetchComunicadoReport(sent.id);

      // g's quota failure and r; n, whom the fan-out gave up on; p apart.
      // i may have landed too, but is still queued, not failed.
      expect(before!.retryCounts).toEqual({
        emails: 2,
        people: 1,
        maybeSentEmails: 1,
      });
      expect(await retry.retryFailedComunicado(sent.id, admin)).toEqual({
        ok: true,
        campaignId: sent.campaignId,
        emails: before!.retryCounts.emails,
        people: before!.retryCounts.people,
      });
      const after = await report.fetchComunicadoReport(sent.id);
      expect(after!.retryCounts).toEqual({
        emails: 0,
        people: 0,
        maybeSentEmails: 1,
      });
    });

    it("reads every send of the campaign for bounces, not only the latest", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin);
      const person = await createUser();
      const item = await addRecipient(sent, person, { status: "notified" });
      await addEmail(item!, {
        status: "sent",
        providerId: `first-${sent.id}`,
        contentRevision: 1,
      });
      // A later row for the same item (a retry) is the one the table shows.
      await addEmail(item!, { status: "pending" });
      await bounce(person, `first-${sent.id}`);

      const result = await report.fetchComunicadoReport(sent.id);

      expect(result!.kpis).toMatchObject({
        bounces: 1,
        confirmedSent: 1,
        emailSent: 0,
        emailQueued: 1,
      });
    });

    it("keeps the essential record and the retraction as written", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin, {
        campaignStatus: "completed",
        currentRevision: 1,
        essential: {
          reason: "Cambió el horario de armado",
          confirmedBy: admin,
        },
        retracted: { reason: "Salió con la fecha equivocada", by: admin },
        summary: summaryFor({
          essentialFestival: { id: 3, name: "Glitter Navidad 2026" },
          essentialOverride: 30,
          essentialNotOverridden: 4,
        }),
      });

      const result = await report.fetchComunicadoReport(sent.id);

      expect(result).toMatchObject({
        campaignStatus: "completed",
        essential: true,
        essentialReason: "Cambió el horario de armado",
        essentialConfirmedByName: "Dennis Admin",
        retractedByName: "Dennis Admin",
        retractReason: "Salió con la fecha equivocada",
        summary: {
          essentialFestival: { id: 3, name: "Glitter Navidad 2026" },
          essentialOverride: 30,
        },
      });
      expect(result!.essentialConfirmedAt).toBeInstanceOf(Date);
      expect(result!.retractedAt).toBeInstanceOf(Date);
    });

    it("names who sent, confirmed and retracted it without a display name", async () => {
      await signInAsAdmin();
      const author = await createUser();
      await pool!.query(
        `UPDATE users SET display_name = NULL, first_name = 'Ana', last_name = 'Rojas'
         WHERE id = $1`,
        [author],
      );
      const sent = await insertSent(author, {
        essential: {
          reason: "Cambió el horario de armado",
          confirmedBy: author,
        },
        retracted: { reason: "Salió con la fecha equivocada", by: author },
      });

      const result = await report.fetchComunicadoReport(sent.id);

      expect(result).toMatchObject({
        sentByName: "Ana Rojas",
        essentialConfirmedByName: "Ana Rojas",
        retractedByName: "Ana Rojas",
      });
    });

    it("reads an unparseable summary as none, and keeps the rest", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin, { summary: { v: 2 } });

      const result = await report.fetchComunicadoReport(sent.id);

      expect(result).not.toBeNull();
      expect(result!.summary).toBeNull();
    });

    it("is null for a draft, a missing comunicado and anyone but a global admin", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin);
      const draft = await pool!.query<{ id: number }>(
        `INSERT INTO comunicados (title, created_by_user_id) VALUES ('Borrador', $1)
         RETURNING id`,
        [admin],
      );
      created.comunicados.push(draft.rows[0]!.id);

      expect(await report.fetchComunicadoReport(draft.rows[0]!.id)).toBeNull();
      expect(
        await report.fetchComunicadoRecipients(draft.rows[0]!.id, {
          filter: "all",
          query: "",
          page: 1,
        }),
      ).toBeNull();
      expect(await report.fetchComunicadoReport(2_147_483_000)).toBeNull();

      for (const role of ["festival_admin", "user"] as const) {
        state.viewer = { id: admin, role };
        expect(await report.fetchComunicadoReport(sent.id)).toBeNull();
        expect(
          await report.fetchComunicadoRecipients(sent.id, {
            filter: "all",
            query: "",
            page: 1,
          }),
        ).toBeNull();
      }
      state.viewer = null;
      expect(await report.fetchComunicadoReport(sent.id)).toBeNull();
    });
  });

  describe("banners", () => {
    it("says the send stopped on Resend's config only when the oldest pending email says so", async () => {
      const admin = await signInAsAdmin();
      const stopped = await insertSent(admin);
      const moving = await insertSent(admin);
      for (const [sent, errors] of [
        [stopped, ["resend:invalid_api_key", null]],
        [moving, [null, "resend:invalid_from_address"]],
      ] as const) {
        for (const lastError of errors) {
          const item = await addRecipient(sent, await createUser(), {
            status: "notified",
          });
          await addEmail(item!, { status: "pending", lastError });
        }
      }

      expect(
        (await report.fetchComunicadoReport(stopped.id))!.banners.configStalled,
      ).toBe(true);
      expect(
        (await report.fetchComunicadoReport(moving.id))!.banners.configStalled,
      ).toBe(false);
    });

    it("flags a quota only when a latest email failed on it", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin);
      const item = await addRecipient(sent, await createUser(), {
        status: "notified",
      });
      await addEmail(item!, {
        status: "failed",
        lastError: "resend:monthly_quota_exceeded",
      });
      expect((await report.fetchComunicadoReport(sent.id))!.banners.quota).toBe(
        true,
      );

      // A retry superseded it: the latest row is what counts.
      await addEmail(item!, { status: "sent", providerId: `retry-${sent.id}` });
      expect((await report.fetchComunicadoReport(sent.id))!.banners.quota).toBe(
        false,
      );
    });

    it("says it stalled when email waits and nothing settled in ten minutes", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin, { campaignAgeMinutes: 45 });
      const settled = await addRecipient(sent, await createUser(), {
        status: "notified",
      });
      await addEmail(settled!, {
        status: "sent",
        providerId: `stall-${sent.id}`,
        updatedMinutesAgo: 20,
      });
      const waiting = await addRecipient(sent, await createUser(), {
        status: "notified",
      });
      await addEmail(waiting!, { status: "pending", updatedMinutesAgo: 1 });

      const stalled = await report.fetchComunicadoReport(sent.id);
      const since = stalled!.banners.stalledSince;
      expect(since).toBeInstanceOf(Date);
      // Since the last email settled, not since the send.
      expect(Date.now() - since!.getTime()).toBeGreaterThan(19 * 60_000);
      expect(Date.now() - since!.getTime()).toBeLessThan(21 * 60_000);

      // Something settled a minute ago: it is moving.
      const moved = await addRecipient(sent, await createUser(), {
        status: "notified",
      });
      await addEmail(moved!, { status: "failed", updatedMinutesAgo: 1 });
      expect(
        (await report.fetchComunicadoReport(sent.id))!.banners.stalledSince,
      ).toBeNull();
    });

    it("counts a stall from the send when nothing settled yet, and never once it is done", async () => {
      const admin = await signInAsAdmin();
      const old = await insertSent(admin, { campaignAgeMinutes: 30 });
      const item = await addRecipient(old, await createUser(), {
        status: "notified",
      });
      await addEmail(item!, { status: "processing", updatedMinutesAgo: 2 });
      const since = (await report.fetchComunicadoReport(old.id))!.banners
        .stalledSince;
      expect(Date.now() - since!.getTime()).toBeGreaterThan(29 * 60_000);

      const fresh = await insertSent(admin, { campaignAgeMinutes: 5 });
      const freshItem = await addRecipient(fresh, await createUser(), {
        status: "notified",
      });
      await addEmail(freshItem!, { status: "pending" });
      expect(
        (await report.fetchComunicadoReport(fresh.id))!.banners.stalledSince,
      ).toBeNull();

      // Nothing waiting, or the campaign is done: no stall.
      const idle = await insertSent(admin, { campaignAgeMinutes: 30 });
      await addRecipient(idle, await createUser(), { status: "pending" });
      expect(
        (await report.fetchComunicadoReport(idle.id))!.banners.stalledSince,
      ).toBeNull();
      const done = await insertSent(admin, {
        campaignAgeMinutes: 30,
        campaignStatus: "completed",
      });
      const doneItem = await addRecipient(done, await createUser(), {
        status: "notified",
      });
      await addEmail(doneItem!, { status: "pending" });
      expect(
        (await report.fetchComunicadoReport(done.id))!.banners.stalledSince,
      ).toBeNull();
    });
  });

  describe("fetchComunicadoRecipients", () => {
    it("labels each person's row from their recipient, item and latest email", async () => {
      const admin = await signInAsAdmin();
      const { sent, people } = await mixedReport(admin);

      const page = await rowsOf(sent.id);

      expect(page.total).toBe(15);
      const byId = new Map(page.rows.map((row) => [row.userId, row]));
      const row = (name: string) => byId.get(people[name]!)!;
      expect(row("a")).toMatchObject({
        name: "Informe A",
        source: "list",
        app: "Leído",
        emailLabel: "Enviado 10:14 AM",
        device: "Enviada a 1",
      });
      expect(row("a").email).toMatch(/^report-.*@example\.com$/);
      expect(row("b")).toMatchObject({
        source: "person",
        app: "No leído",
        emailLabel: "Enviado 10:14 AM · versión 1",
        device: "Sin dispositivos",
      });
      expect(row("c")).toMatchObject({
        source: "staging_admin",
        emailLabel: "Enviado (sin confirmación por persona)",
      });
      expect(row("d").emailLabel).toBe("Se dio de baja de los correos masivos");
      expect(row("e").emailLabel).toBe("Se dio de baja de los anuncios");
      expect(row("f").emailLabel).toBe("Correo bloqueado (rebote o spam)");
      expect(row("g").emailLabel).toBe("Límite de Resend");
      expect(row("h").emailLabel).toBe("En cola");
      expect(row("i").emailLabel).toBe("En cola (puede haber llegado)");
      expect(row("j").emailLabel).toBe("Correo inválido");
      expect(row("k")).toMatchObject({
        app: "En cola",
        emailLabel: "En cola",
        device: "—",
      });
      expect(row("l")).toMatchObject({
        app: "Omitido: Cuenta suspendida",
        emailLabel: "—",
      });
      expect(row("m").app).toBe(`Omitido: ${STAGING}`);
      expect(row("n")).toMatchObject({
        source: null,
        app: "Falló",
        emailLabel: "—",
      });
      expect(row("o").app).toBe(RETRACTED);
    });

    it("says no email went when it was not ticked", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin, {
        sendEmail: false,
        sendPush: false,
      });
      const person = await createUser();
      const item = await addRecipient(sent, person, { status: "notified" });
      await addPush(item!, "sent");

      const page = await rowsOf(sent.id);

      expect(page.rows).toEqual([
        expect.objectContaining({
          userId: person,
          emailLabel: "Sin correo",
          device: "—",
        }),
      ]);
    });

    it("narrows to each chip", async () => {
      const admin = await signInAsAdmin();
      const { sent, people } = await mixedReport(admin);

      expect(idsOf(await rowsOf(sent.id, { filter: "unread" }))).toEqual(
        pick(people, "bcdefghij"),
      );
      expect(
        idsOf(await rowsOf(sent.id, { filter: "email_not_sent" })),
      ).toEqual(pick(people, "defgj"));
      expect(idsOf(await rowsOf(sent.id, { filter: "skipped" }))).toEqual(
        pick(people, "lmo"),
      );
      expect(idsOf(await rowsOf(sent.id, { filter: "error" }))).toEqual(
        pick(people, "gn"),
      );
      expect(idsOf(await rowsOf(sent.id, { filter: "all" }))).toEqual(
        pick(people, "abcdefghijklmno"),
      );
    });

    it("finds people by name or by their address, within the chip", async () => {
      const admin = await signInAsAdmin();
      const { sent, people } = await mixedReport(admin);
      const address = await pool!.query<{ local: string }>(
        `SELECT split_part(email, '@', 1) AS local FROM users WHERE id = $1`,
        [people.c!],
      );

      expect(idsOf(await rowsOf(sent.id, { query: "informe g" }))).toEqual([
        people.g,
      ]);
      expect(
        idsOf(await rowsOf(sent.id, { query: address.rows[0]!.local })),
      ).toEqual([people.c]);
      expect(
        idsOf(await rowsOf(sent.id, { query: "informe", filter: "error" })),
      ).toEqual(pick(people, "gn"));
      const none = await rowsOf(sent.id, { query: "nadie se llama así" });
      expect(none).toMatchObject({ rows: [], total: 0, page: 1, pageCount: 1 });
    });

    it("pages 50 at a time by name, and shows the last page past the end", async () => {
      const admin = await signInAsAdmin();
      const sent = await insertSent(admin);
      const prefix = `Paginada ${randomUUID().slice(0, 6)}`;
      // Written out of order, so the order is the query's.
      const numbers = Array.from({ length: 60 }, (_, i) => 60 - i);
      for (const number of numbers) {
        const person = await createUser(
          `${prefix} ${String(number).padStart(2, "0")}`,
        );
        await addRecipient(sent, person, { status: "pending" });
      }

      const first = await rowsOf(sent.id);
      expect(first).toMatchObject({ total: 60, page: 1, pageCount: 2 });
      expect(first.rows).toHaveLength(50);
      expect(first.rows[0]!.name).toBe(`${prefix} 01`);
      expect(first.rows[49]!.name).toBe(`${prefix} 50`);

      const second = await rowsOf(sent.id, { page: 2 });
      expect(second).toMatchObject({ total: 60, page: 2, pageCount: 2 });
      expect(second.rows.map((row) => row.name)).toEqual(
        Array.from(
          { length: 10 },
          (_, i) => `${prefix} ${String(51 + i).padStart(2, "0")}`,
        ),
      );

      const past = await rowsOf(sent.id, { page: 9 });
      expect(past.page).toBe(2);
      expect(past.rows).toHaveLength(10);
      expect((await rowsOf(sent.id, { page: 0 })).page).toBe(1);
    });
  });

  describe("list stats", () => {
    it("counts a sent row as its report does, and leaves the rest without", async () => {
      const admin = await signInAsAdmin();
      const { sent } = await mixedReport(admin);
      const noEmail = await insertSent(admin, { sendEmail: false });
      await addRecipient(noEmail, await createUser(), { status: "pending" });
      const nobody = await insertSent(admin);

      const list = await queries.fetchComunicadoList({ tab: "sent", page: 1 });
      const byId = new Map(list.rows.map((row) => [row.id, row]));

      const full = await report.fetchComunicadoReport(sent.id);
      expect(byId.get(sent.id)!.stats).toEqual({
        recipients: full!.kpis.recipients,
        emailsSent: full!.kpis.emailSent,
        // 1 read of 11.
        readPercent: 9,
      });
      expect(byId.get(noEmail.id)!.stats).toEqual({
        recipients: 1,
        emailsSent: null,
        readPercent: 0,
      });
      expect(byId.get(nobody.id)!.stats).toEqual({
        recipients: 0,
        emailsSent: 0,
        readPercent: null,
      });

      const drafts = await queries.fetchComunicadoList({
        tab: "drafts",
        page: 1,
      });
      expect(drafts.rows.every((row) => row.stats === null)).toBe(true);
    });
  });
});
