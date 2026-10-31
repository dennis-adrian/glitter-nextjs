// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
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

import type {
  ComunicadoAudience,
  ComunicadoDraftInput,
} from "@/app/lib/comunicados/definitions";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  festivals,
  notificationCampaigns,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Writing comunicados against a real database (docs/IMPLEMENTATION-comunicados.md
 * A4, B5, B6, E1, G2, G4): create, the autosave's compare-and-set, discard,
 * the CHECKs that only spare drafts, and the read-only audience preview.
 * Every assertion is about this file's own fixtures, never a total over the
 * shared database.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

type Viewer = { id: number; role: "admin" | "festival_admin" | "user" };
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
  // Only `comunicados` is switchable: a guard on the wrong flag refuses even
  // with it on, so every admin test below would fail.
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/comunicados/actions");
let actions: Actions;

const LIST_PATH = "/dashboard/communications";
const MISSING_ID = 2_147_483_000;
const DAY = 24 * 3600_000;
const STAGING = "Entorno de prueba: no se envía a listas";
const NOT_DRAFT = "Este comunicado ya no es un borrador.";
const STALE =
  "Este borrador cambió en otra pestaña. Recargá para ver la última versión.";

const created = {
  users: [] as number[],
  festivals: [] as number[],
  stands: [] as number[],
  reservations: [] as number[],
  comunicados: [] as number[],
  campaigns: [] as number[],
};

type UserFixture = Partial<typeof users.$inferInsert> & { name?: string };

async function createUser(fixture: UserFixture = {}) {
  const suffix = randomUUID();
  const { name, ...values } = fixture;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `drafts-${suffix}`,
      email: `drafts-${suffix}@example.com`,
      displayName: name ?? `Borrador ${suffix.slice(0, 8)}`,
      role: "user",
      status: "verified",
      ...values,
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

async function signInAs(role: Viewer["role"]) {
  state.viewer = { id: await createUser({ role }), role };
  return state.viewer;
}

async function createFestival() {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Borradores ${randomUUID()}`, status: "active" })
    .returning({ id: festivals.id });
  created.festivals.push(festival!.id);
  return festival!.id;
}

let standNumber = 8600;

/** An accepted reservation: the owner and partners hold it as participations. */
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

async function insertDraft(
  authorId: number,
  values: Partial<typeof comunicados.$inferInsert> = {},
) {
  const [row] = await integrationDb!
    .insert(comunicados)
    .values({
      title: "Borrador guardado",
      createdByUserId: authorId,
      updatedByUserId: authorId,
      ...values,
    })
    .returning({ id: comunicados.id });
  created.comunicados.push(row!.id);
  return row!.id;
}

async function insertScheduled(authorId: number) {
  return insertDraft(authorId, {
    status: "scheduled",
    title: "Programado",
    scheduledAt: new Date(Date.now() + DAY),
    scheduledByUserId: authorId,
  });
}

/** A sent comunicado as the send leaves it: its campaign and revision 1. */
async function insertSent(authorId: number) {
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key, completed_at)
     VALUES ('comunicado', 'completed', 'Enviado', 'Texto enviado', $1, $2, now())
     RETURNING id`,
    [authorId, `comunicado:drafts-test-${randomUUID()}`],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, sent_at, sent_by_user_id,
        created_by_user_id, updated_by_user_id)
     VALUES ('sent', 'Enviado', $1, 1, now(), $2, $2, $2)
     RETURNING id`,
    [campaignId, authorId],
  );
  const id = comunicado.rows[0]!.id;
  created.comunicados.push(id);
  await pool!.query(
    `INSERT INTO comunicado_revisions
       (comunicado_id, revision, title, doc, html, text, created_by_user_id)
     VALUES ($1, 1, 'Enviado', '[]'::jsonb, '<p>Texto enviado</p>', 'Texto enviado', $2)`,
    [id, authorId],
  );
  return id;
}

async function rowOf(id: number) {
  const [row] = await integrationDb!
    .select()
    .from(comunicados)
    .where(eq(comunicados.id, id));
  return row ?? null;
}

function paragraph(text: string, extra: Record<string, unknown> = {}) {
  return {
    type: "paragraph",
    props: {},
    content: [{ type: "text", text, styles: {} }],
    children: [],
    ...extra,
  };
}

/** A paragraph as `normalizeAnnouncementDoc` stores it. */
function storedParagraph(text: string, styles: Record<string, true> = {}) {
  return {
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: [{ type: "text", text, styles }],
    children: [],
  };
}

function audience(value: Partial<ComunicadoAudience> = {}) {
  return { festivals: [], lists: [], people: [], ...value };
}

function draftInput(
  comunicadoId: number,
  expectedVersion: number,
  values: Partial<ComunicadoDraftInput> = {},
): ComunicadoDraftInput {
  return {
    comunicadoId,
    expectedVersion,
    // A new save each call; a retry passes the key it repeats.
    saveKey: randomUUID(),
    title: "Cambio de horario de armado",
    doc: [paragraph("El armado empieza a las 8:00.")],
    actionLabel: null,
    actionPath: null,
    sendEmail: true,
    sendPush: false,
    audience: audience(),
    essential: false,
    essentialReason: null,
    ...values,
  };
}

async function save(input: unknown) {
  return actions.saveComunicadoDraftAction(input);
}

async function saved(input: unknown) {
  const result = await save(input);
  if (!result.success) throw new Error(`expected a save: ${result.message}`);
  return result;
}

/** What a write would leave behind for these people. */
async function writtenFor(userIds: number[]) {
  const result = await pool!.query<Record<string, number>>(
    `SELECT
       (SELECT count(*) FROM notifications WHERE user_id = ANY($1::int[]))::int AS notifications,
       (SELECT count(*) FROM notification_deliveries WHERE user_id = ANY($1::int[]))::int AS deliveries,
       (SELECT count(*) FROM notification_campaign_recipients WHERE user_id = ANY($1::int[]))::int AS recipients,
       (SELECT count(*) FROM notification_campaigns WHERE created_by_user_id = ANY($1::int[]))::int AS campaigns,
       (SELECT count(*) FROM comunicados
        WHERE created_by_user_id = ANY($1::int[]) OR updated_by_user_id = ANY($1::int[]))::int AS comunicados`,
    [userIds],
  );
  return result.rows[0]!;
}

describeDatabase("comunicado drafts", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    actions = await import("@/app/lib/comunicados/actions");

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
    state.flagOn = true;
    state.vercelEnv = "production";
    revalidatePath.mockClear();
  });

  afterAll(async () => {
    const db = integrationDb;
    if (db) {
      // Revisions hold their comunicado (RESTRICT), which holds its campaign.
      if (created.comunicados.length > 0) {
        await db
          .delete(comunicadoRevisions)
          .where(
            inArray(comunicadoRevisions.comunicadoId, created.comunicados),
          );
        await db
          .delete(comunicados)
          .where(inArray(comunicados.id, created.comunicados));
      }
      if (created.campaigns.length > 0) {
        await db
          .delete(notificationCampaigns)
          .where(inArray(notificationCampaigns.id, created.campaigns));
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

  describe("create", () => {
    it("creates an empty draft for the acting admin and refreshes the list", async () => {
      const admin = await signInAs("admin");

      const result = await actions.createComunicadoDraftAction();
      if (!result.success) throw new Error(result.message);
      created.comunicados.push(result.comunicadoId);

      expect(await rowOf(result.comunicadoId)).toMatchObject({
        status: "draft",
        version: 1,
        title: "",
        doc: [],
        actionLabel: null,
        actionPath: null,
        sendEmail: true,
        sendPush: false,
        audience: { festivals: [], lists: [], people: [] },
        essential: false,
        essentialReason: null,
        scheduledAt: null,
        campaignId: null,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      });
      expect(revalidatePath).toHaveBeenCalledWith(LIST_PATH);
    });
  });

  describe("autosave", () => {
    it("saves a half-filled button and an essential without a reason, bumping the version", async () => {
      const author = await createUser({ role: "admin" });
      const id = await insertDraft(author);
      const person = await createUser();
      const editor = await signInAs("admin");

      const first = await saved(
        draftInput(id, 1, {
          title: "Cambio de horario",
          actionLabel: "Ver mi reserva",
          actionPath: null,
          sendEmail: false,
          sendPush: true,
          audience: audience({ people: [person, person] }),
          essential: true,
          essentialReason: null,
        }),
      );
      expect(first).toMatchObject({
        version: 2,
        contentError: null,
        replayed: false,
      });

      const row = await rowOf(id);
      expect(row).toMatchObject({
        status: "draft",
        version: 2,
        title: "Cambio de horario",
        actionLabel: "Ver mi reserva",
        actionPath: null,
        sendEmail: false,
        sendPush: true,
        // Picked twice, stored once.
        audience: { festivals: [], lists: [], people: [person] },
        essential: true,
        essentialReason: null,
        createdByUserId: author,
        updatedByUserId: editor.id,
      });
      expect(row!.updatedAt.toISOString()).toBe(first.savedAt);

      // The other half: a path alone, one no send would accept, and a reason
      // too short to send.
      const second = await saved(
        draftInput(id, 2, {
          actionLabel: null,
          actionPath: "/mi reserva",
          essential: true,
          essentialReason: "corto",
        }),
      );
      expect(second.version).toBe(3);
      expect(await rowOf(id)).toMatchObject({
        version: 3,
        actionLabel: null,
        actionPath: "/mi reserva",
        essentialReason: "corto",
      });
      // Each save would otherwise re-render the composer it came from.
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("stores the text normalized", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");

      await saved(
        draftInput(id, 1, {
          doc: [
            {
              type: "paragraph",
              props: { textColor: "red", textAlignment: "center" },
              content: [
                {
                  type: "text",
                  text: "Hola",
                  styles: { bold: true, underline: true },
                },
              ],
              children: [],
            },
            paragraph(""),
          ],
        }),
      );

      expect((await rowOf(id))!.doc).toEqual([
        storedParagraph("Hola", { bold: true }),
      ]);
    });

    it("keeps the stored text when the new one is refused, and saves the rest", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }), {
        doc: [storedParagraph("Antes")],
      });
      await signInAs("admin");

      const result = await saved(
        draftInput(id, 1, {
          title: "Título nuevo",
          doc: [paragraph("Después"), { type: "table", content: {} }],
          sendPush: true,
        }),
      );

      expect(result).toMatchObject({
        version: 2,
        contentError: "Este bloque no se puede usar en un comunicado: tabla.",
      });
      expect(await rowOf(id)).toMatchObject({
        version: 2,
        title: "Título nuevo",
        sendPush: true,
        doc: [storedParagraph("Antes")],
      });
    });

    it("saves fields holding a pasted NUL, which Postgres text refuses", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");

      await saved(
        draftInput(id, 1, {
          title: "Hola\u0000 mundo",
          actionLabel: "Ver\u0000",
          essentialReason: "\u0000Porque sí",
        }),
      );

      expect(await rowOf(id)).toMatchObject({
        title: "Hola mundo",
        actionLabel: "Ver",
        essentialReason: "Porque sí",
      });
    });

    it("refuses a stale version and keeps the newer save", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");

      await saved(draftInput(id, 1, { title: "Pestaña A" }));
      expect(await save(draftInput(id, 1, { title: "Pestaña B" }))).toEqual({
        success: false,
        code: "STALE",
        message: STALE,
      });

      expect(await rowOf(id)).toMatchObject({ version: 2, title: "Pestaña A" });
    });

    it("lets exactly one of two saves from the same version through", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");

      const results = await Promise.all([
        save(draftInput(id, 1, { title: "Primera" })),
        save(draftInput(id, 1, { title: "Segunda" })),
      ]);

      const winners = results.flatMap((result, index) =>
        result.success ? [index] : [],
      );
      expect(winners).toHaveLength(1);
      const loser = results[1 - winners[0]!]!;
      expect(loser).toMatchObject({ success: false, code: "STALE" });
      expect(await rowOf(id)).toMatchObject({
        version: 2,
        title: winners[0] === 0 ? "Primera" : "Segunda",
      });
    });

    it("answers a retry of a save that committed as that save did", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");

      // Its answer never reached the composer, which sends it again.
      const lost = draftInput(id, 1, { title: "Pestaña A" });
      const first = await saved(lost);
      expect(first.replayed).toBe(false);
      expect(await save(lost)).toEqual({ ...first, replayed: true });
      expect(await rowOf(id)).toMatchObject({ version: 2, title: "Pestaña A" });

      // A refused text is refused again: the retry never reports it stored.
      const refused = draftInput(id, 2, {
        doc: [{ type: "table", content: {} }],
      });
      const second = await saved(refused);
      expect(second.contentError).toEqual(expect.any(String));
      expect(await save(refused)).toEqual({ ...second, replayed: true });
      expect(await rowOf(id)).toMatchObject({
        version: 3,
        doc: [storedParagraph("El armado empieza a las 8:00.")],
      });
    });

    it("answers a request with a stored save's key as replayed, writing none of its fields", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }), {
        doc: [storedParagraph("Antes")],
      });
      await signInAs("admin");

      // Stored, but its answer was lost; the composer's next request carries
      // what is on screen by then, with the same key at the same version.
      const lost = draftInput(id, 1, {
        title: "Lo que se guardó",
        doc: [paragraph("Guardado")],
        sendPush: true,
      });
      const first = await saved(lost);
      expect(first).toMatchObject({ version: 2, replayed: false });
      const before = await rowOf(id);

      const replay = await saved({
        ...lost,
        title: "Lo que hay en pantalla",
        doc: [paragraph("En pantalla")],
        sendPush: false,
      });
      expect(replay).toEqual({
        success: true,
        version: 2,
        savedAt: first.savedAt,
        contentError: null,
        replayed: true,
      });
      // The stored fields are the earlier request's, untouched.
      expect(await rowOf(id)).toEqual(before);
      expect(before).toMatchObject({
        version: 2,
        autosaveKey: lost.saveKey,
        title: "Lo que se guardó",
        doc: [storedParagraph("Guardado")],
        sendPush: true,
      });

      // The fields on screen go next with a new key, and are written.
      const next = await saved(
        draftInput(id, 2, {
          title: "Lo que hay en pantalla",
          doc: [paragraph("En pantalla")],
        }),
      );
      expect(next).toMatchObject({ version: 3, replayed: false });
      expect(await rowOf(id)).toMatchObject({
        version: 3,
        title: "Lo que hay en pantalla",
        doc: [storedParagraph("En pantalla")],
        sendPush: false,
      });
    });

    it("refuses another save's key, or a retry after a later write, as stale", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");
      const stale = { success: false, code: "STALE", message: STALE };

      const tabA = draftInput(id, 1, { title: "Pestaña A" });
      await saved(tabA);
      // Another tab, still at version 1, sends its own key.
      expect(await save(draftInput(id, 1, { title: "Pestaña B" }))).toEqual(
        stale,
      );

      // A newer save replaced the key: tab A's retry is not its answer now.
      const tabC = draftInput(id, 2, { title: "Pestaña C" });
      await saved(tabC);
      expect(await save(tabA)).toEqual(stale);

      // A write past the autosave keeps the key but bumps the version.
      await pool!.query(
        "UPDATE comunicados SET version = version + 1 WHERE id = $1",
        [id],
      );
      expect(await save(tabC)).toEqual(stale);
      expect(await rowOf(id)).toMatchObject({
        version: 4,
        autosaveKey: tabC.saveKey,
        title: "Pestaña C",
      });
    });

    it("keeps the stored text when a save leaves it out, and saves the rest", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }), {
        doc: [storedParagraph("Antes")],
      });
      await signInAs("admin");
      // Far too long to send, so the composer kept it back.
      const input = draftInput(id, 1, {
        title: "Título nuevo",
        sendPush: true,
      });
      delete input.doc;

      expect(await saved(input)).toMatchObject({
        version: 2,
        contentError: null,
      });
      expect(await rowOf(id)).toMatchObject({
        version: 2,
        title: "Título nuevo",
        sendPush: true,
        doc: [storedParagraph("Antes")],
      });
    });

    it("refuses a comunicado that is not a draft, or is gone, changing nothing", async () => {
      const author = await createUser({ role: "admin" });
      const scheduled = await insertScheduled(author);
      const sent = await insertSent(author);
      await signInAs("admin");

      // Both are at version 1, so only the status turns the save away.
      for (const id of [scheduled, sent]) {
        const before = await rowOf(id);
        expect(
          await save(draftInput(id, 1, { title: "No debería guardarse" })),
        ).toEqual({ success: false, code: "NOT_DRAFT", message: NOT_DRAFT });
        expect(await rowOf(id)).toEqual(before);
      }

      expect(await save(draftInput(MISSING_ID, 1))).toEqual({
        success: false,
        code: "NOT_FOUND",
        message: "Este borrador ya no existe.",
      });
    });

    it("refuses input that does not parse, changing nothing", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");
      const festivalIds = Array.from({ length: 11 }, (_, index) => index + 1);

      expect(
        await save({ comunicadoId: id, expectedVersion: 1 }),
      ).toMatchObject({ success: false, code: "INVALID" });
      expect(
        await save(draftInput(id, 1, { saveKey: "otra-pestaña" })),
      ).toMatchObject({ success: false, code: "INVALID" });
      expect(
        await save(
          draftInput(id, 1, { audience: audience({ festivals: festivalIds }) }),
        ),
      ).toMatchObject({
        success: false,
        code: "INVALID",
        message: "Elegí hasta 10 listas.",
      });
      expect(await rowOf(id)).toMatchObject({
        version: 1,
        title: "Borrador guardado",
      });
    });
  });

  describe("CHECKs outside drafts", () => {
    it("refuse an unpaired button, an unsafe path or an essential without a reason once it is sent", async () => {
      const admin = await createUser({ role: "admin" });
      const sent = await insertSent(admin);
      const update = (set: string, params: unknown[] = []) =>
        pool!.query(`UPDATE comunicados SET ${set} WHERE id = $1`, [
          sent,
          ...params,
        ]);

      await expect(
        update("action_label = 'Ver', action_path = NULL"),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "comunicados_action_pair",
      });
      await expect(
        update("action_label = NULL, action_path = '/my_participations'"),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "comunicados_action_pair",
      });
      await expect(
        update("action_label = 'Ver', action_path = '//evil.example'"),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "comunicados_action_path_safe",
      });
      // Confirmed, so only the missing reason is wrong.
      const essential =
        "essential = true, essential_confirmed_at = now(), essential_confirmed_by_user_id = $2";
      await expect(
        update(`${essential}, essential_reason = NULL`, [admin]),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "comunicados_essential",
      });

      // The same row takes a whole button and a reasoned essential.
      await update(
        `${essential}, essential_reason = 'Cambia el horario de armado', action_label = 'Ver', action_path = '/my_participations'`,
        [admin],
      );
      expect(await rowOf(sent)).toMatchObject({
        essential: true,
        actionLabel: "Ver",
      });
    });

    it("refuse an unpaired button on a scheduled one too", async () => {
      const scheduled = await insertScheduled(
        await createUser({ role: "admin" }),
      );

      await expect(
        pool!.query(
          "UPDATE comunicados SET action_label = 'Ver', action_path = NULL WHERE id = $1",
          [scheduled],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "comunicados_action_pair",
      });
    });
  });

  describe("discard", () => {
    it("deletes a draft and refreshes the list", async () => {
      const id = await insertDraft(await createUser({ role: "admin" }));
      await signInAs("admin");

      expect(await actions.discardComunicadoDraftAction(id)).toEqual({
        success: true,
        message: "Descartamos el borrador.",
      });
      expect(await rowOf(id)).toBeNull();
      expect(revalidatePath).toHaveBeenCalledWith(LIST_PATH);

      expect(await actions.discardComunicadoDraftAction(id)).toEqual({
        success: false,
        message: "Este borrador ya no existe.",
      });
    });

    it("never deletes a scheduled or sent comunicado", async () => {
      const author = await createUser({ role: "admin" });
      const scheduled = await insertScheduled(author);
      const sent = await insertSent(author);
      await signInAs("admin");

      for (const id of [scheduled, sent]) {
        expect(await actions.discardComunicadoDraftAction(id)).toEqual({
          success: false,
          message: NOT_DRAFT,
        });
        expect(await rowOf(id)).not.toBeNull();
      }
      expect(revalidatePath).not.toHaveBeenCalled();

      // Past the action, its revisions still hold a sent one.
      await expect(
        pool!.query("DELETE FROM comunicados WHERE id = $1", [sent]),
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "comunicado_revisions_comunicado_id_comunicados_id_fk",
      });
    });

    it("refuses an id that does not parse", async () => {
      await signInAs("admin");

      expect(await actions.discardComunicadoDraftAction("12")).toMatchObject({
        success: false,
      });
    });
  });

  describe("audience preview", () => {
    /**
     * One festival and two people picked by name, one row of B5 each:
     * `owner` receives it from the festival, `picked` from both sources,
     * `adminPicked` by name; `banned`, `pending` and `festivalAdmin` are
     * skipped.
     */
    async function b5Fixture() {
      const people = {
        owner: await createUser({ name: "Ana Recibe" }),
        banned: await createUser({ status: "banned", name: "Beto Suspendido" }),
        pending: await createUser({
          status: "pending",
          name: "Caro Pendiente",
        }),
        festivalAdmin: await createUser({
          role: "festival_admin",
          name: "Dani Festival",
        }),
        picked: await createUser({ name: "Eva Elegida" }),
        adminPicked: await createUser({ role: "admin", name: "Fede Admin" }),
      };
      const festivalId = await createFestival();
      await reserve(festivalId, {
        owner: people.owner,
        partners: [people.banned, people.pending, people.festivalAdmin],
      });
      await reserve(festivalId, { owner: people.picked });
      return {
        people,
        festivalId,
        audience: audience({
          festivals: [festivalId],
          people: [people.picked, people.adminPicked],
        }),
      };
    }

    it("counts a small audience by B5's rule and writes nothing", async () => {
      const fixture = await b5Fixture();
      const admin = await signInAs("admin");
      const watched = [...Object.values(fixture.people), admin.id];
      const before = await writtenFor(watched);

      const result = await actions.previewComunicadoAudienceAction({
        audience: fixture.audience,
        essential: false,
        sendEmail: true,
      });
      if (!result.success) throw new Error(result.message);

      expect(result.preview).toMatchObject({
        matched: 6,
        eligible: 3,
        overlap: 1,
        skipped: [
          { reason: "Cuenta suspendida", count: 1 },
          { reason: "No es participante", count: 1 },
          { reason: "Perfil no verificado", count: 1 },
        ],
        skippedTotal: 3,
        willReceive: 3,
        email: { sendTo: 3, unsubscribedAnnouncements: 0, suppressed: 0 },
        tooLarge: false,
        narrowed: false,
        stagingAdmins: 0,
      });
      expect(result.preview.sources).toEqual([
        expect.objectContaining({
          kind: "festival",
          id: fixture.festivalId,
          count: { eligible: 2, skipped: 3 },
          problem: null,
        }),
        expect.objectContaining({
          kind: "people",
          count: { eligible: 2, skipped: 0 },
        }),
      ]);
      // People picked by name rule out an essential send (B7).
      expect(result.preview.essentialAllowed.ok).toBe(false);

      expect(await writtenFor(watched)).toEqual(before);
      expect(before).toEqual({
        notifications: 0,
        deliveries: 0,
        recipients: 0,
        campaigns: 0,
        comunicados: 0,
      });
    });

    it("narrows the lists to the admins outside production, whatever the client says", async () => {
      const fixture = await b5Fixture();
      await signInAs("admin");

      state.vercelEnv = "preview";
      const narrowed = await actions.previewComunicadoAudienceAction({
        audience: fixture.audience,
        essential: false,
        sendEmail: true,
        narrow: false,
      });
      if (!narrowed.success) throw new Error(narrowed.message);
      expect(narrowed.preview).toMatchObject({ narrowed: true, eligible: 3 });
      // `owner` came only from the festival; `picked` came by name too.
      expect(narrowed.preview.skipped).toContainEqual({
        reason: STAGING,
        count: 1,
      });
      // The acting admin at least stands in for the lists.
      expect(narrowed.preview.stagingAdmins).toBeGreaterThanOrEqual(1);
      expect(narrowed.preview.willReceive).toBe(
        2 + narrowed.preview.stagingAdmins,
      );

      state.vercelEnv = "production";
      const real = await actions.previewComunicadoAudienceAction({
        audience: fixture.audience,
        essential: false,
        sendEmail: true,
        narrow: true,
      });
      if (!real.success) throw new Error(real.message);
      expect(real.preview).toMatchObject({ narrowed: false, willReceive: 3 });
    });

    it("lists who would not receive it, with their reasons", async () => {
      const fixture = await b5Fixture();
      await signInAs("admin");

      const result = await actions.previewSkippedPeopleAction({
        audience: fixture.audience,
      });
      if (!result.success) throw new Error(result.message);

      expect(
        result.people.map((person) => [person.userId, person.reason]),
      ).toEqual([
        [fixture.people.banned, "Cuenta suspendida"],
        [fixture.people.pending, "Perfil no verificado"],
        [fixture.people.festivalAdmin, "No es participante"],
      ]);
    });

    it("refuses an audience past the limits", async () => {
      await signInAs("admin");

      expect(
        await actions.previewComunicadoAudienceAction({
          audience: audience({
            festivals: Array.from({ length: 11 }, (_, index) => index + 1),
          }),
          essential: false,
          sendEmail: true,
        }),
      ).toEqual({ success: false, message: "Elegí hasta 10 listas." });
    });
  });

  describe("people search", () => {
    it("finds participants and admins by name, never festival admins", async () => {
      const token = randomUUID().slice(0, 8);
      const participant = await createUser({ name: `Gala ${token}` });
      const admin = await createUser({ role: "admin", name: `Hugo ${token}` });
      const festivalAdmin = await createUser({
        role: "festival_admin",
        name: `Inés ${token}`,
      });
      await signInAs("admin");

      const ids = (await actions.searchComunicadoPeopleAction(token)).map(
        (person) => person.id,
      );
      expect(ids).toEqual([participant, admin]);
      expect(ids).not.toContain(festivalAdmin);
      expect(await actions.searchComunicadoPeopleAction(42)).toEqual([]);
    });
  });

  describe("access", () => {
    const refused = [
      {
        who: "a festival admin",
        role: "festival_admin",
        flagOn: true,
        message: "No autorizado.",
      },
      {
        who: "a participant",
        role: "user",
        flagOn: true,
        message: "No autorizado.",
      },
      {
        who: "an admin without the flag",
        role: "admin",
        flagOn: false,
        message: "Esta funcionalidad no está disponible",
      },
      {
        who: "nobody signed in",
        role: null,
        flagOn: true,
        message: "No autorizado.",
      },
    ] as const;

    it.each(refused)(
      "every action refuses $who before touching anything",
      async ({ role, flagOn, message }) => {
        const token = randomUUID().slice(0, 8);
        const author = await createUser({ role: "admin", name: `Jo ${token}` });
        const id = await insertDraft(author);
        const viewer = role ? await signInAs(role) : null;
        if (!viewer) state.viewer = null;
        state.flagOn = flagOn;
        const before = await rowOf(id);
        const refusal = { success: false, message };

        const create = await actions.createComunicadoDraftAction();
        // Tracked if it slipped through, so a failure still cleans up.
        if (create.success) created.comunicados.push(create.comunicadoId);
        expect(create).toEqual(refusal);
        expect(await save(draftInput(id, 1, { title: "Intruso" }))).toEqual({
          ...refusal,
          code: "FORBIDDEN",
        });
        expect(await actions.discardComunicadoDraftAction(id)).toEqual(refusal);
        expect(
          await actions.previewComunicadoAudienceAction({
            audience: audience({ people: [author] }),
            essential: false,
            sendEmail: true,
          }),
        ).toEqual(refusal);
        expect(
          await actions.previewSkippedPeopleAction({
            audience: audience({ people: [author] }),
          }),
        ).toEqual(refusal);
        expect(await actions.searchComunicadoPeopleAction(token)).toEqual([]);

        expect(await rowOf(id)).toEqual(before);
        if (viewer) {
          expect((await writtenFor([viewer.id])).comunicados).toBe(0);
        }
        expect(revalidatePath).not.toHaveBeenCalled();

        // The same calls go through once a global admin has the flag.
        state.viewer = { id: author, role: "admin" };
        state.flagOn = true;
        expect(await actions.searchComunicadoPeopleAction(token)).toEqual([
          expect.objectContaining({ id: author }),
        ]);
        expect(await actions.discardComunicadoDraftAction(id)).toMatchObject({
          success: true,
        });
      },
    );
  });
});
