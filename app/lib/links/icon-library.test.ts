// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ICON_LIBRARY_SIZE,
  ICON_PAGE_SIZE,
  libraryIconSvg,
  listLibraryIcons,
  listLibraryIconsWithSvg,
} from "@/app/lib/links/icon-library";

/** The first page of a search, as the picker asks for it. */
const searchLibraryIcons = (query: string, limit?: number) =>
  listLibraryIcons(query, 0, limit).icons;

describe("the icon library", () => {
  it("holds both libraries", () => {
    expect(ICON_LIBRARY_SIZE).toBeGreaterThan(4000);
  });

  it("finds an icon of either library by name, the closest first", () => {
    const camera = searchLibraryIcons("camera");
    expect(camera[0]).toMatchObject({ ref: "lucide:camera", label: "Camera" });

    const spotify = searchLibraryIcons("Spotify");
    expect(spotify.map((icon) => icon.ref)).toContain("si:spotify");
    expect(spotify.find((icon) => icon.ref === "si:spotify")?.label).toBe(
      "Spotify",
    );
  });

  it("ignores case, accents, spaces and dashes", () => {
    expect(searchLibraryIcons("  Tik Tok ").map((icon) => icon.ref)).toContain(
      "si:tiktok",
    );
    expect(searchLibraryIcons("shopping-cart")[0].ref).toBe(
      "lucide:shopping-cart",
    );
    expect(searchLibraryIcons("cámera")[0].ref).toBe("lucide:camera");
  });

  describe("in Spanish", () => {
    const first = (query: string) => searchLibraryIcons(query)[0]?.ref;
    const refs = (query: string) =>
      searchLibraryIcons(query, 200).map((icon) => icon.ref);

    it.each([
      ["cámara", "lucide:camera"],
      ["corazón", "lucide:heart"],
      ["música", "lucide:music"],
      ["regalo", "lucide:gift"],
      ["estrella", "lucide:star"],
      ["calendario", "lucide:calendar"],
      ["carrito", "lucide:shopping-cart"],
      ["tienda", "lucide:store"],
      ["correo", "lucide:mail"],
    ])("finds %s", (query, ref) => {
      expect(first(query)).toBe(ref);
    });

    it("finds an icon by any of the words for it, with or without accents", () => {
      expect(refs("entrada")).toContain("lucide:ticket");
      expect(refs("boleto")).toContain("lucide:ticket");
      expect(refs("camara")).toContain("lucide:camera");
      expect(refs("CORAZON")).toContain("lucide:heart");
      expect(refs("pipocas")).toEqual(["lucide:popcorn"]);
    });

    it("finds an icon whose name is several words by each of them", () => {
      expect(refs("carrito de compras")).toEqual(["lucide:shopping-cart"]);
      expect(refs("calendario corazón")).toEqual(["lucide:calendar-heart"]);
      expect(refs("base de datos")).toContain("lucide:database");
    });

    it("still finds the same icons in English, and brands by their name", () => {
      expect(first("camera")).toBe("lucide:camera");
      expect(first("shopping cart")).toBe("lucide:shopping-cart");
      expect(refs("spotify")).toContain("si:spotify");
      // A brand has no Spanish name to be found by.
      expect(refs("corazón").every((ref) => ref.startsWith("lucide:"))).toBe(
        true,
      );
    });

    it("has Spanish only for words Lucide's names really use", async () => {
      const { ICON_TERMS_ES } = await import("@/app/lib/links/icon-terms-es");
      const words = new Set(
        listLibraryIcons("", 0, ICON_LIBRARY_SIZE)
          .icons.filter((icon) => icon.set === "lucide")
          .flatMap((icon) => icon.name.split("-")),
      );
      expect(
        Object.keys(ICON_TERMS_ES).filter((word) => !words.has(word)),
      ).toEqual([]);
    });
  });

  it("keeps a search to its page and says how many there are in all", () => {
    const page = listLibraryIcons("a", 0, 10);
    expect(page.icons).toHaveLength(10);
    expect(page.total).toBeGreaterThan(10);
    expect(listLibraryIcons("zzzzzzzzzz")).toEqual({ icons: [], total: 0 });
  });

  it("lists every icon a page at a time when nothing is typed", () => {
    const first = listLibraryIcons("");
    expect(first.total).toBe(ICON_LIBRARY_SIZE);
    expect(first.icons).toHaveLength(ICON_PAGE_SIZE);
    expect(first.icons[0].set).toBe("lucide");
    expect(listLibraryIcons("   ").total).toBe(ICON_LIBRARY_SIZE);

    const second = listLibraryIcons("", ICON_PAGE_SIZE);
    expect(second.icons).toHaveLength(ICON_PAGE_SIZE);
    expect(second.icons[0].ref).not.toBe(first.icons[0].ref);
    expect(
      second.icons.some((icon) =>
        first.icons.some((had) => had.ref === icon.ref),
      ),
    ).toBe(false);

    // The brands come after Lucide's, and the list ends.
    const last = listLibraryIcons("", ICON_LIBRARY_SIZE - 5);
    expect(last.icons).toHaveLength(5);
    expect(last.icons.every((icon) => icon.set === "si")).toBe(true);
    expect(listLibraryIcons("", ICON_LIBRARY_SIZE).icons).toEqual([]);
  });

  it("starts from the first icon for an offset that is not one", () => {
    const first = listLibraryIcons("").icons[0];
    for (const offset of [-5, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(listLibraryIcons("", offset).icons[0]).toEqual(first);
    }
  });

  it("hands the picker each icon of a page with its drawing", async () => {
    const page = await listLibraryIconsWithSvg("spotify");
    const spotify = page.icons.find((icon) => icon.ref === "si:spotify");
    expect(spotify?.svg).toBe(await libraryIconSvg("si:spotify"));

    const all = await listLibraryIconsWithSvg("");
    expect(all.icons).toHaveLength(ICON_PAGE_SIZE);
    expect(all.icons.every((icon) => icon.svg.startsWith("<svg "))).toBe(true);
  });

  it("draws a brand's mark filled and a Lucide icon stroked", async () => {
    const spotify = await libraryIconSvg("si:spotify");
    expect(spotify).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" fill="currentColor"><path d="[^"]+"\/><\/svg>$/,
    );

    const camera = await libraryIconSvg("lucide:camera");
    expect(camera).toContain('stroke="currentColor"');
    expect(camera).toContain("<circle");
    expect(camera).not.toContain("key=");
  });

  it("draws only shapes: no script, no handler, nothing from the name", async () => {
    for (const ref of ["si:spotify", "lucide:camera", "lucide:shopping-cart"]) {
      const svg = (await libraryIconSvg(ref)) ?? "";
      expect(svg).not.toMatch(/<script|on[a-z]+=|href=|<foreignObject/i);
    }
  });

  it.each([
    "lucide:no-such-icon",
    "si:no-such-brand",
    "lucide:constructor",
    "lucide:__proto__",
    "si:../../etc/passwd",
    "tabler:camera",
    "camera",
    "",
  ])("has no drawing for %j", async (ref) => {
    expect(await libraryIconSvg(ref)).toBeNull();
  });
});
