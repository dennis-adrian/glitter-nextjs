// @vitest-environment node

import { asc, eq } from "drizzle-orm";
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

import { disposableDatabaseProblem } from "@/app/lib/links/disposable-test-database";
import * as schema from "@/db/schema";
import { siteLinks, siteLinksSettings } from "@/db/schema";

/**
 * The `/dashboard/links` actions against a real database: who may call them,
 * what they store, one social icon per network, each kind ordered apart, and
 * the single settings row.
 *
 * `site_links` has no owner column to scope a test by, so the suite takes the
 * two tables over: it empties them before each test and puts back what was
 * there (the rows migration 0313 seeds) when it ends.
 */

const currentProfileMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
// What reaches UploadThing and other people's sites stays out of this suite;
// which addresses are ours is the real rule.
const importLinkImageMock = vi.hoisted(() => vi.fn());
const removeLinkImageMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/app/lib/uploadthing/storage", () => ({ deleteStoredFile: vi.fn() }));
vi.mock("@/app/server/uploadthing", () => ({ utapi: {} }));
vi.mock("@/app/lib/links/thumbnail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/links/thumbnail")>()),
  importLinkImage: importLinkImageMock,
  removeLinkImage: removeLinkImageMock,
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

// Before either connection exists: this suite empties two tables, so it runs
// only on a database approved as disposable, not on any whose name says test.
const databaseProblem = testDatabaseUrl
  ? disposableDatabaseProblem(
      testDatabaseUrl,
      process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS,
    )
  : null;
if (databaseProblem) throw new Error(databaseProblem);

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
/**
 * Whether both tables were read before anything was emptied. `afterAll` runs
 * even when `beforeAll` fails, and without this it would empty the tables
 * and put back a copy that was never taken.
 */
let backedUp = false;

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
    backedUp = true;

    actions = await import("@/app/lib/links/actions");
    queries = await import("@/app/lib/links/queries");
  }, 60_000);

  beforeEach(async () => {
    await integrationDb!.delete(siteLinks);
    await integrationDb!.delete(siteLinksSettings);
    currentProfileMock.mockReset();
    revalidatePathMock.mockReset();
    importLinkImageMock.mockReset();
    removeLinkImageMock.mockReset();
    signInAs("admin");
  });

  afterAll(async () => {
    try {
      if (integrationDb && backedUp) {
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
    } finally {
      // Closed whatever happened above, or the run hangs on open connections.
      await pool?.end();
      // The app's own pool exists only once the actions were imported.
      if (actions) {
        const appDb = await import("@/db");
        await appDb.pool.end();
      }
    }
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
          actions.fetchSiteLinkImage("https://example.com/"),
          actions.updateLinksHeader({ title: "Otro", description: "" }),
        ]);

        for (const result of results) expect(result).toEqual(denied);
        expect(importLinkImageMock).not.toHaveBeenCalled();
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

  describe("a link's thumbnail", () => {
    const IMAGE = "https://abc123.ufs.sh/f/miniatura-1";
    const OTHER_IMAGE = "https://abc123.ufs.sh/f/miniatura-2";
    const base = { label: "Quiz", href: "/quiz" };

    it("stores a library icon with its drawing, taken from the library", async () => {
      expect(
        await actions.createSiteLink({ ...base, icon: "si:spotify" }),
      ).toEqual({ success: true });
      expect(
        await actions.createSiteLink({ ...base, icon: "lucide:camera" }),
      ).toEqual({ success: true });

      const [spotify, camera] = await rowsOf("link");
      expect(spotify.icon).toBe("si:spotify");
      expect(spotify.iconSvg).toMatch(/^<svg [^>]*fill="currentColor"><path /);
      expect(camera.icon).toBe("lucide:camera");
      expect(camera.iconSvg).toContain('stroke="currentColor"');

      const visible = await queries.fetchVisibleSiteLinks();
      expect(visible.map((row) => row.iconSvg)).toEqual([
        spotify.iconSvg,
        camera.iconSvg,
      ]);
    });

    it("drops the drawing when the link goes back to a featured icon or to none", async () => {
      await actions.createSiteLink({ ...base, icon: "si:spotify" });
      const [link] = await rowsOf("link");

      await actions.updateSiteLink(link.id, { ...base, icon: "heart" });
      expect((await rowsOf("link"))[0]).toMatchObject({
        icon: "heart",
        iconSvg: null,
      });

      await actions.updateSiteLink(link.id, { ...base, icon: "none" });
      expect((await rowsOf("link"))[0]).toMatchObject({
        icon: "none",
        iconSvg: null,
        imageUrl: null,
      });
    });

    it.each([
      ["lucide:no-such-icon"],
      ["si:no-such-brand"],
      ["tabler:camera"],
      ["lucide:../../secreto"],
      ["<svg onload=alert(1)>"],
      [""],
    ])("refuses the icon %j", async (icon) => {
      const result = await actions.createSiteLink({ ...base, icon });
      expect(result).toEqual({
        success: false,
        message: "El ícono no es válido.",
      });
      expect(await rowsOf("link")).toEqual([]);
    });

    it("never stores a drawing the caller sends", async () => {
      await actions.createSiteLink({
        ...base,
        icon: "heart",
        iconSvg: "<svg><script>alert(1)</script></svg>",
      } as never);
      expect((await rowsOf("link"))[0].iconSvg).toBeNull();
    });

    it("stores an image of ours and shows it on the page", async () => {
      expect(
        await actions.createSiteLink({
          ...base,
          icon: "link",
          imageUrl: IMAGE,
        }),
      ).toEqual({ success: true });

      expect((await rowsOf("link"))[0].imageUrl).toBe(IMAGE);
      expect((await queries.fetchVisibleSiteLinks())[0].imageUrl).toBe(IMAGE);
    });

    it.each([
      ["https://evil.example.com/tracker.png"],
      ["http://abc123.ufs.sh/f/miniatura-1"],
      ["https://abc123.ufs.sh.evil.example.com/f/x"],
      ["javascript:alert(1)"],
      ["/img/local.png"],
    ])(
      "refuses the image %j, which is not a file of ours",
      async (imageUrl) => {
        const result = await actions.createSiteLink({
          ...base,
          icon: "link",
          imageUrl,
        });
        expect(result).toEqual({
          success: false,
          message: "La imagen no es válida.",
        });
        expect(await rowsOf("link")).toEqual([]);
      },
    );

    it("stores the featured design with its image, and classic by default", async () => {
      await actions.createSiteLink({ ...base, icon: "link" });
      expect(
        await actions.createSiteLink({
          ...base,
          icon: "link",
          imageUrl: IMAGE,
          layout: "featured",
        }),
      ).toEqual({ success: true });

      const rows = await rowsOf("link");
      expect(rows.map((row) => row.layout)).toEqual(["classic", "featured"]);
      expect((await queries.fetchVisibleSiteLinks())[1].layout).toBe(
        "featured",
      );

      // Back to classic, keeping its image as a thumbnail.
      await actions.updateSiteLink(rows[1].id, {
        ...base,
        icon: "link",
        imageUrl: IMAGE,
      });
      expect((await rowsOf("link"))[1]).toMatchObject({
        layout: "classic",
        imageUrl: IMAGE,
      });
    });

    it("stores the featured design for a link with only an icon", async () => {
      expect(
        await actions.createSiteLink({
          ...base,
          icon: "ticket",
          layout: "featured",
        }),
      ).toEqual({ success: true });
      expect((await rowsOf("link"))[0]).toMatchObject({
        layout: "featured",
        icon: "ticket",
        imageUrl: null,
      });
    });

    it("refuses a design it does not know", async () => {
      expect(
        await actions.createSiteLink({
          ...base,
          icon: "link",
          imageUrl: IMAGE,
          layout: "gigante" as never,
        }),
      ).toEqual({ success: false, message: "El diseño no es válido." });
      expect(await rowsOf("link")).toEqual([]);
    });

    it("deletes the stored image once no link shows it", async () => {
      await actions.createSiteLink({ ...base, icon: "link", imageUrl: IMAGE });
      const [link] = await rowsOf("link");

      // Saved again with the same image: it is still shown.
      await actions.updateSiteLink(link.id, {
        ...base,
        label: "Otro título",
        icon: "link",
        imageUrl: IMAGE,
      });
      expect(removeLinkImageMock).not.toHaveBeenCalled();

      await actions.updateSiteLink(link.id, {
        ...base,
        icon: "link",
        imageUrl: OTHER_IMAGE,
      });
      expect(removeLinkImageMock).toHaveBeenLastCalledWith(IMAGE);

      await actions.updateSiteLink(link.id, { ...base, icon: "link" });
      expect(removeLinkImageMock).toHaveBeenLastCalledWith(OTHER_IMAGE);
      expect((await rowsOf("link"))[0].imageUrl).toBeNull();
    });

    it("deletes the stored image with its link", async () => {
      await actions.createSiteLink({ ...base, icon: "link", imageUrl: IMAGE });
      const [link] = await rowsOf("link");

      await actions.deleteSiteLink(link.id);
      expect(removeLinkImageMock).toHaveBeenCalledWith(IMAGE);
    });

    it("keeps a refused update from deleting the image the link has", async () => {
      await actions.createSiteLink({ ...base, icon: "link", imageUrl: IMAGE });
      const [link] = await rowsOf("link");

      await actions.updateSiteLink(link.id, {
        ...base,
        href: "javascript:alert(1)",
        icon: "link",
      });
      expect(removeLinkImageMock).not.toHaveBeenCalled();
      expect((await rowsOf("link"))[0].imageUrl).toBe(IMAGE);
    });

    it("finds a web link's own image, and saves nothing by itself", async () => {
      importLinkImageMock.mockResolvedValue(IMAGE);

      expect(
        await actions.fetchSiteLinkImage("quiz.productoraglitter.com/glitter"),
      ).toEqual({ success: true, imageUrl: IMAGE });
      expect(importLinkImageMock).toHaveBeenCalledWith(
        "https://quiz.productoraglitter.com/glitter",
      );
      expect(await rowsOf("link")).toEqual([]);
    });

    it("says so when the link has no image, or reading it fails", async () => {
      const none = {
        success: false,
        message: "No encontramos una imagen en ese enlace. Puedes subir una.",
      };
      importLinkImageMock.mockResolvedValue(null);
      expect(await actions.fetchSiteLinkImage("https://example.com/")).toEqual(
        none,
      );

      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      importLinkImageMock.mockRejectedValue(new Error("UploadThing is down"));
      expect(await actions.fetchSiteLinkImage("https://example.com/")).toEqual(
        none,
      );
      logged.mockRestore();
    });

    describe("for a page of this site", () => {
      const saved = {
        base: process.env.NEXT_PUBLIC_BASE_URL,
        production: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      };
      const restore = (name: string, value: string | undefined) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      };
      afterEach(() => {
        restore("NEXT_PUBLIC_BASE_URL", saved.base);
        restore("VERCEL_PROJECT_PRODUCTION_URL", saved.production);
      });

      it("reads it at the site's own address, whatever host the request names", async () => {
        process.env.NEXT_PUBLIC_BASE_URL = "https://www.glitter.com.bo/";
        delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
        importLinkImageMock.mockResolvedValue(IMAGE);

        expect(
          await actions.fetchSiteLinkImage("/blog/festicker-2026"),
        ).toEqual({ success: true, imageUrl: IMAGE });
        expect(importLinkImageMock.mock.calls).toEqual([
          ["https://www.glitter.com.bo/blog/festicker-2026"],
        ]);
      });

      it("reads it on the production site when this deployment's own cannot be read", async () => {
        // A preview deployment: its own address is behind Vercel's login.
        process.env.NEXT_PUBLIC_BASE_URL =
          "https://glitter-git-feature.vercel.app";
        process.env.VERCEL_PROJECT_PRODUCTION_URL = "www.glitter.com.bo";
        importLinkImageMock
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(IMAGE);

        expect(await actions.fetchSiteLinkImage("/store")).toEqual({
          success: true,
          imageUrl: IMAGE,
        });
        expect(importLinkImageMock.mock.calls).toEqual([
          ["https://glitter-git-feature.vercel.app/store"],
          ["https://www.glitter.com.bo/store"],
        ]);
      });

      it("asks once when both addresses are the same, and says so when neither has an image", async () => {
        process.env.NEXT_PUBLIC_BASE_URL = "https://www.glitter.com.bo";
        process.env.VERCEL_PROJECT_PRODUCTION_URL = "www.glitter.com.bo";
        importLinkImageMock.mockResolvedValue(null);

        expect((await actions.fetchSiteLinkImage("/store")).success).toBe(
          false,
        );
        expect(importLinkImageMock).toHaveBeenCalledTimes(1);
      });

      it("does not go to the production site for an address that is not ours", async () => {
        process.env.VERCEL_PROJECT_PRODUCTION_URL = "www.glitter.com.bo";
        importLinkImageMock.mockResolvedValue(null);

        await actions.fetchSiteLinkImage("https://example.com/pagina");
        expect(importLinkImageMock.mock.calls).toEqual([
          ["https://example.com/pagina"],
        ]);
      });
    });

    it.each([
      ["info@productoraglitter.com"],
      ["javascript:alert(1)"],
      ["//evil.example.com/pagina"],
      [""],
    ])("does not go looking for the image of %j", async (href) => {
      const result = await actions.fetchSiteLinkImage(href);
      expect(result.success).toBe(false);
      expect(importLinkImageMock).not.toHaveBeenCalled();
    });
  });

  describe("a link's schedule", () => {
    const base = { label: "Pre-registro", href: "/festivals", icon: "ticket" };
    /** A `datetime-local` value in Bolivia, `minutes` from now. */
    const fromNow = (minutes: number) =>
      new Date(Date.now() + minutes * 60_000 - 4 * 3_600_000)
        .toISOString()
        .slice(0, 16);

    it("stores the dates as the instants they name in Bolivia", async () => {
      await actions.createSiteLink({
        ...base,
        visibleFrom: "2026-11-20T09:00",
        visibleUntil: "2026-11-30T23:59",
      });
      const [link] = await rowsOf("link");
      expect(link.visibleFrom?.toISOString()).toBe("2026-11-20T13:00:00.000Z");
      expect(link.visibleUntil?.toISOString()).toBe("2026-12-01T03:59:00.000Z");

      // Saved again without them: always shown.
      await actions.updateSiteLink(link.id, base);
      expect((await rowsOf("link"))[0]).toMatchObject({
        visibleFrom: null,
        visibleUntil: null,
      });
    });

    it("shows a link on the page only while its schedule runs", async () => {
      await actions.createSiteLink({ ...base, label: "Siempre" });
      await actions.createSiteLink({
        ...base,
        label: "En curso",
        visibleFrom: fromNow(-60),
        visibleUntil: fromNow(60),
      });
      await actions.createSiteLink({
        ...base,
        label: "Por venir",
        visibleFrom: fromNow(60),
      });
      await actions.createSiteLink({
        ...base,
        label: "Terminado",
        visibleUntil: fromNow(-60),
      });

      const visible = await queries.fetchVisibleSiteLinks();
      expect(visible.map((row) => row.label)).toEqual(["Siempre", "En curso"]);
      // The dashboard still has all four.
      expect(await rowsOf("link")).toHaveLength(4);
    });

    it("keeps a hidden link hidden whatever its schedule says", async () => {
      await actions.createSiteLink({
        ...base,
        visibleFrom: fromNow(-60),
        visibleUntil: fromNow(60),
      });
      const [link] = await rowsOf("link");
      await actions.setSiteLinkVisible(link.id, false);
      expect(await queries.fetchVisibleSiteLinks()).toEqual([]);
    });

    it("does not count a tap on a link outside its schedule", async () => {
      await actions.createSiteLink({ ...base, visibleFrom: fromNow(60) });
      await actions.createSiteLink({ ...base, visibleUntil: fromNow(60) });
      const [upcoming, running] = await rowsOf("link");

      await queries.recordSiteLinkClick(upcoming.id);
      await queries.recordSiteLinkClick(running.id);
      expect((await rowsOf("link")).map((row) => row.clickCount)).toEqual([
        0, 1,
      ]);
    });

    it.each([
      ["an end before the start", "2026-11-20T09:00", "2026-11-19T09:00"],
      ["an end at the start", "2026-11-20T09:00", "2026-11-20T09:00"],
      ["a date that is not one", "mañana", ""],
      ["a date with a zone of its own", "", "2026-11-20T09:00:00Z"],
    ])("refuses %s", async (_what, visibleFrom, visibleUntil) => {
      const result = await actions.createSiteLink({
        ...base,
        visibleFrom,
        visibleUntil,
      });
      expect(result.success).toBe(false);
      expect(await rowsOf("link")).toEqual([]);
    });
  });

  describe("the page's header", () => {
    const AVATAR = "https://abc123.ufs.sh/f/foto-1";
    const settings = () => integrationDb!.select().from(siteLinksSettings);

    it("is the stock header until someone changes it", async () => {
      expect((await queries.fetchLinksSettings()).header).toEqual({
        title: "Productora Glitter",
        description:
          "Productora de festivales para ilustradores, artistas y emprendimientos creativos",
        avatarUrl: null,
      });
    });

    it("saves the name, the line and the picture, and keeps the position", async () => {
      await actions.setSocialPosition("bottom");
      expect(
        await actions.updateLinksHeader({
          title: "  Glitter Bolivia  ",
          description: " Festivales y más ",
          avatarUrl: AVATAR,
        }),
      ).toEqual({ success: true });

      expect(await queries.fetchLinksSettings()).toMatchObject({
        socialPosition: "bottom",
        header: {
          title: "Glitter Bolivia",
          description: "Festivales y más",
          avatarUrl: AVATAR,
        },
      });
      expect(await settings()).toHaveLength(1);
      expect(revalidatePathMock).toHaveBeenCalledWith("/links", "page");

      // And the position, saved after, keeps the header.
      await actions.setSocialPosition("top");
      expect((await queries.fetchLinksSettings()).header.title).toBe(
        "Glitter Bolivia",
      );
    });

    it("stores nothing for what matches the stock header, and an empty line as one", async () => {
      await actions.updateLinksHeader({
        title: "Productora Glitter",
        description: "",
      });
      expect((await settings())[0]).toMatchObject({
        title: null,
        description: "",
        avatarUrl: null,
      });
      expect((await queries.fetchLinksSettings()).header.description).toBe("");

      await actions.updateLinksHeader({
        title: "Productora Glitter",
        description:
          "Productora de festivales para ilustradores, artistas y emprendimientos creativos",
      });
      expect((await settings())[0]).toMatchObject({
        title: null,
        description: null,
      });
    });

    it("deletes the picture it had once it shows another, or the logo", async () => {
      await actions.updateLinksHeader({
        title: "Glitter",
        description: "",
        avatarUrl: AVATAR,
      });
      await actions.updateLinksHeader({
        title: "Glitter Bolivia",
        description: "",
        avatarUrl: AVATAR,
      });
      expect(removeLinkImageMock).not.toHaveBeenCalled();

      await actions.updateLinksHeader({ title: "Glitter", description: "" });
      expect(removeLinkImageMock).toHaveBeenCalledWith(AVATAR);
      expect((await queries.fetchLinksSettings()).header.avatarUrl).toBeNull();
    });

    it.each([
      ["no name", { title: "   ", description: "" }],
      ["a name that is too long", { title: "x".repeat(61), description: "" }],
      [
        "a line that is too long",
        { title: "Glitter", description: "x".repeat(161) },
      ],
      [
        "a picture that is not a file of ours",
        {
          title: "Glitter",
          description: "",
          avatarUrl: "https://evil.example.com/tracker.png",
        },
      ],
    ])("refuses %s", async (_what, input) => {
      expect((await actions.updateLinksHeader(input)).success).toBe(false);
      expect(await settings()).toEqual([]);
      expect(removeLinkImageMock).not.toHaveBeenCalled();
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
