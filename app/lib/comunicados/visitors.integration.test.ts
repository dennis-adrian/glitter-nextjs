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

import { COMUNICADO_VISITOR_NOTE } from "@/app/emails/comunicado";
import { COMUNICADO_CONTACT_SKIP_REASONS } from "@/app/lib/comunicados/definitions";
import type { BulkTiming } from "@/app/lib/notifications/bulk-email";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  emailSuppressions,
  emailUnsubscribes,
  notificationCampaigns,
  orders,
  users,
  visitors,
} from "@/db/schema";

/**
 * Comunicados to visitors and guest merch buyers
 * (docs/IMPLEMENTATION-comunicados.md §L), end to end on a real database:
 * the audience (dedupe by normalized address, consent, opt-outs), the
 * snapshot of contacts and their bulk email rows with no inbox item, the
 * renderer on the real lane (From, Reply-To, the Novedades one-click
 * unsubscribe), the preview narrowing, the one-click endpoint's resolution,
 * retraction and the report. Resend is mocked. The audience is every visitor
 * and guest buyer in the database, so every assertion is about this file's
 * own addresses.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: sendBatchMock,
}));

const state = vi.hoisted(() => ({
  vercelEnv: "production",
  admin: null as { id: number } | null,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => null,
  requireAdmin: async () => state.admin,
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

type Send = typeof import("@/app/lib/comunicados/send");
type Contacts = typeof import("@/app/lib/comunicados/contacts");
type Bulk = typeof import("@/app/lib/notifications/bulk-email");
type Tokens = typeof import("@/app/lib/emails/unsubscribe-tokens");
type Suppressions = typeof import("@/app/lib/emails/suppressions");
type Retract = typeof import("@/app/lib/comunicados/retract");
type Report = typeof import("@/app/lib/comunicados/report");
type Fanout = typeof import("@/app/lib/comunicados/fanout");
type Retry = typeof import("@/app/lib/comunicados/retry");
let send: Send;
let contacts: Contacts;
let bulk: Bulk;
let tokens: Tokens;
let suppressions: Suppressions;
let retract: Retract;
let report: Report;
let fanout: Fanout;
let retry: Retry;

const BASE_URL = "https://glitter.test";
const FROM = "Productora Glitter <anuncios@productoraglitter.com>";
const FROM_STAGING =
  "Productora Glitter (prueba) <anuncios@productoraglitter.com>";
const REPLY_TO = "glitter@productoraglitter.com";
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

const created = {
  users: [] as number[],
  visitors: [] as number[],
  orders: [] as number[],
  comunicados: [] as number[],
  emailKeys: [] as string[],
};

/** A fresh address of this file, lower-case. */
function address(label: string) {
  const email = `vis-it-${label}-${randomUUID()}@example.test`;
  created.emailKeys.push(email);
  return email;
}

async function createVisitor(
  email: string,
  newsOptIn: boolean | null,
  firstName = "Vale",
) {
  const [row] = await integrationDb!
    .insert(visitors)
    .values({
      email,
      firstName,
      lastName: "Visitante",
      phoneNumber: "+59170000000",
      birthdate: new Date("1995-05-05T12:00:00Z"),
      newsOptIn,
    })
    .returning({ id: visitors.id });
  created.visitors.push(row!.id);
  return row!.id;
}

async function createGuestOrder(
  email: string,
  newsOptIn: boolean | null,
  name = "Gabi Compradora",
) {
  const [row] = await integrationDb!
    .insert(orders)
    .values({
      userId: null,
      guestName: name,
      guestEmail: email,
      guestPhone: "+59170000001",
      guestOrderToken: randomUUID(),
      guestNewsOptIn: newsOptIn,
      totalAmount: 10,
    })
    .returning({ id: orders.id });
  created.orders.push(row!.id);
  return row!.id;
}

async function createUser(
  role: "admin" | "user",
  email = address(role),
  status: "verified" | "banned" = "verified",
) {
  const [row] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `vis-it-${randomUUID()}`,
      email,
      firstName: role === "admin" ? "Ada" : "Uma",
      lastName: "Prueba",
      role,
      status,
    })
    .returning({ id: users.id, email: users.email });
  created.users.push(row!.id);
  return row!;
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

/** A visitor draft, as the composer leaves it. */
async function createDraft(
  by: number,
  overrides: { sendPush?: boolean; essential?: boolean } = {},
) {
  const [row] = await integrationDb!
    .insert(comunicados)
    .values({
      audienceKind: "visitors",
      title: "Nuevo merch de Navidad",
      doc: doc("Llegaron los stickers nuevos."),
      actionLabel: "Ver la tienda",
      actionPath: "/merch",
      sendEmail: true,
      sendPush: overrides.sendPush ?? false,
      essential: overrides.essential ?? false,
      essentialReason: overrides.essential ? "Una razón de prueba" : null,
      createdByUserId: by,
      updatedByUserId: by,
    })
    .returning({ id: comunicados.id, version: comunicados.version });
  created.comunicados.push(row!.id);
  return row!;
}

/** "Enviar ahora", with the count the dialog would have shown. */
async function sendNow(comunicadoId: number, by: number, version: number) {
  const { db } = await import("@/db");
  const counts = await contacts.countContactAudience(db, {
    narrow: state.vercelEnv !== "production",
  });
  return send.sendComunicadoNow({
    comunicadoId,
    by,
    expectedVersion: version,
    typedCount: counts.eligible,
  });
}

type ContactRow = {
  id: number;
  email_key: string;
  email: string;
  name: string | null;
  source: string;
  status: string;
  skipped_reason: string | null;
  delivery_id: number | null;
};

async function contactsOf(campaignId: number, keys: string[]) {
  const { rows } = await pool!.query<ContactRow>(
    `SELECT id, email_key, email, name, source, status, skipped_reason, delivery_id
     FROM notification_campaign_contacts
     WHERE campaign_id = $1 AND email_key = ANY($2::text[])
     ORDER BY email_key`,
    [campaignId, keys.map((key) => key.toLowerCase())],
  );
  return new Map(rows.map((row) => [row.email_key, row]));
}

/** Written by the test itself, not through the app's logged pool. */
async function optOut(email: string, topic: "news" | "all" | "announcements") {
  await pool!.query(
    "INSERT INTO email_unsubscribes (email_key, topic) VALUES (lower(trim($1)), $2) ON CONFLICT DO NOTHING",
    [email, topic],
  );
}

async function deliveryOf(id: number) {
  const { rows } = await pool!.query<{
    status: string;
    last_error: string | null;
    notification_id: number | null;
    user_id: number | null;
    campaign_id: number | null;
    template_key: string;
    lane: string;
  }>(
    `SELECT status, last_error, notification_id, user_id, campaign_id,
            template_key, lane
     FROM notification_deliveries WHERE id = $1`,
    [id],
  );
  return rows[0]!;
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
const batchEmails: BatchEmail[] = [];

function emailTo(to: string) {
  const found = batchEmails.filter((email) =>
    email.to.some((t) => t.toLowerCase() === to.toLowerCase()),
  );
  expect(found).toHaveLength(1);
  return found[0]!;
}

function runLane(campaignId: number) {
  return bulk.sendBulkEmails({
    campaignId,
    deadline: Date.now() + 60_000,
    timing: FAST,
  });
}

describeDatabase("comunicados to visitors and guest buyers", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    send = await import("@/app/lib/comunicados/send");
    contacts = await import("@/app/lib/comunicados/contacts");
    bulk = await import("@/app/lib/notifications/bulk-email");
    tokens = await import("@/app/lib/emails/unsubscribe-tokens");
    suppressions = await import("@/app/lib/emails/suppressions");
    retract = await import("@/app/lib/comunicados/retract");
    report = await import("@/app/lib/comunicados/report");
    fanout = await import("@/app/lib/comunicados/fanout");
    retry = await import("@/app/lib/comunicados/retry");

    const { db } = await import("@/db");
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(rows[0]?.name).toBe(
      decodeURIComponent(new URL(testDatabaseUrl!).pathname.slice(1)),
    );
    try {
      await pool!.query("SELECT 1 FROM notification_campaign_contacts LIMIT 1");
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    batchEmails.length = 0;
    sendBatchMock.mockReset();
    sendBatchMock.mockImplementation(async (emails: BatchEmail[]) => {
      batchEmails.push(...emails);
      return {
        data: {
          data: emails.map(() => ({ id: `re_${randomUUID()}` })),
          errors: [],
        },
        error: null,
        headers: {},
      };
    });
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  async function cleanUp() {
    const db = integrationDb!;
    if (created.comunicados.length > 0) {
      const { rows } = await pool!.query<{ campaign_id: number | null }>(
        "SELECT campaign_id FROM comunicados WHERE id = ANY($1::int[])",
        [created.comunicados],
      );
      await db
        .delete(comunicadoRevisions)
        .where(inArray(comunicadoRevisions.comunicadoId, created.comunicados));
      await db
        .delete(comunicados)
        .where(inArray(comunicados.id, created.comunicados));
      const campaignIds = rows.flatMap((row) =>
        row.campaign_id == null ? [] : [Number(row.campaign_id)],
      );
      if (campaignIds.length > 0) {
        // Contacts and their email rows cascade.
        await db
          .delete(notificationCampaigns)
          .where(inArray(notificationCampaigns.id, campaignIds));
      }
    }
    if (created.orders.length > 0) {
      await db.delete(orders).where(inArray(orders.id, created.orders));
    }
    if (created.visitors.length > 0) {
      await db.delete(visitors).where(inArray(visitors.id, created.visitors));
    }
    if (created.users.length > 0) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
    if (created.emailKeys.length > 0) {
      const keys = created.emailKeys.map((key) => key.toLowerCase());
      await db
        .delete(emailUnsubscribes)
        .where(inArray(emailUnsubscribes.emailKey, keys));
      await db
        .delete(emailSuppressions)
        .where(inArray(emailSuppressions.emailKey, keys));
    }
    created.users = [];
    created.visitors = [];
    created.orders = [];
    created.comunicados = [];
    created.emailKeys = [];
  }

  afterEach(async () => {
    const errors = consoleError.mock.calls;
    const statements = JSON.stringify(consoleLog.mock.calls);
    const warnings = JSON.stringify(consoleWarn.mock.calls);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
    state.vercelEnv = "production";
    state.admin = null;
    await cleanUp();
    expect(errors).toEqual([]);
    // No address is ever a query parameter or a log line.
    expect(statements).not.toContain("@example.test");
    expect(warnings).not.toContain("@example.test");
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    const { pool: appPool } = await import("@/db");
    await appPool.end();
  });

  it("snapshots every contact once by address, honours consent and opt-outs, and mails them as Novedades", async () => {
    const admin = await createUser("admin");

    const legacy = address("legacy");
    await createVisitor(legacy, null, "Lía");
    // The same person typed twice, in another case: one contact.
    await createVisitor(legacy.toUpperCase(), true, "Otra");

    const declined = address("declined");
    await createVisitor(declined, false);

    // A legacy visitor who later declined at checkout keeps the assumed
    // consent: only an address whose every record said no is left out.
    const mixed = address("mixed");
    await createVisitor(mixed, null, "Mica");
    await createGuestOrder(mixed, false);

    const guest = address("guest");
    await createGuestOrder(guest, true, "Gabi Compradora");
    await createGuestOrder(guest, null, "Gabriela Otra");

    const guestDeclined = address("guest-declined");
    await createGuestOrder(guestDeclined, false);

    const leftNews = address("left-news");
    await createVisitor(leftNews, null);
    await optOut(leftNews, "news");

    const leftAll = address("left-all");
    await createVisitor(leftAll, true);
    await optOut(leftAll, "all");

    // Another topic's opt-out does not cover Novedades.
    const leftAnnouncements = address("left-announcements");
    await createVisitor(leftAnnouncements, true);
    await optOut(leftAnnouncements, "announcements");

    const bounced = address("bounced");
    await createVisitor(bounced, null);
    await pool!.query(
      "INSERT INTO email_suppressions (email_key, reason) VALUES ($1, 'bounce')",
      [bounced],
    );

    // An account holder who also visited gets it once, as a visitor.
    const holder = address("holder");
    await createUser("user", holder);
    await createVisitor(holder, true);

    const draft = await createDraft(admin.id);
    const started = await sendNow(draft.id, admin.id, draft.version);
    expect(started.kind).toBe("started");
    if (started.kind !== "started") return;
    expect(started.narrowed).toBe(false);
    const { campaignId } = started;

    const all = [
      legacy,
      declined,
      mixed,
      guest,
      guestDeclined,
      leftNews,
      leftAll,
      leftAnnouncements,
      bounced,
      holder,
    ];
    const rows = await contactsOf(campaignId, all);
    expect(rows.size).toBe(all.length);
    const r = COMUNICADO_CONTACT_SKIP_REASONS;
    const expected: Record<string, [string, string | null, string]> = {
      [legacy]: ["queued", null, "visitor"],
      [declined]: ["skipped", r.noConsent, "visitor"],
      [mixed]: ["queued", null, "visitor"],
      [guest]: ["queued", null, "guest_buyer"],
      [guestDeclined]: ["skipped", r.noConsent, "guest_buyer"],
      [leftNews]: ["skipped", r.unsubscribed, "visitor"],
      [leftAll]: ["skipped", r.unsubscribed, "visitor"],
      [leftAnnouncements]: ["queued", null, "visitor"],
      [bounced]: ["skipped", r.suppressed, "visitor"],
      [holder]: ["queued", null, "visitor"],
    };
    for (const [email, [status, reason, source]] of Object.entries(expected)) {
      const row = rows.get(email)!;
      expect([row.status, row.skipped_reason, row.source], email).toEqual([
        status,
        reason,
        source,
      ]);
      expect(row.delivery_id !== null, email).toBe(status === "queued");
    }
    // The oldest visitor row names the contact; else a guest's first name.
    expect(rows.get(legacy)!.name).toBe("Lía");
    expect(rows.get(legacy)!.email).toBe(legacy);
    expect(rows.get(guest)!.name).toBe("Gabriela");

    // Email only: no inbox item, no user, no participant recipient.
    const delivery = await deliveryOf(rows.get(legacy)!.delivery_id!);
    expect(delivery).toMatchObject({
      status: "pending",
      notification_id: null,
      user_id: null,
      campaign_id: campaignId,
      template_key: "comunicado_contact",
      lane: "bulk",
    });
    const { rows: inbox } = await pool!.query(
      "SELECT 1 FROM notifications WHERE campaign_id = $1",
      [campaignId],
    );
    expect(inbox).toHaveLength(0);
    const { rows: recipients } = await pool!.query(
      "SELECT 1 FROM notification_campaign_recipients WHERE campaign_id = $1",
      [campaignId],
    );
    expect(recipients).toHaveLength(0);

    const { rows: stored } = await pool!.query<{
      audience_summary: { audienceKind: string; channels: unknown };
    }>("SELECT audience_summary FROM comunicados WHERE id = $1", [draft.id]);
    expect(stored[0]!.audience_summary.audienceKind).toBe("visitors");
    expect(stored[0]!.audience_summary.channels).toEqual({
      email: true,
      push: false,
    });

    // An opt-out after the snapshot is honoured at send.
    await optOut(leftAnnouncements, "news");

    await runLane(campaignId);

    const mail = emailTo(legacy);
    expect(mail.from).toBe(FROM);
    expect(mail.replyTo).toBe(REPLY_TO);
    expect(mail.subject).toBe("Nuevo merch de Navidad");
    expect(mail.html).toContain("Llegaron los stickers nuevos.");
    expect(mail.html).toContain(`${BASE_URL}/merch`);
    expect(mail.text).toContain(COMUNICADO_VISITOR_NOTE);
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const oneClick = mail.headers?.["List-Unsubscribe"] ?? "";
    expect(oneClick).toMatch(
      new RegExp(`^<${BASE_URL}/api/email/unsubscribe\\?token=`),
    );
    const token = decodeURIComponent(
      oneClick.slice(oneClick.indexOf("token=") + 6, -1),
    );
    expect(tokens.verifyUnsubscribeToken(token)).toEqual({
      kind: "contact",
      id: rows.get(legacy)!.id,
      topic: "news",
    });
    emailTo(guest);
    emailTo(holder);
    expect(
      batchEmails.some((email) =>
        email.to.some((to) => to === leftAnnouncements),
      ),
    ).toBe(false);
    expect(
      (await deliveryOf(rows.get(leftAnnouncements)!.delivery_id!)).last_error,
    ).toBe("unsubscribed");

    // The one-click endpoint resolves the contact to the address it mailed.
    const subject = tokens.verifyUnsubscribeToken(token)!;
    expect(await suppressions.recipientAddress(subject)).toBe(legacy);

    // The run closes the campaign once nothing is waiting.
    expect(await fanout.completeComunicadoCampaign(campaignId)).toBe(true);

    // The report: email-only rows, nothing read in the app.
    state.admin = { id: admin.id };
    const kpis = (await report.fetchComunicadoReport(draft.id))!;
    expect(kpis.audienceKind).toBe("visitors");
    expect(kpis.kpis.read).toBe(0);
    expect(kpis.kpis.emailSent).toBeGreaterThanOrEqual(4);
    const page = (await report.fetchComunicadoRecipients(draft.id, {
      filter: "all",
      query: legacy.split("@")[0]!,
      page: 1,
    }))!;
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      key: `contact:${rows.get(legacy)!.id}`,
      userId: null,
      name: "Lía",
      email: legacy,
      source: "visitor",
      app: "Solo correo",
      device: "—",
    });
    const skipped = (await report.fetchComunicadoRecipients(draft.id, {
      filter: "skipped",
      query: declined.split("@")[0]!,
      page: 1,
    }))!;
    expect(skipped.rows[0]?.app).toBe(`Omitido: ${r.noConsent}`);
  }, 60_000);

  it("outside production, skips every contact and mails the admins instead", async () => {
    state.vercelEnv = "preview";
    const admin = await createUser("admin");
    const banned = await createUser("admin", address("banned"), "banned");
    const visitor = address("preview-visitor");
    await createVisitor(visitor, true);

    const draft = await createDraft(admin.id);
    const started = await sendNow(draft.id, admin.id, draft.version);
    expect(started.kind).toBe("started");
    if (started.kind !== "started") return;
    expect(started.narrowed).toBe(true);

    const rows = await contactsOf(started.campaignId, [
      visitor,
      admin.email,
      banned.email,
    ]);
    expect(rows.get(visitor)).toMatchObject({
      status: "skipped",
      skipped_reason: COMUNICADO_CONTACT_SKIP_REASONS.staging,
    });
    expect(rows.get(admin.email.toLowerCase())).toMatchObject({
      status: "queued",
      source: "staging_admin",
    });
    expect(rows.has(banned.email.toLowerCase())).toBe(false);

    await runLane(started.campaignId);
    const mail = emailTo(admin.email);
    expect(mail.from).toBe(FROM_STAGING);
    expect(mail.subject.startsWith("[")).toBe(true);
    expect(batchEmails.some((email) => email.to.includes(visitor))).toBe(false);
  }, 60_000);

  it("a visitor row on a preview's campaign is never mailed from a preview", async () => {
    state.vercelEnv = "preview";
    const admin = await createUser("admin");
    await createVisitor(address("preview-audience"), true);
    const draft = await createDraft(admin.id);
    const started = await sendNow(draft.id, admin.id, draft.version);
    if (started.kind !== "started") throw new Error("not started");
    // A snapshot bug: a visitor row queued on a preview campaign.
    const stray = address("stray");
    await pool!.query(
      `WITH c AS (
         INSERT INTO notification_campaign_contacts
           (campaign_id, email_key, email, source, status)
         VALUES ($1, $2, $2, 'visitor', 'queued') RETURNING id
       )
       INSERT INTO notification_deliveries
         (campaign_id, template_key, channel, lane, recipient_email, payload,
          idempotency_key)
       SELECT $1, 'comunicado_contact', 'email', 'bulk', $2,
              jsonb_build_object('comunicadoId', $3::int, 'contactId', c.id),
              'stray:' || c.id
       FROM c`,
      [started.campaignId, stray, draft.id],
    );
    await runLane(started.campaignId);
    expect(batchEmails.some((email) => email.to.includes(stray))).toBe(false);
    const { rows } = await pool!.query<{ last_error: string }>(
      `SELECT last_error FROM notification_deliveries
       WHERE campaign_id = $1 AND recipient_email = $2`,
      [started.campaignId, stray],
    );
    expect(rows[0]?.last_error).toBe("staging");
  }, 60_000);

  it("refuses a visitor comunicado with push or essential, and the CHECK backs it", async () => {
    const admin = await createUser("admin");
    const visitor = address("refused");
    await createVisitor(visitor, true);
    const withPush = await createDraft(admin.id, { sendPush: true });
    await expect(
      sendNow(withPush.id, admin.id, withPush.version),
    ).rejects.toMatchObject({ code: "INVALID_AUDIENCE" });

    await expect(
      pool!.query(
        `UPDATE comunicados SET status = 'scheduled', scheduled_at = now() + interval '1 day'
         WHERE id = $1`,
        [withPush.id],
      ),
    ).rejects.toMatchObject({ constraint: "comunicados_visitors_email_only" });
  }, 60_000);

  it("a retraction skips the queued emails and closes the campaign; a retry resends a failed one", async () => {
    const admin = await createUser("admin");
    const first = address("retract");
    await createVisitor(first, true);
    const draft = await createDraft(admin.id);
    const started = await sendNow(draft.id, admin.id, draft.version);
    if (started.kind !== "started") throw new Error("not started");
    const rows = await contactsOf(started.campaignId, [first]);
    const deliveryId = rows.get(first)!.delivery_id!;

    // A failure no attempt may have landed is retried to the frozen address.
    await pool!.query(
      "UPDATE notification_deliveries SET status = 'failed', last_error = 'resend:validation_error' WHERE id = $1",
      [deliveryId],
    );
    await pool!.query(
      "UPDATE notification_deliveries SET status = 'skipped', last_error = 'test' WHERE campaign_id = $1 AND id <> $2 AND status = 'pending'",
      [started.campaignId, deliveryId],
    );
    const retried = await retry.retryFailedComunicado(draft.id, admin.id);
    expect(retried).toMatchObject({ ok: true, emails: 1 });
    const after = await contactsOf(started.campaignId, [first]);
    const newDelivery = after.get(first)!.delivery_id!;
    expect(newDelivery).not.toBe(deliveryId);
    expect(await deliveryOf(newDelivery)).toMatchObject({
      status: "pending",
      campaign_id: started.campaignId,
      template_key: "comunicado_contact",
    });

    const outcome = await retract.retractComunicado(
      draft.id,
      { reason: "Salió con un error" },
      admin.id,
    );
    expect(outcome).toMatchObject({ ok: true, completed: true });
    expect(await deliveryOf(newDelivery)).toMatchObject({
      status: "skipped",
      last_error: "retracted",
    });
    await runLane(started.campaignId);
    expect(batchEmails).toHaveLength(0);
  }, 60_000);
});
