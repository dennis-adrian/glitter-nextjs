// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgInsertValue } from "drizzle-orm/pg-core";
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
  type MockInstance,
} from "vitest";

import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  notifications,
  users,
} from "@/db/schema";

/**
 * What a participant's inbox reads of a comunicado
 * (docs/IMPLEMENTATION-comunicados.md A2, H1, H2): the detail's text at the
 * current revision, `editedAt` in the DTO, and whether the "Anuncios" chip has
 * anything to show, under the inbox's own visibility. The sends are written in
 * SQL, as `startComunicadoSend` and the fan-out leave them. Every assertion is
 * about this file's own fixtures, never a total over the shared database.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));

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

type Inbox = typeof import("@/app/lib/notifications/queries");
let inbox: Inbox;

type Viewer = { id: number; role: "admin" | "user" };

const created = {
  users: [] as number[],
  comunicados: [] as number[],
  campaigns: [] as number[],
};

/** A one-person production send's `audience_summary`, frozen at send (A4). */
const SUMMARY: ComunicadoAudienceSummary = {
  v: 1,
  env: "production",
  narrowed: false,
  sources: [
    { kind: "people", id: null, label: "Por nombre", matched: 1, eligible: 1 },
  ],
  matched: 1,
  eligible: 1,
  willReceive: 1,
  stagingAdmins: 0,
  pickedByName: 1,
  skipped: [],
  channels: { email: true, push: false },
  email: {
    sendTo: 1,
    unsubscribedAnnouncements: 0,
    unsubscribedAll: 0,
    suppressed: 0,
    invalid: 0,
  },
  essentialFestival: null,
  essentialOverride: 0,
  essentialNotOverridden: 0,
};

async function createUser(role: Viewer["role"] = "user"): Promise<Viewer> {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `comunicado-inbox-${suffix}`,
      email: `comunicado-inbox-${suffix}@example.com`,
      displayName: "Ana Ilustra",
      role,
      status: "verified",
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return { id: user!.id, role };
}

type Sent = { comunicadoId: number; campaignId: number; title: string };

/**
 * A sent comunicado: its campaign, the row at `current_revision`, and one
 * revision per entry of `htmls` (an edit adds one after the send's first).
 */
async function sendComunicado(senderId: number, htmls: string[]) {
  const title = `Cambio de horario ${randomUUID().slice(0, 8)}`;
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key, completed_at)
     VALUES ('comunicado', 'completed', $1, 'El armado empieza a las 8:00.', $2, $3, now())
     RETURNING id`,
    [title, senderId, `comunicado:test-${randomUUID()}`],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, audience_summary,
        send_email, send_push, sent_at, sent_by_user_id,
        created_by_user_id, updated_by_user_id)
     VALUES ('sent', $1, $2, $3, $4::jsonb, true, false, now(), $5, $5, $5)
     RETURNING id`,
    [title, campaignId, htmls.length, JSON.stringify(SUMMARY), senderId],
  );
  const comunicadoId = comunicado.rows[0]!.id;
  created.comunicados.push(comunicadoId);
  for (const [index, html] of htmls.entries()) {
    await pool!.query(
      `INSERT INTO comunicado_revisions
         (comunicado_id, revision, title, doc, html, text, created_by_user_id)
       VALUES ($1, $2, $3, '[]'::jsonb, $4, 'El armado empieza a las 8:00.', $5)`,
      [comunicadoId, index + 1, title, html, senderId],
    );
  }
  return { comunicadoId, campaignId, title } satisfies Sent;
}

/** Columns to override, SQL included (`now() - interval …`). */
type ItemValues = Partial<PgInsertValue<typeof notifications>>;

/** The inbox item the fan-out writes for one recipient (D2). */
async function deliver(userId: number, sent: Sent, values: ItemValues = {}) {
  const [row] = await integrationDb!
    .insert(notifications)
    .values({
      userId,
      kind: "comunicado",
      category: "announcements",
      title: sent.title,
      body: "El armado empieza a las 8:00.",
      campaignId: sent.campaignId,
      data: {
        comunicadoId: sent.comunicadoId,
        revision: 1,
        title: sent.title,
        excerpt: "El armado empieza a las 8:00.",
        actionPath: null,
        actionLabel: null,
      },
      dedupeKey: `comunicado:${sent.comunicadoId}`,
      ...values,
    })
    .returning({ id: notifications.id });
  return row!.id;
}

/** Any other kind of item. */
async function createItem(userId: number, values: ItemValues) {
  const [row] = await integrationDb!
    .insert(notifications)
    .values({
      userId,
      kind: "credit_gift_received",
      category: "credits",
      title: "Recibiste 20 créditos de regalo",
      body: "Gracias por estar en Glitter.",
      dedupeKey: `test:${randomUUID()}`,
      ...values,
    })
    .returning({ id: notifications.id });
  return row!.id;
}

/** What F3 step 3 writes: archived (kept if it already was) and retracted. */
async function retract(id: number) {
  await pool!.query(
    `UPDATE notifications
        SET archived_at = coalesce(archived_at, now()), retracted_at = now()
      WHERE id = $1`,
    [id],
  );
}

const BEFORE = "<h2>Horario de armado</h2><p>El armado empieza a las 8:00.</p>";
const AFTER =
  '<h2>Horario de armado</h2><p>El armado empieza a las 9:00. Mirá <a target="_blank" rel="noopener noreferrer nofollow" href="https://maps.example.com/glitter">el mapa</a>.</p>';

describeDatabase("a comunicado in the participant's inbox", () => {
  let log: MockInstance<typeof console.log>;
  let warn: MockInstance<typeof console.warn>;
  let error: MockInstance<typeof console.error>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    inbox = await import("@/app/lib/notifications/queries");

    try {
      await integrationDb!
        .select({ html: comunicadoRevisions.html })
        .from(comunicadoRevisions)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    // The app's database logger prints every statement with its params.
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    warn = vi.spyOn(console, "warn");
    error = vi.spyOn(console, "error");
  });

  afterEach(async () => {
    const params = log.mock.calls.flatMap(([entry]) =>
      entry && typeof entry === "object" && "params" in entry
        ? (entry.params as unknown[])
        : [],
    );
    const warnings = [...warn.mock.calls];
    const errors = [...error.mock.calls];
    vi.restoreAllMocks();

    const db = integrationDb!;
    // Items first (by campaign and by person), then what holds what:
    // revisions hold their comunicado, which holds its campaign (RESTRICT).
    if (created.campaigns.length > 0) {
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
      await db
        .delete(notificationCampaigns)
        .where(inArray(notificationCampaigns.id, created.campaigns));
    }
    if (created.users.length > 0) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
    created.users.length = 0;
    created.comunicados.length = 0;
    created.campaigns.length = 0;

    // No address ever travels as a parameter, and nothing went wrong.
    expect(
      params.filter(
        (param) => typeof param === "string" && param.includes("@"),
      ),
    ).toEqual([]);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("the detail's text (H2)", () => {
    it("reads a comunicado at its current revision, not the one it was sent with", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE, AFTER]);
      const id = await deliver(ana.id, sent);

      const detail = await inbox.fetchNotificationForViewer(ana, id);
      expect(detail).toMatchObject({
        id,
        kind: "comunicado",
        category: "announcements",
        title: sent.title,
        body: "El armado empieza a las 8:00.",
        opensDetail: true,
        message: null,
        bodyHtml: AFTER,
      });
    });

    it("reads revision 1 for a comunicado never edited", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE]);
      const id = await deliver(ana.id, sent);

      expect((await inbox.fetchNotificationForViewer(ana, id))?.bodyHtml).toBe(
        BEFORE,
      );
    });

    it("has no rich body for any other kind, even one that names a comunicado", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE]);
      const gift = await createItem(ana.id, {
        data: { message: "Gracias por estar en Glitter Navidad." },
      });
      // The admin's item about a refused schedule names the same comunicado;
      // given its campaign too, only the kind tells the two apart.
      const notSent = await createItem(admin.id, {
        kind: "comunicado_not_sent",
        category: "admin",
        title: `No se envió «${sent.title}»`,
        campaignId: sent.campaignId,
        data: { comunicadoId: sent.comunicadoId },
      });

      expect(await inbox.fetchNotificationForViewer(ana, gift)).toMatchObject({
        message: "Gracias por estar en Glitter Navidad.",
        bodyHtml: null,
      });
      expect(
        await inbox.fetchNotificationForViewer(admin, notSent),
      ).toMatchObject({ kind: "comunicado_not_sent", bodyHtml: null });
    });

    it("shows the plain body when the item does not lead back to its comunicado", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE]);
      const other = await sendComunicado(admin.id, [AFTER]);

      const items = [
        // Another comunicado's id under this campaign.
        await deliver(ana.id, sent, {
          dedupeKey: `test:${randomUUID()}`,
          data: { comunicadoId: other.comunicadoId },
        }),
        // No campaign left to tie it to.
        await deliver(ana.id, sent, {
          dedupeKey: `test:${randomUUID()}`,
          campaignId: null,
        }),
        // Ids no comunicado can have, which the query must not even try.
        ...(await Promise.all(
          [String(sent.comunicadoId), 2_147_483_648, 1.5, -1, null].map(
            (comunicadoId) =>
              deliver(ana.id, sent, {
                dedupeKey: `test:${randomUUID()}`,
                data: { comunicadoId },
              }),
          ),
        )),
      ];

      for (const id of items) {
        expect(
          await inbox.fetchNotificationForViewer(ana, id),
          String(id),
        ).toMatchObject({
          body: "El armado empieza a las 8:00.",
          bodyHtml: null,
        });
      }
    });

    it("shows nothing once it is retracted, so the page sends them to the inbox", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE]);
      const id = await deliver(ana.id, sent);
      await retract(id);

      expect(await inbox.fetchNotificationForViewer(ana, id)).toBeNull();
    });
  });

  describe("editedAt in the DTO (A2, H1)", () => {
    it("carries edited_at to the list and the detail, and null when never edited", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE, AFTER]);
      const editedAt = new Date("2026-10-25T14:12:00.000Z");
      const edited = await deliver(ana.id, sent, { editedAt });
      const untouched = await createItem(ana.id, {});

      const page = await inbox.fetchInboxPage(ana);
      expect(
        page.items.map((item) => ({ id: item.id, editedAt: item.editedAt })),
      ).toEqual([
        { id: untouched, editedAt: null },
        { id: edited, editedAt: editedAt.toISOString() },
      ]);
      expect(
        (await inbox.fetchNotificationForViewer(ana, edited))?.editedAt,
      ).toBe(editedAt.toISOString());
      expect(
        (await inbox.fetchNotificationForViewer(ana, untouched))?.editedAt,
      ).toBeNull();
    });
  });

  describe("hasVisibleAnnouncements (H1)", () => {
    it("is true once the viewer has an anuncio in view, read or not", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE]);
      await createItem(ana.id, {});
      expect(await inbox.hasVisibleAnnouncements(ana)).toBe(false);

      const id = await deliver(ana.id, sent);
      expect(await inbox.hasVisibleAnnouncements(ana)).toBe(true);
      await integrationDb!
        .update(notifications)
        .set({ readAt: sql`now()` })
        .where(eq(notifications.id, id));
      expect(await inbox.hasVisibleAnnouncements(ana)).toBe(true);
    });

    it("is false when the only anuncio is archived, retracted, someone else's or past retention", async () => {
      const admin = await createUser("admin");
      const sent = await sendComunicado(admin.id, [BEFORE]);

      const archived = await createUser();
      await deliver(archived.id, sent, { archivedAt: sql`now()` });

      const retracted = await createUser();
      await retract(await deliver(retracted.id, sent));

      const owner = await createUser();
      const someoneElse = await createUser();
      await deliver(owner.id, sent);

      const old = await createUser();
      await deliver(old.id, sent, {
        createdAt: sql`now() - interval '181 days'`,
      });

      expect(await inbox.hasVisibleAnnouncements(archived)).toBe(false);
      expect(await inbox.hasVisibleAnnouncements(retracted)).toBe(false);
      expect(await inbox.hasVisibleAnnouncements(someoneElse)).toBe(false);
      expect(await inbox.hasVisibleAnnouncements(old)).toBe(false);
      expect(await inbox.hasVisibleAnnouncements(owner)).toBe(true);
    });

    it("agrees with what the Anuncios filter lists", async () => {
      const admin = await createUser("admin");
      const ana = await createUser();
      const sent = await sendComunicado(admin.id, [BEFORE]);
      const id = await deliver(ana.id, sent);

      const page = await inbox.fetchInboxPage(ana, {
        filter: "announcements",
      });
      expect(page.items.map((item) => item.id)).toEqual([id]);
      expect(await inbox.hasVisibleAnnouncements(ana)).toBe(true);

      await retract(id);
      expect(
        (await inbox.fetchInboxPage(ana, { filter: "announcements" })).items,
      ).toEqual([]);
      expect(await inbox.hasVisibleAnnouncements(ana)).toBe(false);
    });
  });
});
