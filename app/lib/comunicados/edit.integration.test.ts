// @vitest-environment node

import { createECDH, randomBytes, randomUUID } from "crypto";
import { inArray, sql } from "drizzle-orm";
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

import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import type { BulkTiming } from "@/app/lib/notifications/bulk-email";
import { comunicadoKinds } from "@/app/lib/notifications/kinds/comunicado";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  notifications,
  pushSubscriptions,
  users,
} from "@/db/schema";

/**
 * Editing a sent comunicado against a real database
 * (docs/IMPLEMENTATION-comunicados.md F1, F2, F4, F5 V1 and V2, K7, H2): it
 * waits for the chunk or batch holding the content lock, rewrites every inbox
 * item already written, and every later chunk, batch and push carries the new
 * revision. Two connections where it waits. The fan-out, the bulk lane, the
 * comunicado renderer, the push worker and the driver are real; Resend and
 * the push service are mocked at the network call, so nothing leaves the
 * test. Every assertion is about this file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
// The two network calls: a batch to Resend, a push to the push service.
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: sendBatchMock,
}));
const sendPushMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/web-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/vendors/web-push")>()),
  sendPush: sendPushMock,
}));
// No VAPID keys unless a test sets them: until then nothing pushes.
type Vapid = { publicKey: string; privateKey: string; subject: string };
const vapid = vi.hoisted(() => ({ current: null as Vapid | null }));
vi.mock("@/app/lib/notifications/push/config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/lib/notifications/push/config")
  >()),
  pushVapidConfig: () => vapid.current,
  pushPublicKey: () => vapid.current?.publicKey ?? null,
}));
// Avisos are on for everyone here; the flag rules have their own tests.
vi.mock("@/app/lib/feature_flags/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/feature_flags/data")>()),
  fetchFeatureFlagRule: async () => ({
    visibility: "public",
    targetedUserIds: [],
  }),
}));

type Role = "admin" | "festival_admin" | "user";
type Viewer = { id: number; role: Role };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  flagOn: true,
  vercelEnv: "production",
  /** Runs inside a fan-out chunk's transaction, once its rows are written. */
  afterNotifyMany: null as null | (() => Promise<void>),
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
// The real `notifyMany`, with a hook to hold a chunk before it commits.
vi.mock("@/app/lib/notifications/notify", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/notifications/notify")>();
  return {
    ...actual,
    notifyMany: async (...args: Parameters<typeof actual.notifyMany>) => {
      const result = await actual.notifyMany(...args);
      await state.afterNotifyMany?.();
      return result;
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 6 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Edit = typeof import("@/app/lib/comunicados/edit");
type EditActions = typeof import("@/app/lib/comunicados/edit-actions");
type Retract = typeof import("@/app/lib/comunicados/retract");
type Fanout = typeof import("@/app/lib/comunicados/fanout");
type Driver = typeof import("@/app/lib/comunicados/driver");
type Report = typeof import("@/app/lib/comunicados/report");
type Revisions = typeof import("@/app/lib/comunicados/revisions");
type Content = typeof import("@/app/lib/comunicados/content");
type Render = typeof import("@/app/lib/rich-text/render");
type BulkEmail = typeof import("@/app/lib/notifications/bulk-email");
type Deliveries = typeof import("@/app/lib/notifications/deliveries");
type Inbox = typeof import("@/app/lib/notifications/queries");
type AppDb = (typeof import("@/db"))["db"];
let editMod: Edit;
let editActions: EditActions;
let retractMod: Retract;
let fanout: Fanout;
let driver: Driver;
let report: Report;
let revisions: Revisions;
let content: Content;
let render: Render;
let bulk: BulkEmail;
let deliveries: Deliveries;
let inbox: Inbox;
let appDb: AppDb;

const BASE_URL = "https://glitter.test";
const COMUNICADO_LOCK_NS = 8155;
const MISSING_ID = 2_147_483_000;
const LATER = () => Date.now() + 60_000;

const TITLE = "Cambio de horario de armado";
const TEXT = "El armado empieza a las 8:00.";
const NEW_TITLE = "Nuevo horario de armado";
const NEW_TEXT = "El armado empieza a las 9:00, por la puerta de atrás.";
const NEW_LABEL = "Ver mis participaciones";
const NEW_PATH = "/my_participations";
const NOTE = "Cambió el horario de armado";
const ESSENTIAL_REASON = "Cambia el horario de armado";

const STALE =
  "Alguien más lo editó recién. Recargá para ver la última versión.";
const LOCKED =
  "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.";

/** No test waits on the production waits. */
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

function vapidKeys(): Vapid {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    // Node drops a private key's leading zero bytes; VAPID wants all 32.
    privateKey: Buffer.from(
      ecdh.getPrivateKey("hex").padStart(64, "0"),
      "hex",
    ).toString("base64url"),
    subject: "mailto:soporte@productoraglitter.com",
  };
}

const VAPID = vapidKeys();

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
};

async function createUser(role: Role = "user") {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `edit-it-${suffix}`,
      email: `edit-it-${suffix}@example.test`,
      firstName: "Ana",
      lastName: "Edita",
      role,
      status: "verified",
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

/** Verified participants, in one statement. */
async function createPeople(count: number) {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO users (clerk_id, email, display_name, role, status)
     SELECT 'edit-it-' || $1 || '-' || g,
            'edit-it-' || $1 || '-' || g || '@example.test',
            'Edición ' || g, 'user', 'verified'
     FROM generate_series(1, $2::int) AS g
     RETURNING id`,
    [randomUUID(), count],
  );
  const ids = rows.map((row) => row.id);
  created.users.push(...ids);
  return ids;
}

async function addDevice(userId: number) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  await integrationDb!.insert(pushSubscriptions).values({
    userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/edit-it-${randomUUID()}`,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    applicationServerKey: VAPID.publicKey,
  });
}

function summaryFor({
  sendEmail,
  sendPush,
}: {
  sendEmail: boolean;
  sendPush: boolean;
}): ComunicadoAudienceSummary {
  return {
    v: 1,
    env: "production",
    narrowed: false,
    sources: [],
    matched: 0,
    eligible: 0,
    willReceive: 0,
    stagingAdmins: 0,
    pickedByName: 0,
    skipped: [],
    channels: { email: sendEmail, push: sendPush },
    email: {
      sendTo: 0,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
    },
    essentialFestival: null,
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

/** An image uploaded through the editor's `comunicadoImage` route. */
const IMAGE_URL = "https://edit1t.ufs.sh/f/edit-it-plano-de-armado";
const IMAGE_CAPTION = "Plano del armado";

/**
 * The text and an uploaded image after it, as BlockNote hands the document
 * over: with the props the server drops (`showPreview`, `previewWidth`, the
 * file's `name`).
 */
function docWithImage(text: string, url = IMAGE_URL) {
  return [
    ...doc(text),
    {
      type: "image",
      props: {
        url,
        caption: IMAGE_CAPTION,
        name: "plano.png",
        showPreview: true,
        previewWidth: 512,
        textAlignment: "center",
        backgroundColor: "default",
      },
      children: [],
    },
  ];
}

/** Revision 1 exactly as the send writes it: normalized and rendered. */
async function sentContent(text: string, raw: unknown[] = doc(text)) {
  const normalized = content.normalizeAnnouncementDoc(raw, {
    stage: "send",
  });
  if (!normalized.ok) throw new Error(normalized.message);
  return {
    blocks: normalized.blocks,
    text: normalized.text,
    html: await render.blocksToSanitizedHtml(normalized.blocks, "announcement"),
  };
}

type Sent = {
  campaignId: number;
  comunicadoId: number;
  authorId: number;
  /** Recipient row id by user id. */
  recipients: Map<number, number>;
};

/**
 * A comunicado as the send leaves it: a processing campaign, the sent row
 * with its frozen summary and its working copy, revision 1, and one pending
 * recipient per person, entered from a list.
 */
async function insertSent({
  people,
  sendEmail = true,
  sendPush = false,
  essential = false,
  firstDoc = doc(TEXT),
}: {
  people: number[];
  sendEmail?: boolean;
  sendPush?: boolean;
  essential?: boolean;
  /** Revision 1's document, as the editor handed it to the send. */
  firstDoc?: unknown[];
}): Promise<Sent> {
  const authorId = await createUser("admin");
  const first = await sentContent(TEXT, firstDoc);
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key)
     VALUES ('comunicado', 'processing', $1, $2, $3, $4)
     RETURNING id`,
    [TITLE, first.text, authorId, `comunicado:test-${randomUUID()}`],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, doc, campaign_id, current_revision, sent_at,
        sent_by_user_id, audience_summary, send_email, send_push, essential,
        essential_reason, essential_confirmed_by_user_id,
        essential_confirmed_at, created_by_user_id, updated_by_user_id)
     VALUES ('sent', $1, $2::jsonb, $3, 1, now(), $4, $5::jsonb, $6, $7, $8,
             CASE WHEN $8 THEN $9 END, CASE WHEN $8 THEN $4::int END,
             CASE WHEN $8 THEN now() END, $4, $4)
     RETURNING id`,
    [
      TITLE,
      JSON.stringify(first.blocks),
      campaignId,
      authorId,
      JSON.stringify(summaryFor({ sendEmail, sendPush })),
      sendEmail,
      sendPush,
      essential,
      ESSENTIAL_REASON,
    ],
  );
  const comunicadoId = comunicado.rows[0]!.id;
  created.comunicados.push(comunicadoId);
  await pool!.query(
    `INSERT INTO comunicado_revisions
       (comunicado_id, revision, title, doc, html, text, created_by_user_id)
     VALUES ($1, 1, $2, $3::jsonb, $4, $5, $6)`,
    [
      comunicadoId,
      TITLE,
      JSON.stringify(first.blocks),
      first.html,
      first.text,
      authorId,
    ],
  );
  const { rows } = await pool!.query<{ id: number; user_id: number }>(
    `INSERT INTO notification_campaign_recipients
       (campaign_id, user_id, status, source)
     SELECT $1, t.user_id, 'pending', 'list'
     FROM unnest($2::int[]) AS t(user_id)
     RETURNING id, user_id`,
    [campaignId, people],
  );
  const recipients = new Map(rows.map((row) => [row.user_id, row.id]));
  return { campaignId, comunicadoId, authorId, recipients };
}

/** Everyone pending becomes an inbox item, with its email and push rows. */
async function fanOut(sent: Sent) {
  const run = await fanout.fanOutComunicado({
    campaignId: sent.campaignId,
    comunicadoId: sent.comunicadoId,
    deadline: LATER(),
  });
  expect(run.stopped).toBe("done");
  return run;
}

/** Exactly these people's chunk, as a chunk that read them earlier would. */
async function fanOutOnly(sent: Sent, people: number[]) {
  const outcome = await fanout.processComunicadoChunk(
    sent.campaignId,
    sent.comunicadoId,
    new Set(),
    { candidateIds: people.map((person) => sent.recipients.get(person)!) },
  );
  expect(outcome).toMatchObject({
    kind: "processed",
    notified: people.length,
  });
}

type EditInput = Parameters<Edit["editSentComunicado"]>[1];

const NEW_CONTENT: Omit<EditInput, "expectedRevision"> = {
  title: NEW_TITLE,
  doc: doc(NEW_TEXT),
  actionLabel: NEW_LABEL,
  actionPath: NEW_PATH,
};

function edit(
  sent: Sent,
  changes: Partial<EditInput> = {},
  by = sent.authorId,
) {
  return editMod.editSentComunicado(
    sent.comunicadoId,
    { expectedRevision: 1, ...NEW_CONTENT, ...changes },
    by,
  );
}

type ItemRow = {
  id: number;
  user_id: number;
  title: string;
  body: string;
  action_path: string | null;
  action_label: string | null;
  data: Record<string, unknown>;
  read_at: Date | null;
  edited_at: string | null;
  retracted: boolean;
};

async function itemsOf(campaignId: number) {
  const { rows } = await pool!.query<ItemRow>(
    `SELECT id, user_id, title, body, action_path, action_label, data,
            read_at, edited_at::text AS edited_at,
            retracted_at IS NOT NULL AS retracted
     FROM notifications WHERE campaign_id = $1 ORDER BY id`,
    [campaignId],
  );
  return rows;
}

async function itemOf(campaignId: number, userId: number) {
  const item = (await itemsOf(campaignId)).find(
    (row) => row.user_id === userId,
  );
  if (!item) throw new Error("no item for that person");
  return item;
}

/** A revision's `created_at`, to the microsecond. */
async function revisionCreatedAt(comunicadoId: number, revision: number) {
  const { rows } = await pool!.query<{ created_at: string }>(
    `SELECT created_at::text AS created_at FROM comunicado_revisions
     WHERE comunicado_id = $1 AND revision = $2`,
    [comunicadoId, revision],
  );
  return rows[0]!.created_at;
}

async function revisionsOf(comunicadoId: number) {
  const { rows } = await pool!.query<{
    revision: number;
    title: string;
    doc: unknown[];
    html: string;
    text: string;
    action_label: string | null;
    action_path: string | null;
    edit_note: string | null;
    created_by_user_id: number | null;
  }>(
    `SELECT revision, title, doc, html, text, action_label, action_path,
            edit_note, created_by_user_id
     FROM comunicado_revisions WHERE comunicado_id = $1 ORDER BY revision`,
    [comunicadoId],
  );
  return rows;
}

async function comunicadoOf(id: number) {
  const { rows } = await pool!.query<{
    status: string;
    title: string;
    doc: unknown[];
    action_label: string | null;
    action_path: string | null;
    version: number;
    current_revision: number | null;
    updated_by_user_id: number | null;
    retracted: boolean;
  }>(
    `SELECT status, title, doc, action_label, action_path, version,
            current_revision, updated_by_user_id,
            retracted_at IS NOT NULL AS retracted
     FROM comunicados WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

async function campaignOf(campaignId: number) {
  const { rows } = await pool!.query<{ title: string; message: string }>(
    "SELECT title, message FROM notification_campaigns WHERE id = $1",
    [campaignId],
  );
  return rows[0]!;
}

type DeliveryRow = {
  id: number;
  user_id: number;
  channel: "email" | "push";
  status: string;
  last_error: string | null;
  batch_key: string | null;
  content_revision: number | null;
};

async function deliveriesOf(campaignId: number, channel = "email") {
  const { rows } = await pool!.query<DeliveryRow>(
    `SELECT d.id, d.user_id, d.channel, d.status, d.last_error, d.batch_key,
            d.content_revision
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     WHERE n.campaign_id = $1 AND d.channel = $2
     ORDER BY d.id`,
    [campaignId, channel],
  );
  return rows;
}

/**
 * What V1 asks of every item still in someone's inbox: the current
 * revision, its title, excerpt and button, in a shape the kind accepts.
 */
async function expectInboxAtRevision(
  campaignId: number,
  revision: number,
  copy: {
    title: string;
    body: string;
    label: string | null;
    path: string | null;
  },
) {
  const items = (await itemsOf(campaignId)).filter((item) => !item.retracted);
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) {
    expect(comunicadoKinds.comunicado.schema.safeParse(item.data).success).toBe(
      true,
    );
    expect(item).toMatchObject({
      title: copy.title,
      body: copy.body,
      action_path: copy.path,
      action_label: copy.label,
      data: {
        revision,
        title: copy.title,
        excerpt: copy.body,
        actionPath: copy.path,
        actionLabel: copy.label,
      },
    });
  }
}

const EDITED_COPY = {
  title: NEW_TITLE,
  body: NEW_TEXT,
  label: NEW_LABEL,
  path: NEW_PATH,
};

/**
 * A second connection holding a transaction open, for lock tests. Let go by
 * the returned function, or after `maxMs` so a failing test cannot hang.
 */
async function holdTransaction(
  statement: string,
  params: unknown[] = [],
  maxMs = 10_000,
) {
  const client: PoolClient = await pool!.connect();
  await client.query("BEGIN");
  await client.query(statement, params);
  let released: Promise<void> | null = null;
  const release = () =>
    (released ??= client
      .query("ROLLBACK")
      .then(() => undefined)
      .finally(() => client.release()));
  const timer = setTimeout(() => void release(), maxMs);
  return () => {
    clearTimeout(timer);
    return release();
  };
}

/** Waits until an edit is queued for this comunicado's content lock. */
async function waitForEditToWait(comunicadoId: number) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_locks
       WHERE locktype = 'advisory' AND classid = $1 AND objid = $2
         AND objsubid = 2 AND mode = 'ExclusiveLock' AND NOT granted`,
      [COMUNICADO_LOCK_NS, comunicadoId],
    );
    if (rows[0]!.waiting > 0) return;
    if (attempt > 250) throw new Error("The edit never waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

type BatchEmail = {
  to: string[];
  subject: string;
  html: string;
  text: string;
};
type BatchCall = {
  emails: BatchEmail[];
  options: { idempotencyKey: string };
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

/** An earlier request under this key landed (`resend-result.ts`). */
function replayed() {
  return {
    data: null,
    error: {
      name: "invalid_idempotent_request",
      message: "Same idempotency key used with a different payload.",
      statusCode: 409,
    },
    headers: {},
  };
}

function runLane(campaignId: number) {
  return bulk.sendBulkEmails({ campaignId, deadline: LATER(), timing: FAST });
}

function deadlock() {
  return Object.assign(new Error("deadlock detected"), { code: "40P01" });
}

describeDatabase("editing a sent comunicado", () => {
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

  function editLogs() {
    return consoleLog.mock.calls.filter(
      ([first]) => first === "[comunicados] edit",
    );
  }

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    editMod = await import("@/app/lib/comunicados/edit");
    editActions = await import("@/app/lib/comunicados/edit-actions");
    retractMod = await import("@/app/lib/comunicados/retract");
    fanout = await import("@/app/lib/comunicados/fanout");
    driver = await import("@/app/lib/comunicados/driver");
    report = await import("@/app/lib/comunicados/report");
    revisions = await import("@/app/lib/comunicados/revisions");
    content = await import("@/app/lib/comunicados/content");
    render = await import("@/app/lib/rich-text/render");
    bulk = await import("@/app/lib/notifications/bulk-email");
    deliveries = await import("@/app/lib/notifications/deliveries");
    inbox = await import("@/app/lib/notifications/queries");
    appDb = (await import("@/db")).db;

    // Everything under test writes through the app's pool: it must be this
    // database.
    const { rows } = await pool!.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    const appName = await appDb.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(appName.rows[0]?.name).toBe(rows[0]?.name);
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
    sendPushMock.mockReset();
    sendPushMock.mockResolvedValue({
      statusCode: 201,
      headers: { location: "https://fcm.googleapis.com/fcm/send/msg-0:abc" },
    });
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The app's `db` logs every statement; everything here goes through it.
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
    if (created.users.length > 0) {
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, created.users));
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
    if (created.users.length > 0) {
      // Devices cascade.
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
    vi.restoreAllMocks();
    state.viewer = null;
    state.flagOn = true;
    state.vercelEnv = "production";
    state.afterNotifyMany = null;
    vapid.current = null;
    revalidatePath.mockClear();
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

  describe("the inbox (V1, K7, H2)", () => {
    it("rewrites every item already written, keeps read state, and marks it Editado at the revision's own time", async () => {
      const [reader, other] = await createPeople(2);
      const sent = await insertSent({ people: [reader!, other!] });
      await fanOut(sent);
      await pool!.query(
        "UPDATE notifications SET read_at = now() - interval '1 hour' WHERE campaign_id = $1 AND user_id = $2",
        [sent.campaignId, reader],
      );
      const readBefore = (await itemOf(sent.campaignId, reader!)).read_at;
      const before = await comunicadoOf(sent.comunicadoId);
      const editor = await createUser("admin");

      const outcome = await edit(sent, {}, editor);

      expect(outcome).toEqual({
        ok: true,
        revision: 2,
        campaignId: sent.campaignId,
        updatedItems: 2,
      });
      await expectInboxAtRevision(sent.campaignId, 2, EDITED_COPY);
      const editedAt = await revisionCreatedAt(sent.comunicadoId, 2);
      for (const item of await itemsOf(sent.campaignId)) {
        expect(item.edited_at).toBe(editedAt);
      }
      expect((await itemOf(sent.campaignId, reader!)).read_at).toEqual(
        readBefore,
      );
      expect((await itemOf(sent.campaignId, other!)).read_at).toBeNull();

      // Revision 2 as the send would have written it, with who wrote it.
      const expected = await sentContent(NEW_TEXT);
      const [first, second] = await revisionsOf(sent.comunicadoId);
      expect(first).toMatchObject({ revision: 1, title: TITLE });
      expect(second).toEqual({
        revision: 2,
        title: NEW_TITLE,
        doc: expected.blocks,
        html: expected.html,
        text: NEW_TEXT,
        action_label: NEW_LABEL,
        action_path: NEW_PATH,
        edit_note: null,
        created_by_user_id: editor,
      });
      // Only the title of the working copy moves (F1 step 4).
      expect(await comunicadoOf(sent.comunicadoId)).toEqual({
        ...before,
        title: NEW_TITLE,
        current_revision: 2,
        version: before.version + 1,
        updated_by_user_id: editor,
      });
      expect(await campaignOf(sent.campaignId)).toEqual({
        title: NEW_TITLE,
        message: NEW_TEXT,
      });
      expect(editLogs()).toEqual([
        [
          "[comunicados] edit",
          { comunicadoId: sent.comunicadoId, revision: 2, items: 2 },
        ],
      ]);
    });

    it("shows the new text on the detail page at once, marked Editado, and Editado in the list (H2, F2)", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const { id } = await itemOf(sent.campaignId, person!);
      const viewer = { id: person!, role: "user" as const };
      const first = await sentContent(TEXT);
      expect(await inbox.fetchNotificationForViewer(viewer, id)).toMatchObject({
        title: TITLE,
        bodyHtml: first.html,
        editedAt: null,
      });

      expect(await edit(sent)).toMatchObject({ ok: true, revision: 2 });

      const detail = await inbox.fetchNotificationForViewer(viewer, id);
      expect(detail).toMatchObject({
        title: NEW_TITLE,
        body: NEW_TEXT,
        bodyHtml: (await sentContent(NEW_TEXT)).html,
        editedAt: expect.any(String),
      });
      expect(detail!.bodyHtml).toContain("por la puerta de atrás");
      const page = await inbox.fetchInboxPage(viewer);
      expect(page.items.find((item) => item.id === id)).toMatchObject({
        title: NEW_TITLE,
        editedAt: detail!.editedAt,
      });
      // Read state is the person's: an edit does not re-alert (K7).
      expect(page.unreadCount).toBe(1);
    });

    it("a chunk after the edit writes the new revision with no Editado; one before it is rewritten", async () => {
      const [early, late] = await createPeople(2);
      const sent = await insertSent({ people: [early!, late!] });
      await fanOutOnly(sent, [early!]);

      expect(await edit(sent)).toMatchObject({
        ok: true,
        revision: 2,
        updatedItems: 1,
      });
      await fanOutOnly(sent, [late!]);

      await expectInboxAtRevision(sent.campaignId, 2, EDITED_COPY);
      expect((await itemOf(sent.campaignId, early!)).edited_at).toBe(
        await revisionCreatedAt(sent.comunicadoId, 2),
      );
      expect((await itemOf(sent.campaignId, late!)).edited_at).toBeNull();
    });

    it("waits for a fan-out chunk to commit, then rewrites what it wrote", async () => {
      const people = await createPeople(3);
      const sent = await insertSent({ people });
      const written = gate();
      const commit = gate();
      state.afterNotifyMany = async () => {
        written.open();
        await commit.opened;
      };

      const fanning = fanout.fanOutComunicado({
        campaignId: sent.campaignId,
        comunicadoId: sent.comunicadoId,
        deadline: LATER(),
      });
      await written.opened;
      const editing = edit(sent);
      await waitForEditToWait(sent.comunicadoId);
      expect((await comunicadoOf(sent.comunicadoId)).current_revision).toBe(1);

      commit.open();
      expect(await fanning).toMatchObject({ notified: 3, stopped: "done" });
      expect(await editing).toEqual({
        ok: true,
        revision: 2,
        campaignId: sent.campaignId,
        updatedItems: 3,
      });
      await expectInboxAtRevision(sent.campaignId, 2, EDITED_COPY);
      const editedAt = await revisionCreatedAt(sent.comunicadoId, 2);
      for (const item of await itemsOf(sent.campaignId)) {
        expect(item.edited_at).toBe(editedAt);
      }
    });

    it("takes a button off everywhere when the edit removes it", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      expect(await edit(sent)).toMatchObject({ ok: true, revision: 2 });

      expect(
        await edit(sent, {
          expectedRevision: 2,
          actionLabel: "",
          actionPath: "",
        }),
      ).toMatchObject({ ok: true, revision: 3, updatedItems: 1 });

      await expectInboxAtRevision(sent.campaignId, 3, {
        ...EDITED_COPY,
        label: null,
        path: null,
      });
      expect((await revisionsOf(sent.comunicadoId))[2]).toMatchObject({
        action_label: null,
        action_path: null,
      });
    });
  });

  describe("emails (V2, F1 step 6)", () => {
    it("waits for a batch holding the comunicado's shared lock; a later batch renders the new revision", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const release = await holdTransaction(
        "SELECT pg_advisory_xact_lock_shared(8155, $1)",
        [sent.comunicadoId],
      );

      const editing = edit(sent);
      await waitForEditToWait(sent.comunicadoId);
      expect((await comunicadoOf(sent.comunicadoId)).current_revision).toBe(1);
      expect((await itemOf(sent.campaignId, person!)).title).toBe(TITLE);

      await release();
      expect(await editing).toMatchObject({ ok: true, revision: 2 });

      const tick = await driver.runComunicadoWork({
        scope: { campaignId: sent.campaignId },
        deadline: LATER(),
        trigger: "send",
        emailTiming: FAST,
      });
      expect(tick.failedSteps).toEqual([]);
      expect(batchCalls).toHaveLength(1);
      const [email] = batchCalls[0]!.emails;
      expect(email!.subject).toBe(NEW_TITLE);
      expect(email!.text).toContain(NEW_TEXT);
      expect(email!.text).not.toContain(TEXT);
      expect(email!.html).toContain("por la puerta de atrás");
      expect(await deliveriesOf(sent.campaignId)).toEqual([
        expect.objectContaining({ status: "sent", content_revision: 2 }),
      ]);
    });

    it("waits for the lane's batch while Resend has it; the batch after it carries the new revision", async () => {
      // One batch holds 100: the 101st is the next batch's.
      const people = await createPeople(101);
      const sent = await insertSent({ people });
      await fanOut(sent);
      const inFlight = gate();
      const answer = gate();
      sendBatchMock.mockImplementationOnce(
        async (emails: BatchEmail[], options: BatchCall["options"]) => {
          batchCalls.push({ emails, options });
          inFlight.open();
          await answer.opened;
          return accepted(emails);
        },
      );

      const lane = runLane(sent.campaignId);
      await inFlight.opened;
      const editing = edit(sent);
      await waitForEditToWait(sent.comunicadoId);
      expect((await comunicadoOf(sent.comunicadoId)).current_revision).toBe(1);

      answer.open();
      expect(await editing).toMatchObject({
        ok: true,
        revision: 2,
        updatedItems: 101,
      });
      expect(await lane).toMatchObject({ requests: 2, sent: 101 });

      expect(batchCalls.map((call) => call.emails.length)).toEqual([100, 1]);
      for (const email of batchCalls[0]!.emails) {
        expect(email.subject).toBe(TITLE);
      }
      expect(batchCalls[1]!.emails[0]!.subject).toBe(NEW_TITLE);
      expect(batchCalls[1]!.emails[0]!.text).toContain(NEW_TEXT);
      const revisions = (await deliveriesOf(sent.campaignId)).map(
        (row) => row.content_revision,
      );
      expect(revisions.filter((revision) => revision === 1)).toHaveLength(100);
      expect(revisions.filter((revision) => revision === 2)).toHaveLength(1);
    }, 60_000);

    it.each([
      [
        "a 409 records it sent, not confirmed per person",
        replayed,
        {
          status: "sent",
          last_error: "idempotent_replay",
          content_revision: null,
        },
      ],
      [
        "a 200 records the new revision",
        accepted,
        { status: "sent", last_error: null, content_revision: 2 },
      ],
    ] as const)(
      "re-sends a held batch with the new revision under its old key: %s",
      async (_label, answerWith, expected) => {
        const [person] = await createPeople(1);
        const sent = await insertSent({ people: [person!] });
        await fanOut(sent);
        // An earlier attempt under this key may have reached Resend.
        const heldKey = `comunicado-batch:${sent.campaignId}:${randomUUID()}`;
        const [held] = await deliveriesOf(sent.campaignId);
        await pool!.query(
          `UPDATE notification_deliveries
           SET batch_key = $2, maybe_sent_at = now(), attempts = 1,
             last_error = 'resend:application_error'
           WHERE id = $1`,
          [held!.id, heldKey],
        );

        expect(await edit(sent)).toMatchObject({ ok: true, revision: 2 });
        sendBatchMock.mockImplementationOnce(
          async (emails: BatchEmail[], options: BatchCall["options"]) => {
            batchCalls.push({ emails, options });
            return answerWith(emails);
          },
        );
        expect(await runLane(sent.campaignId)).toMatchObject({ requests: 1 });

        expect(batchCalls).toHaveLength(1);
        expect(batchCalls[0]!.options.idempotencyKey).toBe(heldKey);
        expect(batchCalls[0]!.emails[0]).toMatchObject({ subject: NEW_TITLE });
        expect(batchCalls[0]!.emails[0]!.text).toContain(NEW_TEXT);
        expect(await deliveriesOf(sent.campaignId)).toEqual([
          expect.objectContaining({ ...expected, batch_key: heldKey }),
        ]);
      },
    );

    it("leaves an email sent before the edit as it went; the report reads it as version 1", async () => {
      const [early, late] = await createPeople(2);
      const sent = await insertSent({ people: [early!, late!] });
      await fanOutOnly(sent, [early!]);
      expect(await runLane(sent.campaignId)).toMatchObject({ sent: 1 });

      expect(await edit(sent)).toMatchObject({ ok: true, revision: 2 });
      await fanOutOnly(sent, [late!]);
      expect(await runLane(sent.campaignId)).toMatchObject({ sent: 1 });

      expect(batchCalls.map((call) => call.emails[0]!.subject)).toEqual([
        TITLE,
        NEW_TITLE,
      ]);
      const emails = await deliveriesOf(sent.campaignId);
      expect(
        emails.map((row) => [row.user_id, row.status, row.content_revision]),
      ).toEqual([
        [early, "sent", 1],
        [late, "sent", 2],
      ]);

      state.viewer = { id: await createUser("admin"), role: "admin" };
      const page = await report.fetchComunicadoRecipients(sent.comunicadoId, {
        filter: "all",
        query: "",
        page: 1,
      });
      const labelOf = (userId: number) =>
        page!.rows.find((row) => row.userId === userId)!.emailLabel;
      expect(labelOf(early!)).toMatch(/^Enviado .+ · versión 1$/);
      expect(labelOf(late!)).toMatch(/^Enviado [^·]+$/);
    });
  });

  describe("images (PR 8: C1–C4 through an edit)", () => {
    it("edits a comunicado with an uploaded image: the image reaches the revision, the detail page and the email", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({
        people: [person!],
        firstDoc: docWithImage(TEXT),
      });
      await fanOut(sent);
      const { id } = await itemOf(sent.campaignId, person!);

      // The edit page sends BlockNote's document back as it holds it.
      expect(await edit(sent, { doc: docWithImage(NEW_TEXT) })).toMatchObject({
        ok: true,
        revision: 2,
      });

      const expected = await sentContent(NEW_TEXT, docWithImage(NEW_TEXT));
      const second = (await revisionsOf(sent.comunicadoId))[1]!;
      expect(second.doc).toEqual(expected.blocks);
      expect(second.doc[1]).toEqual({
        type: "image",
        props: {
          url: IMAGE_URL,
          caption: IMAGE_CAPTION,
          name: IMAGE_CAPTION,
          textAlignment: "left",
          backgroundColor: "default",
        },
        children: [],
      });
      expect(second.html).toBe(expected.html);
      expect(second.html).toContain(`src="${IMAGE_URL}"`);
      expect(second.html).toContain(`alt="${IMAGE_CAPTION}"`);

      const detail = await inbox.fetchNotificationForViewer(
        { id: person!, role: "user" },
        id,
      );
      expect(detail!.bodyHtml).toBe(expected.html);

      const tick = await driver.runComunicadoWork({
        scope: { campaignId: sent.campaignId },
        deadline: LATER(),
        trigger: "send",
        emailTiming: FAST,
      });
      expect(tick.failedSteps).toEqual([]);
      const [email] = batchCalls[0]!.emails;
      expect(email!.subject).toBe(NEW_TITLE);
      expect(email!.html).toMatch(
        new RegExp(`<img[^>]*src="${IMAGE_URL}"[^>]*>`),
      );
      expect(email!.html).toContain('width="430"');
      expect(email!.html).not.toContain("<figure");
      expect(email!.text).toContain(IMAGE_CAPTION);
      expect(await deliveriesOf(sent.campaignId)).toEqual([
        expect.objectContaining({ status: "sent", content_revision: 2 }),
      ]);
    });

    it("refuses an untouched document with an image as no change, and counts removing the image as one", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({
        people: [person!],
        firstDoc: docWithImage(TEXT),
      });
      await fanOut(sent);

      expect(
        await edit(sent, {
          title: TITLE,
          doc: docWithImage(TEXT),
          actionLabel: null,
          actionPath: null,
        }),
      ).toMatchObject({ ok: false, code: "NO_CHANGES" });

      expect(
        await edit(sent, {
          title: TITLE,
          doc: doc(TEXT),
          actionLabel: null,
          actionPath: null,
        }),
      ).toMatchObject({ ok: true, revision: 2 });
      expect((await revisionsOf(sent.comunicadoId))[1]!.html).not.toContain(
        "<img",
      );
    });

    it("refuses an image from another site and a seventh image, as a send would, writing nothing", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);

      expect(
        await edit(sent, {
          doc: docWithImage(NEW_TEXT, "https://example.com/plano.png"),
        }),
      ).toEqual({
        ok: false,
        code: "INVALID_CONTENT",
        message: "Esta imagen no está subida a Glitter: subila de nuevo.",
      });
      const sevenImages = [
        ...doc(NEW_TEXT),
        ...Array.from({ length: 7 }, (_, n) => ({
          type: "image",
          props: { url: `${IMAGE_URL}-${n}`, caption: "" },
          children: [],
        })),
      ];
      expect(await edit(sent, { doc: sevenImages })).toEqual({
        ok: false,
        code: "INVALID_CONTENT",
        message: "Un comunicado puede tener hasta 6 imágenes.",
      });
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(1);
      expect((await itemOf(sent.campaignId, person!)).title).toBe(TITLE);
    });
  });

  describe("push (F1 step 7)", () => {
    it("a pending push carries the new title; one delivered before the edit went with the old one", async () => {
      vapid.current = VAPID;
      const [early, late] = await createPeople(2);
      for (const person of [early!, late!]) await addDevice(person);
      const sent = await insertSent({
        people: [early!, late!],
        sendEmail: false,
        sendPush: true,
      });
      await fanOutOnly(sent, [early!]);
      expect(
        await deliveries.sendBulkPushes({
          campaignId: sent.campaignId,
          budgetMs: 20_000,
        }),
      ).toMatchObject({ sent: 1 });

      await fanOutOnly(sent, [late!]);
      expect(await edit(sent)).toMatchObject({
        ok: true,
        revision: 2,
        updatedItems: 2,
      });
      expect(
        await deliveries.sendBulkPushes({
          campaignId: sent.campaignId,
          budgetMs: 20_000,
        }),
      ).toMatchObject({ sent: 1 });

      const titles = sendPushMock.mock.calls.map(
        ([, payload]) =>
          (JSON.parse(payload as string) as { title: string }).title,
      );
      expect(titles).toEqual([TITLE, NEW_TITLE]);
      expect(
        (await deliveriesOf(sent.campaignId, "push")).map((row) => row.status),
      ).toEqual(["sent", "sent"]);
    });
  });

  describe("refusals", () => {
    it("refuses an edit made on an older revision, and a second edit racing the first (F4)", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);

      const outcomes = await Promise.all([
        edit(sent),
        edit(sent, { title: "Otro horario de armado" }),
      ]);
      expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
      expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([
        { ok: false, code: "STALE", message: STALE },
      ]);
      const after = await comunicadoOf(sent.comunicadoId);
      expect(after.current_revision).toBe(2);
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(2);

      expect(await edit(sent, { title: "Tercer horario" })).toEqual({
        ok: false,
        code: "STALE",
        message: STALE,
      });
      expect(await comunicadoOf(sent.comunicadoId)).toEqual(after);
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(2);
      expect((await itemOf(sent.campaignId, person!)).data.revision).toBe(2);
    });

    it("refuses an edit once it was retracted, writing nothing", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      expect(
        await retractMod.retractComunicado(
          sent.comunicadoId,
          { reason: "Salió con el horario equivocado" },
          sent.authorId,
        ),
      ).toMatchObject({ ok: true });
      const before = await comunicadoOf(sent.comunicadoId);
      const itemsBefore = await itemsOf(sent.campaignId);

      expect(await edit(sent)).toEqual({
        ok: false,
        code: "RETRACTED",
        message: "Este comunicado fue retirado.",
      });
      expect(await comunicadoOf(sent.comunicadoId)).toEqual(before);
      expect(await itemsOf(sent.campaignId)).toEqual(itemsBefore);
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(1);
      expect(editLogs()).toEqual([]);
    });

    it("says an essential one was retracted rather than asking for a note", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!], essential: true });
      await fanOut(sent);
      expect(
        await retractMod.retractComunicado(
          sent.comunicadoId,
          { reason: "Salió con el horario equivocado" },
          sent.authorId,
        ),
      ).toMatchObject({ ok: true });

      expect(await edit(sent, { editNote: null })).toMatchObject({
        ok: false,
        code: "RETRACTED",
      });
    });

    it("refuses an edit retracted after it was checked, under the lock (F4)", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      // The retraction commits after the edit's first read, before its
      // transaction: only the check under the lock can see it.
      const real = appDb.transaction.bind(appDb);
      vi.spyOn(appDb, "transaction").mockImplementationOnce(async (...args) => {
        expect(
          await retractMod.retractComunicado(
            sent.comunicadoId,
            { reason: "Salió con el horario equivocado" },
            sent.authorId,
          ),
        ).toMatchObject({ ok: true });
        return real(...args);
      });

      expect(await edit(sent)).toEqual({
        ok: false,
        code: "RETRACTED",
        message: "Este comunicado fue retirado.",
      });
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(1);
      expect(editLogs()).toEqual([]);
    });

    it("refuses an essential edit without a note, and keeps the note, trimmed, on the revision", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!], essential: true });
      await fanOut(sent);

      for (const editNote of [undefined, null, "", "   "]) {
        expect(await edit(sent, { editNote })).toEqual({
          ok: false,
          code: "NOTE_REQUIRED",
          message:
            "Contá por qué cambia un correo esencial (lo ve solo el equipo).",
        });
      }
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(1);
      expect((await itemOf(sent.campaignId, person!)).title).toBe(TITLE);

      expect(await edit(sent, { editNote: `  ${NOTE}  ` })).toMatchObject({
        ok: true,
        revision: 2,
      });
      expect((await revisionsOf(sent.comunicadoId))[1]).toMatchObject({
        edit_note: NOTE,
      });
    });

    it("keeps a note on an edit that is not essential", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);

      expect(await edit(sent, { editNote: NOTE })).toMatchObject({ ok: true });
      expect((await revisionsOf(sent.comunicadoId))[1]).toMatchObject({
        edit_note: NOTE,
      });
    });

    it("refuses an edit that changes nothing anyone sees, however it was typed", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const before = await comunicadoOf(sent.comunicadoId);
      const itemsBefore = await itemsOf(sent.campaignId);

      expect(
        await edit(sent, {
          title: `  ${TITLE} `,
          doc: doc(TEXT),
          actionLabel: "",
          actionPath: "  ",
          editNote: NOTE,
        }),
      ).toEqual({
        ok: false,
        code: "NO_CHANGES",
        message: "No cambiaste nada: el comunicado sigue igual.",
      });
      expect(await comunicadoOf(sent.comunicadoId)).toEqual(before);
      expect(await itemsOf(sent.campaignId)).toEqual(itemsBefore);
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(1);

      // The button alone is a change.
      expect(
        await edit(sent, {
          title: TITLE,
          doc: doc(TEXT),
        }),
      ).toMatchObject({ ok: true, revision: 2 });
    });

    it("refuses content a send would refuse, writing nothing", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);

      expect(await edit(sent, { title: "   " })).toEqual({
        ok: false,
        code: "INVALID_CONTENT",
        message: "Escribí un título.",
      });
      expect(await edit(sent, { actionPath: "//evil.example/phish" })).toEqual({
        ok: false,
        code: "INVALID_CONTENT",
        message:
          "Pegá un enlace de Glitter que empiece con /, por ejemplo /my_participations.",
      });
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(1);
      expect((await itemOf(sent.campaignId, person!)).title).toBe(TITLE);
    });

    it("refuses a draft, a scheduled comunicado and one that does not exist", async () => {
      const authorId = await createUser("admin");
      const [draft] = await integrationDb!
        .insert(comunicados)
        .values({ createdByUserId: authorId, updatedByUserId: authorId })
        .returning({ id: comunicados.id });
      const [scheduled] = await integrationDb!
        .insert(comunicados)
        .values({
          status: "scheduled",
          scheduledAt: new Date(Date.now() + 86_400_000),
          scheduledByUserId: authorId,
          createdByUserId: authorId,
          updatedByUserId: authorId,
        })
        .returning({ id: comunicados.id });
      created.comunicados.push(draft!.id, scheduled!.id);

      for (const id of [draft!.id, scheduled!.id]) {
        expect(
          await editMod.editSentComunicado(
            id,
            { expectedRevision: 1, ...NEW_CONTENT },
            authorId,
          ),
        ).toEqual({
          ok: false,
          code: "NOT_SENT",
          message: "Este comunicado no se envió.",
        });
      }
      expect(
        await editMod.editSentComunicado(
          MISSING_ID,
          { expectedRevision: 1, ...NEW_CONTENT },
          authorId,
        ),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "No encontramos este comunicado.",
      });
    });

    it("retries a deadlock once, and answers a second one or a lock timeout without editing", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const transaction = vi.spyOn(appDb, "transaction");

      transaction
        .mockRejectedValueOnce(deadlock())
        .mockRejectedValueOnce(deadlock());
      expect(await edit(sent)).toEqual({
        ok: false,
        code: "BUSY",
        message: "No pudimos guardar los cambios. Probá de nuevo.",
      });
      expect(transaction).toHaveBeenCalledTimes(2);

      transaction.mockClear();
      transaction.mockRejectedValueOnce(
        Object.assign(new Error("canceling statement due to lock timeout"), {
          code: "55P03",
        }),
      );
      expect(await edit(sent)).toEqual({
        ok: false,
        code: "LOCKED",
        message: LOCKED,
      });
      expect(transaction).toHaveBeenCalledTimes(1);

      transaction.mockClear();
      transaction.mockRejectedValueOnce(new Error("connection lost"));
      await expect(edit(sent)).rejects.toThrow("connection lost");
      expect(transaction).toHaveBeenCalledTimes(1);
      expect((await comunicadoOf(sent.comunicadoId)).current_revision).toBe(1);

      transaction.mockClear();
      transaction.mockRejectedValueOnce(deadlock());
      expect(await edit(sent)).toMatchObject({ ok: true, revision: 2 });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(2);
    });

    it("waits at most 20 s, for the exclusive lock in its own statement, before it locks the row (F1, F4)", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      consoleLog.mockClear();

      expect(await edit(sent)).toMatchObject({ ok: true, revision: 2 });

      // The app's logger prints each statement the edit ran, in order.
      const statements = consoleLog.mock.calls
        .map(([entry]) => entry as { query?: unknown; params?: unknown[] })
        .filter((entry) => typeof entry?.query === "string")
        .map((entry) => ({
          query: (entry.query as string).replace(/\s+/g, " ").trim(),
          params: entry.params,
        }));
      const timeout = statements.findIndex(
        (s) => s.query === "SET LOCAL lock_timeout = '20s'",
      );
      expect(timeout).toBeGreaterThanOrEqual(0);
      expect(statements[timeout + 1]).toEqual({
        query: "SELECT pg_advisory_xact_lock($1::int, $2::int)",
        params: [COMUNICADO_LOCK_NS, sent.comunicadoId],
      });
      expect(statements[timeout + 2]!.query).toMatch(
        /^SELECT status, campaign_id, current_revision, .* FROM comunicados WHERE id = \$1::int FOR UPDATE$/,
      );
    });
  });

  describe("history and the action", () => {
    it("lists both versions in the history, with the note", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      expect(await edit(sent, { editNote: NOTE })).toMatchObject({ ok: true });

      state.viewer = { id: await createUser("admin"), role: "admin" };
      const history = await revisions.fetchComunicadoRevisions(
        sent.comunicadoId,
      );
      expect(history).toEqual([
        {
          revision: 1,
          title: TITLE,
          editNote: null,
          createdAt: expect.any(Date),
          createdByName: "Ana Edita",
        },
        {
          revision: 2,
          title: NEW_TITLE,
          editNote: NOTE,
          createdAt: expect.any(Date),
          createdByName: "Ana Edita",
        },
      ]);
    });

    it("edits for a global admin with the flag, and refreshes the list, the page and the edit page", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      state.viewer = { id: await createUser("admin"), role: "admin" };

      expect(
        await editActions.editComunicadoAction({
          comunicadoId: sent.comunicadoId,
          expectedRevision: 1,
          title: NEW_TITLE,
          doc: doc(NEW_TEXT),
          actionLabel: NEW_LABEL,
          actionPath: NEW_PATH,
          editNote: `  ${NOTE}\u0000 `,
        }),
      ).toEqual({
        success: true,
        revision: 2,
        message: "Guardamos los cambios.",
      });
      expect((await revisionsOf(sent.comunicadoId))[1]).toMatchObject({
        edit_note: NOTE,
        created_by_user_id: state.viewer.id,
      });
      expect(await comunicadoOf(sent.comunicadoId)).toMatchObject({
        updated_by_user_id: state.viewer.id,
      });
      expect(revalidatePath.mock.calls).toEqual([
        ["/dashboard/communications"],
        [`/dashboard/communications/${sent.comunicadoId}`],
        [`/dashboard/communications/${sent.comunicadoId}/edit`],
      ]);
    });

    it("refuses a festival admin, and anyone while the flag is off", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const input = {
        comunicadoId: sent.comunicadoId,
        expectedRevision: 1,
        title: NEW_TITLE,
        doc: doc(NEW_TEXT),
        actionLabel: null,
        actionPath: null,
        editNote: null,
      };

      state.viewer = {
        id: await createUser("festival_admin"),
        role: "festival_admin",
      };
      expect(await editActions.editComunicadoAction(input)).toEqual({
        success: false,
        code: "FORBIDDEN",
        message: "No autorizado.",
      });
      state.viewer = { id: await createUser("admin"), role: "admin" };
      state.flagOn = false;
      expect(await editActions.editComunicadoAction(input)).toEqual({
        success: false,
        code: "FORBIDDEN",
        message: "Esta funcionalidad no está disponible",
      });

      expect(await revisionsOf(sent.comunicadoId)).toHaveLength(1);
      expect((await itemOf(sent.campaignId, person!)).title).toBe(TITLE);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
