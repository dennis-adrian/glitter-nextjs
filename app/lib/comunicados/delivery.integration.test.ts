// @vitest-environment node

import { randomUUID } from "crypto";
import { inArray, sql } from "drizzle-orm";
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

import {
  COMUNICADO_STAGING_NOTE,
  comunicadoEssentialNote,
} from "@/app/emails/comunicado";
import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import type {
  BulkEmailRun,
  BulkTiming,
} from "@/app/lib/notifications/bulk-email";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  emailSuppressions,
  emailUnsubscribes,
  notificationCampaigns,
  notifications,
  pendingUserDeletions,
  users,
} from "@/db/schema";

/**
 * The comunicado renderer on the real bulk lane
 * (docs/IMPLEMENTATION-comunicados.md D3, D7, D8, D9): the content lock, the
 * pre-check's allowlist, the staging and essential marks, the headers, and
 * the environment filter of a lane-wide run. Resend is mocked; the claim,
 * the settle and the rendering are real. No fan-out writes the rows here: a
 * sent comunicado, its recipients, inbox items and bulk emails are inserted
 * as the send and the fan-out leave them. Every assertion is about this
 * file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The one network call: a batch to Resend.
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: sendBatchMock,
}));

const state = vi.hoisted(() => ({ vercelEnv: "production" }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => null,
  requireAdmin: async () => null,
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

type BulkEmail = typeof import("@/app/lib/notifications/bulk-email");
type Tokens = typeof import("@/app/lib/emails/unsubscribe-tokens");
let bulk: BulkEmail;
let tokens: Tokens;

const BASE_URL = "https://glitter.test";
const FROM = "Productora Glitter <anuncios@productoraglitter.com>";
const FROM_STAGING =
  "Productora Glitter (prueba) <anuncios@productoraglitter.com>";
const REPLY_TO = "soporte@productoraglitter.com";
const FESTIVAL = "Festival de Invierno";
const COMUNICADO_LOCK_NS = 8155;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** No test waits on the production waits. */
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
  deletions: [] as number[],
};

type Role = "admin" | "festival_admin" | "user";
type Status = "verified" | "pending" | "banned" | "paused";
type Source = "list" | "person" | "staging_admin" | null;
type Env = ComunicadoAudienceSummary["env"];

async function createUser(
  role: Role = "user",
  status: Status = "verified",
): Promise<{ id: number; email: string }> {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `lane-it-${suffix}`,
      email: `lane-it-${suffix}@example.test`,
      firstName: "Ana",
      lastName: "Ilustra",
      role,
      status,
    })
    .returning({ id: users.id, email: users.email });
  created.users.push(user!.id);
  return user!;
}

function summaryFor(env: Env, essential: boolean): ComunicadoAudienceSummary {
  return {
    v: 1,
    env,
    narrowed: env !== "production",
    sources: [],
    matched: 0,
    eligible: 0,
    willReceive: 0,
    stagingAdmins: 0,
    pickedByName: 0,
    skipped: [],
    channels: { email: true, push: false },
    email: {
      sendTo: 0,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
    },
    essentialFestival: essential ? { id: 1, name: FESTIVAL } : null,
    essentialOverride: 0,
    essentialNotOverridden: 0,
  };
}

function doc(text: string) {
  return [
    {
      type: "paragraph",
      props: {},
      content: [{ type: "text", text, styles: {} }],
      children: [],
    },
  ];
}

type Sent = { campaignId: number; comunicadoId: number };

/**
 * A comunicado as the send leaves it: a processing campaign, the sent row
 * with its frozen summary, and its revisions up to `revisions`.
 */
async function insertSent({
  env = "production",
  essential = false,
  revisions = 1,
}: { env?: Env; essential?: boolean; revisions?: number } = {}): Promise<Sent> {
  const author = await createUser("admin");
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key)
     VALUES ('comunicado', 'processing', $1, 'Texto enviado', $2, $3)
     RETURNING id`,
    [`Revisión ${revisions}`, author.id, `comunicado:test-${randomUUID()}`],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, sent_at, sent_by_user_id,
        audience_summary, send_email, send_push, essential, essential_reason,
        essential_confirmed_by_user_id, essential_confirmed_at,
        created_by_user_id, updated_by_user_id)
     VALUES ('sent', $1, $2, $3, now(), $4, $5::jsonb, true, false, $6,
             CASE WHEN $6 THEN 'Cambia el horario de armado' END,
             CASE WHEN $6 THEN $4::int END, CASE WHEN $6 THEN now() END, $4, $4)
     RETURNING id`,
    [
      `Revisión ${revisions}`,
      campaignId,
      revisions,
      author.id,
      JSON.stringify(summaryFor(env, essential)),
      essential,
    ],
  );
  const comunicadoId = comunicado.rows[0]!.id;
  created.comunicados.push(comunicadoId);
  for (let revision = 1; revision <= revisions; revision += 1) {
    const text = `Texto de la revisión ${revision}.`;
    await pool!.query(
      `INSERT INTO comunicado_revisions
         (comunicado_id, revision, title, doc, html, text, created_by_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [
        comunicadoId,
        revision,
        `Revisión ${revision}`,
        JSON.stringify(doc(text)),
        `<p>${text}</p>`,
        text,
        author.id,
      ],
    );
  }
  return { campaignId, comunicadoId };
}

/** A campaign whose comunicado row is missing, as no send ever leaves one. */
async function insertOrphanCampaign() {
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns (type, status, title, message, idempotency_key)
     VALUES ('comunicado', 'processing', 'Huérfana', 'Texto', $1)
     RETURNING id`,
    [`comunicado:test-${randomUUID()}`],
  );
  created.campaigns.push(campaign.rows[0]!.id);
  return campaign.rows[0]!.id;
}

type Queued = {
  userId: number;
  email: string;
  notificationId: number;
  deliveryId: number;
};

/**
 * One person of `campaignId` as the fan-out leaves them: a recipient row
 * with `source` (none when `source` is "none"), their inbox item, and its
 * bulk email to the address on their profile. `delivery` sets columns as an
 * earlier attempt would have left them.
 */
async function queue(
  { campaignId, comunicadoId }: Sent | { campaignId: number; comunicadoId: 0 },
  source: Source | "none",
  {
    role = "user",
    status = "verified",
    delivery = {},
  }: {
    role?: Role;
    status?: Status;
    delivery?: {
      batchKey?: string;
      maybeSent?: boolean;
      attempts?: number;
    };
  } = {},
): Promise<Queued> {
  const person = await createUser(role, status);
  if (source !== "none") {
    await pool!.query(
      `INSERT INTO notification_campaign_recipients
         (campaign_id, user_id, status, source, processed_at)
       VALUES ($1, $2, 'notified', $3::campaign_recipient_source, now())`,
      [campaignId, person.id, source],
    );
  }
  const item = await pool!.query<{ id: number }>(
    `INSERT INTO notifications
       (user_id, kind, category, title, body, campaign_id, dedupe_key)
     VALUES ($1, 'comunicado', 'announcements', 'Revisión', 'Texto', $2, $3)
     RETURNING id`,
    [person.id, campaignId, `comunicado:${comunicadoId || randomUUID()}`],
  );
  const notificationId = item.rows[0]!.id;
  const row = await pool!.query<{ id: number }>(
    `INSERT INTO notification_deliveries
       (notification_id, user_id, template_key, channel, lane, recipient_email,
        payload, idempotency_key, batch_key, maybe_sent_at, attempts)
     SELECT $1, u.id, 'comunicado', 'email', 'bulk', u.email, $2::jsonb,
            'notification:' || $1::int || ':email', $3::text,
            CASE WHEN $4 THEN now() END, $5
     FROM users u WHERE u.id = $6
     RETURNING id`,
    [
      notificationId,
      JSON.stringify({ comunicadoId }),
      delivery.batchKey ?? null,
      delivery.maybeSent ?? false,
      delivery.attempts ?? 0,
      person.id,
    ],
  );
  return {
    userId: person.id,
    email: person.email,
    notificationId,
    deliveryId: row.rows[0]!.id,
  };
}

type DeliveryRow = {
  id: number;
  status: string;
  last_error: string | null;
  attempts: number;
  batch_key: string | null;
  maybe_sent: boolean;
  content_revision: number | null;
  provider_message_id: string | null;
  lease_owner: string | null;
};

async function deliveryOf(queued: Queued): Promise<DeliveryRow> {
  const { rows } = await pool!.query<DeliveryRow>(
    `SELECT id, status, last_error, attempts, batch_key,
            maybe_sent_at IS NOT NULL AS maybe_sent, content_revision,
            provider_message_id, lease_owner
     FROM notification_deliveries WHERE id = $1`,
    [queued.deliveryId],
  );
  return rows[0]!;
}

async function unsubscribe(email: string, topic: "all" | "announcements") {
  await pool!.query(
    "INSERT INTO email_unsubscribes (email_key, topic) VALUES (lower(trim($1)), $2)",
    [email, topic],
  );
}

async function suppress(email: string) {
  await pool!.query(
    "INSERT INTO email_suppressions (email_key, reason) VALUES (lower(trim($1)), 'bounce')",
    [email],
  );
}

async function markDeleting(userId: number) {
  const [row] = await integrationDb!
    .insert(pendingUserDeletions)
    .values({ userId, clerkId: `lane-it-del-${randomUUID()}` })
    .returning({ id: pendingUserDeletions.id });
  created.deletions.push(row!.id);
}

type BatchEmail = {
  from: string;
  to: string[];
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags: { name: string; value: string }[];
};
type BatchCall = {
  emails: BatchEmail[];
  options: { idempotencyKey: string; batchValidation?: string };
};
const batchCalls: BatchCall[] = [];

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

/** The email sent to `queued`, from the one request that carried it. */
function emailTo(queued: Queued) {
  const found = batchCalls
    .flatMap((call) => call.emails)
    .filter((email) => email.to.includes(queued.email));
  expect(found).toHaveLength(1);
  return found[0]!;
}

function runLane(campaignId?: number): Promise<BulkEmailRun> {
  return bulk.sendBulkEmails({
    ...(campaignId === undefined ? {} : { campaignId }),
    deadline: Date.now() + 60_000,
    timing: FAST,
  });
}

describeDatabase("comunicado emails on the bulk lane", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleLog: MockInstance<typeof console.log>;

  /** console.error lines a test expects, read and cleared. */
  function takeErrors() {
    const lines = consoleError.mock.calls.map((args) =>
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    );
    consoleError.mockClear();
    return lines;
  }

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    bulk = await import("@/app/lib/notifications/bulk-email");
    tokens = await import("@/app/lib/emails/unsubscribe-tokens");

    // The lane writes through the app's pool: it must be this database.
    const { db } = await import("@/db");
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(rows[0]?.name).toBe(
      decodeURIComponent(new URL(testDatabaseUrl!).pathname.slice(1)),
    );
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

  beforeEach(() => {
    batchCalls.length = 0;
    sendBatchMock.mockReset();
    sendBatchMock.mockImplementation(
      async (emails: BatchEmail[], options: BatchCall["options"]) => {
        batchCalls.push({ emails, options });
        return accepted(emails);
      },
    );
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The app's `db` logs every statement; the lane goes through it.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  async function cleanUp() {
    const db = integrationDb!;
    if (created.campaigns.length > 0) {
      // Deliveries go with their inbox item.
      await db
        .delete(notifications)
        .where(inArray(notifications.campaignId, created.campaigns));
    }
    if (created.comunicados.length > 0) {
      await db
        .delete(comunicadoRevisions)
        .where(inArray(comunicadoRevisions.comunicadoId, created.comunicados));
      await db
        .delete(comunicados)
        .where(inArray(comunicados.id, created.comunicados));
    }
    if (created.campaigns.length > 0) {
      // Recipients cascade.
      await db
        .delete(notificationCampaigns)
        .where(inArray(notificationCampaigns.id, created.campaigns));
    }
    if (created.deletions.length > 0) {
      await db
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.id, created.deletions));
    }
    if (created.users.length > 0) {
      const keys = sql`(SELECT lower(trim(email)) FROM users WHERE id = ANY(${sql.param(created.users)}::int[]))`;
      await db
        .delete(emailUnsubscribes)
        .where(sql`${emailUnsubscribes.emailKey} IN ${keys}`);
      await db
        .delete(emailSuppressions)
        .where(sql`${emailSuppressions.emailKey} IN ${keys}`);
      await db.delete(users).where(inArray(users.id, created.users));
    }
    for (const ids of Object.values(created)) ids.length = 0;
  }

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = takeErrors();
    const lines = JSON.stringify([
      ...consoleWarn.mock.calls,
      ...consoleLog.mock.calls.filter((args) =>
        String(args[0]).startsWith("[comunicados]"),
      ),
    ]);
    // Every statement the app ran, with its params: an address in any of
    // them would be in the logs.
    const statements = JSON.stringify(consoleLog.mock.calls);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
    state.vercelEnv = "production";
    await cleanUp();
    expect(errors).toEqual([]);
    expect(lines).not.toContain("@");
    expect(statements).not.toContain("@");
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    const { pool: appPool } = await import("@/db");
    await appPool.end();
  });

  it("sends each person the current revision, with the one-click headers, both tags and the key its claim committed", async () => {
    const sent = await insertSent({ revisions: 2 });
    const ana = await queue(sent, "list");
    const bruno = await queue(sent, "list");

    const run = await runLane(sent.campaignId);

    expect(run).toMatchObject({ batches: 1, requests: 1, sent: 2 });
    expect(batchCalls).toHaveLength(1);
    const [call] = batchCalls;
    expect(call!.options).toEqual({
      idempotencyKey: expect.stringMatching(
        new RegExp(`^comunicado-batch:${sent.campaignId}:${UUID}$`),
      ),
      batchValidation: "permissive",
    });

    for (const person of [ana, bruno]) {
      const email = emailTo(person);
      expect(email).toMatchObject({
        from: FROM,
        to: [person.email],
        replyTo: REPLY_TO,
        subject: "Revisión 2",
        tags: [
          { name: "category", value: "comunicado" },
          { name: "comunicado_id", value: String(sent.comunicadoId) },
        ],
      });
      // The link is this person's, for Anuncios.
      const oneClick = email.headers?.["List-Unsubscribe"] ?? "";
      const token = new URL(oneClick.slice(1, -1)).searchParams.get("token");
      expect(oneClick).toMatch(
        /^<https:\/\/glitter\.test\/api\/email\/unsubscribe\?token=/,
      );
      expect(tokens.verifyUnsubscribeToken(token)).toEqual({
        kind: "user",
        id: person.userId,
        topic: "announcements",
      });
      expect(email.headers?.["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
      expect(email.text).toContain("¡Hola Ana Ilustra!");
      expect(email.text).toContain("Texto de la revisión 2.");
      expect(email.text).not.toContain("revisión 1");
      expect(email.text).toContain(
        `Darme de baja: ${BASE_URL}/email/unsubscribe?token=`,
      );
      expect(email.text).not.toContain(COMUNICADO_STAGING_NOTE);
      expect(email.html).toContain("Texto de la revisión 2.");

      expect(await deliveryOf(person)).toMatchObject({
        status: "sent",
        last_error: null,
        content_revision: 2,
        batch_key: call!.options.idempotencyKey,
        provider_message_id: expect.stringMatching(/^re_/),
      });
    }
    expect(consoleLog).toHaveBeenCalledWith("[comunicados] render", {
      campaignId: sent.campaignId,
      size: 2,
      ms: expect.any(Number),
    });
  });

  it("fails closed for a row with no recipient row, and one whose recipient has no source", async () => {
    const sent = await insertSent();
    const noRecipient = await queue(sent, "none");
    const noSource = await queue(sent, null);
    const listed = await queue(sent, "list");

    await runLane(sent.campaignId);

    for (const person of [noRecipient, noSource]) {
      expect(await deliveryOf(person)).toMatchObject({
        status: "skipped",
        last_error: "not_eligible",
      });
    }
    expect((await deliveryOf(listed)).status).toBe("sent");
    expect(batchCalls.flatMap((call) => call.emails)).toHaveLength(1);
  });

  it("mails each person only while they are still eligible for how they entered the audience", async () => {
    const sent = await insertSent();
    const cases = [
      { source: "list", role: "user", status: "paused", sent: true },
      { source: "list", role: "admin", status: "verified", sent: false },
      { source: "list", role: "user", status: "banned", sent: false },
      { source: "list", role: "user", status: "pending", sent: false },
      { source: "person", role: "admin", status: "verified", sent: true },
      {
        source: "person",
        role: "festival_admin",
        status: "verified",
        sent: false,
      },
      { source: "person", role: "admin", status: "banned", sent: false },
      {
        source: "staging_admin",
        role: "admin",
        status: "verified",
        sent: true,
      },
      {
        source: "staging_admin",
        role: "user",
        status: "verified",
        sent: false,
      },
    ] as const;
    const queued = [];
    for (const { source, role, status } of cases) {
      queued.push(await queue(sent, source, { role, status }));
    }

    await runLane(sent.campaignId);

    for (const [index, expected] of cases.entries()) {
      expect({ ...expected, row: await deliveryOf(queued[index]!) }).toEqual({
        ...expected,
        row: expect.objectContaining(
          expected.sent
            ? { status: "sent" }
            : { status: "skipped", last_error: "not_eligible" },
        ),
      });
    }
  });

  it("outside production mails only people picked by name and the admins, with the staging marks", async () => {
    state.vercelEnv = "preview";
    const sent = await insertSent({ env: "preview" });
    // A list member's row that slipped through to a preview's lane.
    const listed = await queue(sent, "list");
    const picked = await queue(sent, "person");
    const admin = await queue(sent, "staging_admin", { role: "admin" });

    await runLane(sent.campaignId);

    expect(await deliveryOf(listed)).toMatchObject({
      status: "skipped",
      last_error: "staging",
    });
    for (const person of [picked, admin]) {
      expect((await deliveryOf(person)).status).toBe("sent");
      const email = emailTo(person);
      expect(email.from).toBe(FROM_STAGING);
      expect(email.subject).toBe("[Prev] Revisión 1");
      expect(email.text).toContain(COMUNICADO_STAGING_NOTE);
      expect(email.html).toContain("entorno de prueba de Glitter");
    }
    expect(batchCalls.flatMap((call) => call.emails)).toHaveLength(2);
  });

  it("skips someone whose profile is being deleted", async () => {
    const sent = await insertSent();
    const leaving = await queue(sent, "list");
    await markDeleting(leaving.userId);

    await runLane(sent.campaignId);

    expect(await deliveryOf(leaving)).toMatchObject({
      status: "skipped",
      last_error: "deleting",
    });
    expect(sendBatchMock).not.toHaveBeenCalled();
  });

  it("skips every row of a retracted comunicado, and a row whose inbox item was retracted", async () => {
    const retracted = await insertSent();
    const gone = [
      await queue(retracted, "list"),
      await queue(retracted, "list"),
    ];
    await pool!.query(
      "UPDATE comunicados SET retracted_at = now(), retract_reason = 'Error en la fecha' WHERE id = $1",
      [retracted.comunicadoId],
    );
    const sent = await insertSent();
    const itemGone = await queue(sent, "list");
    const kept = await queue(sent, "list");
    await pool!.query(
      "UPDATE notifications SET retracted_at = now(), archived_at = now() WHERE id = $1",
      [itemGone.notificationId],
    );

    await runLane(retracted.campaignId);
    expect(sendBatchMock).not.toHaveBeenCalled();
    await runLane(sent.campaignId);

    for (const person of [...gone, itemGone]) {
      expect(await deliveryOf(person)).toMatchObject({
        status: "skipped",
        last_error: "retracted",
      });
    }
    expect((await deliveryOf(kept)).status).toBe("sent");
    expect(batchCalls.flatMap((call) => call.emails.map((e) => e.to))).toEqual([
      [kept.email],
    ]);
  });

  it("fails a held row whose address changed, keeping its key, and sends the rest under that key", async () => {
    const sent = await insertSent();
    const heldKey = `comunicado-batch:${sent.campaignId}:${randomUUID()}`;
    const held = { batchKey: heldKey, maybeSent: true, attempts: 1 };
    const moved = await queue(sent, "list", { delivery: held });
    const stayed = await queue(sent, "list", { delivery: held });
    await pool!.query(
      "UPDATE users SET email = 'nuevo-' || email WHERE id = $1",
      [moved.userId],
    );

    await runLane(sent.campaignId);

    expect(await deliveryOf(moved)).toMatchObject({
      status: "failed",
      last_error: "address_changed",
      batch_key: heldKey,
      maybe_sent: true,
    });
    expect(await deliveryOf(stayed)).toMatchObject({
      status: "sent",
      batch_key: heldKey,
    });
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]!.options.idempotencyKey).toBe(heldKey);
    expect(batchCalls[0]!.emails.map((email) => email.to)).toEqual([
      [stayed.email],
    ]);
  });

  it("essential: reaches an Anuncios opt-out without the one-click header, but never an `all` opt-out or a suppression", async () => {
    const sent = await insertSent({ essential: true });
    const normal = await queue(sent, "list");
    const optedOut = await queue(sent, "list");
    await unsubscribe(optedOut.email, "announcements");
    const optedOutOfAll = await queue(sent, "list");
    await unsubscribe(optedOutOfAll.email, "all");
    const bounced = await queue(sent, "list");
    await suppress(bounced.email);

    await runLane(sent.campaignId);

    expect((await deliveryOf(normal)).status).toBe("sent");
    expect((await deliveryOf(optedOut)).status).toBe("sent");
    expect(await deliveryOf(optedOutOfAll)).toMatchObject({
      status: "skipped",
      last_error: "unsubscribed",
    });
    expect(await deliveryOf(bounced)).toMatchObject({
      status: "skipped",
      last_error: "suppressed",
    });

    const normalEmail = emailTo(normal);
    expect(Object.keys(normalEmail.headers ?? {})).toEqual([
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ]);
    const overriddenEmail = emailTo(optedOut);
    expect(overriddenEmail).not.toHaveProperty("headers");
    for (const email of [normalEmail, overriddenEmail]) {
      expect(email.text).toContain(comunicadoEssentialNote(FESTIVAL));
      // The footer link to the page, which explains the exception.
      expect(email.text).toContain(
        `Darme de baja: ${BASE_URL}/email/unsubscribe?token=`,
      );
    }
  });

  it("without essential, an Anuncios opt-out is skipped", async () => {
    const sent = await insertSent();
    const optedOut = await queue(sent, "list");
    await unsubscribe(optedOut.email, "announcements");

    await runLane(sent.campaignId);

    expect(await deliveryOf(optedOut)).toMatchObject({
      status: "skipped",
      last_error: "unsubscribed",
    });
    expect(sendBatchMock).not.toHaveBeenCalled();
  });

  it("lane-wide, claims only the campaigns this environment sent", async () => {
    const preview = await insertSent({ env: "preview" });
    const production = await insertSent({ env: "production" });
    const fromPreview = await queue(preview, "person");
    const fromProduction = await queue(production, "list");

    state.vercelEnv = "preview";
    await runLane();

    expect((await deliveryOf(fromPreview)).status).toBe("sent");
    expect(await deliveryOf(fromProduction)).toMatchObject({
      status: "pending",
      batch_key: null,
      lease_owner: null,
      attempts: 0,
    });

    state.vercelEnv = "production";
    await runLane();
    expect((await deliveryOf(fromProduction)).status).toBe("sent");
  });

  it("holds the comunicado's content lock, shared, while the request is out", async () => {
    const sent = await insertSent();
    await queue(sent, "list");
    const held: { mode: string; granted: boolean }[][] = [];
    sendBatchMock.mockImplementation(async (emails: BatchEmail[]) => {
      const { rows } = await pool!.query<{ mode: string; granted: boolean }>(
        `SELECT mode, granted FROM pg_locks
         WHERE locktype = 'advisory' AND classid = $1 AND objid = $2 AND objsubid = 2`,
        [COMUNICADO_LOCK_NS, sent.comunicadoId],
      );
      held.push(rows);
      return accepted(emails);
    });

    await runLane(sent.campaignId);

    expect(held).toEqual([[{ mode: "ShareLock", granted: true }]]);
  });

  it("fails closed, spending an attempt, when the campaign has no comunicado", async () => {
    const campaignId = await insertOrphanCampaign();
    const stray = await queue({ campaignId, comunicadoId: 0 }, "list");

    await runLane(campaignId);

    expect(await deliveryOf(stray)).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "render_failed",
    });
    expect(sendBatchMock).not.toHaveBeenCalled();
    expect(takeErrors()).toEqual([
      `[comunicados] batch could not be rendered {"campaignId":${campaignId},"size":1,"errorType":"Error","code":null}`,
    ]);
  });
});
