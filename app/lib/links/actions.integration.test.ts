// @vitest-environment node

import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import { siteLinks, siteLinksSettings } from "@/db/schema";

/**
 * The `/dashboard/links` actions against a real database: who may call them,
 * what they store, one social icon per network, each kind ordered apart, and
 * the single settings row.
 *
 * `site_links` has no owner column to scope a test by, so the suite takes the
 * two tables over: it empties them before each test and puts back what was
 * there (the rows migration 0312 seeds) when it ends.
 */

const currentProfileMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 2 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/links/actions");
type Queries = typeof import("@/app/lib/links/queries");
let actions: Actions;
let queries: Queries;

let savedLinks: (typeof siteLinks.$inferSelect)[] = [];
let savedSettings: (typeof siteLinksSettings.$inferSelect)[] = [];

function signInAs(role: string | null) {
  currentProfileMock.mockResolvedValue(role ? { id: 1, role } : null);
}

/** Every row of `kind`, in the order the dashboard and the page show them. */
function rowsOf(kind: "link" | "social") {
  return integrationDb!
    .select()
    .from(siteLinks)
    .where(eq(siteLinks.kind, kind))
    .orderBy(asc(siteLinks.sortOrder), asc(siteLinks.id));
}

async function addLink(label: string, href = "/store") {
  const result = await actions.createSiteLink({ label, href, icon: "link" });
  expect(result).toEqual({ success: true });
  const rows = await rowsOf("link");
  return rows[rows.length - 1];
}

describeDatabase("site links dashboard actions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    const result = await pool!.query(
      "select 1 from information_schema.tables where table_name = 'site_links_settings'",
    );
    if (result.rowCount === 0) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    savedLinks = await integrationDb!.select().from(siteLinks);
    savedSettings = await integrationDb!.select().from(siteLinksSettings);

    actions = await import("@/app/lib/links/actions");
    queries = await import("@/app/lib/links/queries");
  }, 60_000);

  beforeEach(async () => {
    await integrationDb!.delete(siteLinks);
    await integrationDb!.delete(siteLinksSettings);
    currentProfileMock.mockReset();
    revalidatePathMock.mockReset();
    signInAs("admin");
  });

  afterAll(async () => {
    if (integrationDb) {
      await integrationDb.delete(siteLinks);
      await integrationDb.delete(siteLinksSettings);
      if (savedLinks.length > 0) {
        await integrationDb.insert(siteLinks).values(savedLinks);
      }
      if (savedSettings.length > 0) {
        await integrationDb.insert(siteLinksSettings).values(savedSettings);
      }
      // Rows went back with their ids; later inserts must not reuse them.
      await pool!.query(
        `select setval(pg_get_serial_sequence('site_links', 'id'),
           greatest((select coalesce(max(id), 0) from site_links),
                    (select last_value from site_links_id_seq)))`,
      );
    }
    await pool?.end();
    const appDb = await import("@/db");
    await appDb.pool.end();
  });

  describe("permissions", () => {
    it.each([["user"], ["artist"], [null]])(
      "refuses every action for role %s and writes nothing",
      async (role) => {
        const link = await addLink("Tiendita");
        signInAs("admin");
        await actions.createSocialLink({
          network: "instagram",
          value: "@glitter.bo",
        });
        const [social] = await rowsOf("social");
        revalidatePathMock.mockReset();

        signInAs(role);
        const denied = { success: false, message: "No tienes permisos." };
        const results = await Promise.all([
          actions.createSiteLink({ label: "X", href: "/x", icon: "link" }),
          actions.updateSiteLink(link.id, {
            label: "X",
            href: "/x",
            icon: "link",
          }),
          actions.createSocialLink({ network: "tiktok", value: "@x" }),
          actions.updateSocialLink(social.id, "@otro"),
          actions.setSiteLinkVisible(link.id, false),
          actions.deleteSiteLink(link.id),
          actions.reorderSiteLinks("link", [link.id]),
          actions.setSocialPosition("bottom"),
        ]);

        for (const result of results) expect(result).toEqual(denied);
        expect(await rowsOf("link")).toEqual([link]);
        expect(await rowsOf("social")).toEqual([social]);
        expect(await integrationDb!.select().from(siteLinksSettings)).toEqual(
          [],
        );
        expect(revalidatePathMock).not.toHaveBeenCalled();
      },
    );

    it("lets a festival admin manage the links", async () => {
      signInAs("festival_admin");
      await addLink("Tiendita");
      expect(await actions.setSocialPosition("bottom")).toEqual({
        success: true,
      });
    });
  });

  describe("links", () => {
    it("stores a new link last, visible, with its address normalised", async () => {
      await addLink("Tiendita", "/store");
      const result = await actions.createSiteLink({
        label: "  Quiz  ",
        href: "quiz.productoraglitter.com/glitter",
        icon: "sparkles",
      });

      expect(result).toEqual({ success: true });
      const rows = await rowsOf("link");
      expect(rows.map((row) => [row.label, row.href, row.sortOrder])).toEqual([
        ["Tiendita", "/store", 0],
        ["Quiz", "https://quiz.productoraglitter.com/glitter", 1],
      ]);
      expect(rows[1]).toMatchObject({
        kind: "link",
        icon: "sparkles",
        isVisible: true,
        clickCount: 0,
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/links", "page");
      expect(revalidatePathMock).toHaveBeenCalledWith(
        "/dashboard/links",
        "page",
      );
    });

    it("turns a bare email into a mailto", async () => {
      const row = await addLink("Correo", "info@productoraglitter.com");
      expect(row.href).toBe("mailto:info@productoraglitter.com");
    });

    it.each([
      ["javascript:alert(1)"],
      ["data:text/html,<b>x</b>"],
      ["//evil.example"],
      ["https://localhost"],
      ["con espacios.com"],
      [""],
    ])("refuses the address %j on create and on update", async (href) => {
      const created = await actions.createSiteLink({
        label: "Malo",
        href,
        icon: "link",
      });
      expect(created.success).toBe(false);
      expect(await rowsOf("link")).toEqual([]);

      const link = await addLink("Tiendita");
      const updated = await actions.updateSiteLink(link.id, {
        label: "Malo",
        href,
        icon: "link",
      });
      expect(updated.success).toBe(false);
      expect(await rowsOf("link")).toEqual([link]);
    });

    it("refuses an empty title, a long one and an unknown icon", async () => {
      const base = { label: "Ok", href: "/store", icon: "link" as const };
      for (const data of [
        { ...base, label: "   " },
        { ...base, label: "x".repeat(81) },
        { ...base, icon: "nope" as never },
      ]) {
        expect((await actions.createSiteLink(data)).success).toBe(false);
      }
      expect(await rowsOf("link")).toEqual([]);
    });

    it("updates a link and leaves its place and clicks alone", async () => {
      await addLink("Primero");
      const link = await addLink("Segundo");
      await queries.recordSiteLinkClick(link.id);

      const result = await actions.updateSiteLink(link.id, {
        label: "Sitio web",
        href: "/",
        icon: "website",
      });

      expect(result).toEqual({ success: true });
      const [, updated] = await rowsOf("link");
      expect(updated).toMatchObject({
        id: link.id,
        label: "Sitio web",
        href: "/",
        icon: "website",
        sortOrder: 1,
        clickCount: 1,
      });
    });

    it("does not edit a social icon as a link, nor a link that is gone", async () => {
      await actions.createSocialLink({ network: "tiktok", value: "@glitter" });
      const [social] = await rowsOf("social");
      const data = { label: "X", href: "/x", icon: "link" as const };

      expect(await actions.updateSiteLink(social.id, data)).toEqual({
        success: false,
        message: "Enlace no encontrado.",
      });
      expect(await actions.updateSiteLink(social.id + 1000, data)).toEqual({
        success: false,
        message: "Enlace no encontrado.",
      });
      expect(await rowsOf("social")).toEqual([social]);
    });

    it("hides a link from the public page, and stops counting its clicks", async () => {
      const shown = await addLink("Visible");
      const hidden = await addLink("Oculto");

      expect(await actions.setSiteLinkVisible(hidden.id, false)).toEqual({
        success: true,
      });
      await queries.recordSiteLinkClick(hidden.id);
      await queries.recordSiteLinkClick(shown.id);

      const visible = await queries.fetchVisibleSiteLinks();
      expect(visible.map((row) => row.id)).toEqual([shown.id]);
      const rows = await rowsOf("link");
      expect(rows.map((row) => [row.isVisible, row.clickCount])).toEqual([
        [true, 1],
        [false, 0],
      ]);

      await actions.setSiteLinkVisible(hidden.id, true);
      expect((await queries.fetchVisibleSiteLinks()).length).toBe(2);
    });

    it("deletes a link, and reports one that is already gone", async () => {
      const link = await addLink("Tiendita");

      expect(await actions.deleteSiteLink(link.id)).toEqual({ success: true });
      expect(await rowsOf("link")).toEqual([]);
      expect(await actions.deleteSiteLink(link.id)).toEqual({
        success: false,
        message: "Enlace no encontrado.",
      });
      expect(await actions.setSiteLinkVisible(link.id, false)).toEqual({
        success: false,
        message: "Enlace no encontrado.",
      });
    });
  });

  describe("social icons", () => {
    it("builds each network's address from what the dashboard asks for", async () => {
      const inputs = [
        ["instagram", "@glitter.bo", "https://www.instagram.com/glitter.bo"],
        ["tiktok", "glitter.bo", "https://www.tiktok.com/@glitter.bo"],
        [
          "facebook",
          "http://facebook.com/glitterfestival",
          "https://facebook.com/glitterfestival",
        ],
        ["whatsapp", "+591 700-00000", "https://wa.me/59170000000"],
        [
          "email",
          "info@productoraglitter.com",
          "mailto:info@productoraglitter.com",
        ],
      ] as const;

      for (const [network, value] of inputs) {
        expect(await actions.createSocialLink({ network, value })).toEqual({
          success: true,
        });
      }

      const rows = await rowsOf("social");
      expect(
        rows.map((row) => [row.icon, row.href, row.label, row.sortOrder]),
      ).toEqual([
        ["instagram", inputs[0][2], "Instagram", 0],
        ["tiktok", inputs[1][2], "TikTok", 1],
        ["facebook", inputs[2][2], "Facebook", 2],
        ["whatsapp", inputs[3][2], "WhatsApp", 3],
        ["email", inputs[4][2], "Correo", 4],
      ]);
    });

    it("keeps one icon per network, a hidden one included", async () => {
      await actions.createSocialLink({ network: "instagram", value: "@uno" });
      const [first] = await rowsOf("social");
      await actions.setSiteLinkVisible(first.id, false);

      const again = await actions.createSocialLink({
        network: "instagram",
        value: "@dos",
      });

      expect(again).toEqual({
        success: false,
        message:
          "Ya hay un ícono de Instagram. Edítalo en lugar de agregar otro.",
      });
      expect((await rowsOf("social")).map((row) => row.href)).toEqual([
        "https://www.instagram.com/uno",
      ]);
    });

    it("keeps one icon per network when two are added at once", async () => {
      const results = await Promise.all([
        actions.createSocialLink({ network: "youtube", value: "@uno" }),
        actions.createSocialLink({ network: "youtube", value: "@dos" }),
      ]);

      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(await rowsOf("social")).toHaveLength(1);
    });

    it("does not take a link card with a network's icon for that network's social icon", async () => {
      await actions.createSiteLink({
        label: "TikTok",
        href: "https://www.tiktok.com/@glitter.bo",
        icon: "tiktok",
      });

      expect(
        await actions.createSocialLink({
          network: "tiktok",
          value: "@glitter",
        }),
      ).toEqual({ success: true });
      expect(await rowsOf("social")).toHaveLength(1);
      expect(await rowsOf("link")).toHaveLength(1);
    });

    it("orders links and social icons apart", async () => {
      await addLink("Uno");
      await addLink("Dos");
      await actions.createSocialLink({ network: "tiktok", value: "@glitter" });
      await addLink("Tres");

      expect((await rowsOf("social")).map((row) => row.sortOrder)).toEqual([0]);
      expect((await rowsOf("link")).map((row) => row.sortOrder)).toEqual([
        0, 1, 2,
      ]);
    });

    it.each([
      ["instagram", "https://tiktok.com/@glitter.bo"],
      ["instagram", "con espacio"],
      ["facebook", "javascript:alert(1)"],
      ["whatsapp", "12345"],
      ["email", "no-es-correo"],
      ["tiktok", "   "],
      ["linkedin", "glitter"],
    ])("refuses %s with the value %j", async (network, value) => {
      const result = await actions.createSocialLink({
        network: network as never,
        value,
      });
      expect(result.success).toBe(false);
      expect(await rowsOf("social")).toEqual([]);
    });

    it("changes where an icon points and keeps its network", async () => {
      await actions.createSocialLink({ network: "tiktok", value: "@viejo" });
      const [social] = await rowsOf("social");

      expect(await actions.updateSocialLink(social.id, "@glitter.bo")).toEqual({
        success: true,
      });
      expect(
        (await actions.updateSocialLink(social.id, "https://instagram.com/x"))
          .success,
      ).toBe(false);

      const [updated] = await rowsOf("social");
      expect(updated).toMatchObject({
        id: social.id,
        icon: "tiktok",
        label: "TikTok",
        href: "https://www.tiktok.com/@glitter.bo",
      });
    });

    it("does not edit a link card as a social icon", async () => {
      const link = await addLink("TikTok", "https://www.tiktok.com/@glitter");

      expect(await actions.updateSocialLink(link.id, "@otro")).toEqual({
        success: false,
        message: "Ícono no encontrado.",
      });
      expect(await rowsOf("link")).toEqual([link]);
    });
  });

  describe("reordering", () => {
    it("reorders one kind and leaves the other as it was", async () => {
      const a = await addLink("A");
      const b = await addLink("B");
      const c = await addLink("C");
      await actions.createSocialLink({ network: "instagram", value: "@g" });
      await actions.createSocialLink({ network: "tiktok", value: "@g" });
      const [instagram, tiktok] = await rowsOf("social");

      expect(
        await actions.reorderSiteLinks("link", [c.id, a.id, b.id]),
      ).toEqual({ success: true });
      expect((await rowsOf("link")).map((row) => row.label)).toEqual([
        "C",
        "A",
        "B",
      ]);
      expect((await rowsOf("social")).map((row) => row.id)).toEqual([
        instagram.id,
        tiktok.id,
      ]);

      expect(
        await actions.reorderSiteLinks("social", [tiktok.id, instagram.id]),
      ).toEqual({ success: true });
      expect((await rowsOf("social")).map((row) => row.icon)).toEqual([
        "tiktok",
        "instagram",
      ]);
      expect((await rowsOf("link")).map((row) => row.label)).toEqual([
        "C",
        "A",
        "B",
      ]);

      const visible = await queries.fetchVisibleSiteLinks();
      expect(
        visible.filter((row) => row.kind === "link").map((row) => row.label),
      ).toEqual(["C", "A", "B"]);
      expect(
        visible.filter((row) => row.kind === "social").map((row) => row.icon),
      ).toEqual(["tiktok", "instagram"]);
    });

    it("refuses a list that is not every row of the kind exactly once", async () => {
      const a = await addLink("A");
      const b = await addLink("B");
      await actions.createSocialLink({ network: "instagram", value: "@g" });
      const [social] = await rowsOf("social");
      const stale = {
        success: false,
        message: "La lista cambió. Recarga la página e inténtalo de nuevo.",
      };

      for (const ids of [
        [b.id],
        [b.id, b.id],
        [b.id, a.id, social.id],
        [b.id, social.id],
        [b.id, a.id + 1000],
        [],
      ]) {
        expect(await actions.reorderSiteLinks("link", ids)).toEqual(stale);
      }
      expect(await actions.reorderSiteLinks("social", [b.id, a.id])).toEqual(
        stale,
      );
      expect(
        (await actions.reorderSiteLinks("otro" as never, [a.id, b.id])).success,
      ).toBe(false);

      expect((await rowsOf("link")).map((row) => row.id)).toEqual([a.id, b.id]);
    });
  });

  describe("social position", () => {
    it("is the top until someone moves it", async () => {
      expect(await queries.fetchSocialPosition()).toBe("top");
    });

    it("writes the one settings row, then updates it", async () => {
      expect(await actions.setSocialPosition("bottom")).toEqual({
        success: true,
      });
      expect(await queries.fetchSocialPosition()).toBe("bottom");

      expect(await actions.setSocialPosition("top")).toEqual({ success: true });
      expect(await actions.setSocialPosition("bottom")).toEqual({
        success: true,
      });

      const rows = await integrationDb!.select().from(siteLinksSettings);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 1, socialPosition: "bottom" });
    });

    it("refuses a position that is neither", async () => {
      expect(await actions.setSocialPosition("left" as never)).toEqual({
        success: false,
        message: "La posición no es válida.",
      });
      expect(await integrationDb!.select().from(siteLinksSettings)).toEqual([]);
    });
  });
});
