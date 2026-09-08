import { describe, expect, it } from "vitest";

import { PLACEHOLDER_SLUG_RE } from "@/app/lib/posts/definitions";
import {
  postAutosaveSchema,
  postCategoryFormSchema,
  postFormSchema,
  reviewNotesSchema,
  shareLinkSchema,
} from "@/app/lib/posts/validate";

const VALID = {
  title: "Cómo armar tu stand",
  slug: "como-armar-tu-stand",
  excerpt: "Una guía corta.",
  coverImageUrl: "https://cdn.example.com/a.png",
  seoTitle: "Armar tu stand",
  seoDescription: "Guía para participantes.",
  categoryIds: [1, 2],
  tagInputs: ["stands", "tips"],
  content: [{ type: "paragraph", content: [] }],
};

describe("postFormSchema", () => {
  it("accepts a complete post", () => {
    expect(postFormSchema.safeParse(VALID).success).toBe(true);
  });

  it("does not accept contentHtml — the server derives it from the blocks", () => {
    const parsed = postFormSchema.parse({
      ...VALID,
      contentHtml: "<p>enviado por el cliente</p>",
    });

    expect(parsed).not.toHaveProperty("contentHtml");
  });

  it("requires a title of at least 3 characters", () => {
    expect(postFormSchema.safeParse({ ...VALID, title: "ab" }).success).toBe(
      false,
    );
    expect(postFormSchema.safeParse({ ...VALID, title: "  a " }).success).toBe(
      false,
    );
  });

  it("requires a non-empty block document", () => {
    expect(postFormSchema.safeParse({ ...VALID, content: [] }).success).toBe(
      false,
    );
    expect(
      postFormSchema.safeParse({ ...VALID, content: "<p>x</p>" }).success,
    ).toBe(false);
  });

  it("accepts an empty slug and rejects a malformed one", () => {
    expect(postFormSchema.safeParse({ ...VALID, slug: "" }).success).toBe(true);

    for (const slug of ["Con Mayúsculas", "con espacios", "acentué", "a--b"]) {
      expect(postFormSchema.safeParse({ ...VALID, slug }).success).toBe(false);
    }
  });

  /**
   * The client sends a slugified title whenever the slug field is left blank,
   * so the validator has to accept everything `slugifyName` can produce — the
   * old ASCII-only regex rejected its own generator's output for any title
   * with no ASCII letters.
   */
  it("accepts a generated slug in a non-Latin script", () => {
    expect(
      postFormSchema.safeParse({ ...VALID, slug: "καλημερα" }).success,
    ).toBe(true);
    expect(postFormSchema.safeParse({ ...VALID, slug: "日本語" }).success).toBe(
      true,
    );
  });

  it("rejects a cover image that is not a URL", () => {
    expect(
      postFormSchema.safeParse({ ...VALID, coverImageUrl: "no-soy-url" })
        .success,
    ).toBe(false);
    expect(
      postFormSchema.safeParse({ ...VALID, coverImageUrl: "" }).success,
    ).toBe(true);
  });

  it("caps the excerpt, seo fields, and tag count", () => {
    expect(
      postFormSchema.safeParse({ ...VALID, excerpt: "x".repeat(281) }).success,
    ).toBe(false);
    expect(
      postFormSchema.safeParse({ ...VALID, seoTitle: "x".repeat(71) }).success,
    ).toBe(false);
    expect(
      postFormSchema.safeParse({
        ...VALID,
        tagInputs: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }).success,
    ).toBe(false);
  });

  it("rejects non-positive category ids", () => {
    expect(
      postFormSchema.safeParse({ ...VALID, categoryIds: [0] }).success,
    ).toBe(false);
    expect(
      postFormSchema.safeParse({ ...VALID, categoryIds: [1.5] }).success,
    ).toBe(false);
  });
});

describe("postAutosaveSchema", () => {
  /**
   * Autosave runs while the author is still typing, so it deliberately accepts
   * a document that could not yet be published — an empty title, no blocks.
   * The publish-time gates live in `postFormSchema` and `transitionPrecondition`.
   */
  it("accepts a half-written draft that postFormSchema would reject", () => {
    const partial = { title: "", content: [], categoryIds: [], tagInputs: [] };

    expect(postAutosaveSchema.safeParse(partial).success).toBe(true);
    expect(postFormSchema.safeParse(partial).success).toBe(false);
  });

  it("still refuses client-supplied contentHtml", () => {
    const parsed = postAutosaveSchema.parse({
      title: "Borrador",
      content: [],
      contentHtml: "<p>enviado por el cliente</p>",
    });

    expect(parsed).not.toHaveProperty("contentHtml");
  });

  it("keeps the length caps that protect the columns", () => {
    expect(
      postAutosaveSchema.safeParse({ title: "x".repeat(201), content: [] })
        .success,
    ).toBe(false);
  });
});

describe("reviewNotesSchema", () => {
  it("requires notes long enough to say something", () => {
    expect(reviewNotesSchema.safeParse({ notes: "corto" }).success).toBe(false);
    expect(
      reviewNotesSchema.safeParse({ notes: "Falta la portada" }).success,
    ).toBe(true);
    expect(
      reviewNotesSchema.safeParse({ notes: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  it("measures after trimming, so padding cannot pass the minimum", () => {
    expect(
      reviewNotesSchema.safeParse({ notes: `  ${" ".repeat(20)}ok  ` }).success,
    ).toBe(false);
  });
});

describe("postCategoryFormSchema", () => {
  it("requires a name of at least 2 characters", () => {
    expect(postCategoryFormSchema.safeParse({ name: "a" }).success).toBe(false);
    expect(postCategoryFormSchema.safeParse({ name: "Tips" }).success).toBe(
      true,
    );
  });

  it("allows an empty description but caps a long one", () => {
    expect(
      postCategoryFormSchema.safeParse({ name: "Tips", description: "" })
        .success,
    ).toBe(true);
    expect(
      postCategoryFormSchema.safeParse({
        name: "Tips",
        description: "x".repeat(281),
      }).success,
    ).toBe(false);
  });
});

describe("shareLinkSchema", () => {
  /**
   * "No expiry" is the default the editor offers, and the field arrives from
   * an empty `datetime-local` input as `""` — so all three spellings of absent
   * have to land on the same null rather than on a parse error.
   */
  it("treats every spelling of blank as never expires", () => {
    for (const value of ["", null, undefined]) {
      const parsed = shareLinkSchema.safeParse({ expiresAt: value });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.expiresAt).toBeNull();
    }

    expect(shareLinkSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a future date", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const parsed = shareLinkSchema.safeParse({ expiresAt: future });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.expiresAt).toEqual(future);
  });

  it("accepts the string a datetime-local input produces", () => {
    const parsed = shareLinkSchema.safeParse({ expiresAt: "2099-01-01T10:30" });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.expiresAt).toBeInstanceOf(Date);
  });

  it("rejects a past date rather than minting a dead link", () => {
    expect(
      shareLinkSchema.safeParse({ expiresAt: new Date(Date.now() - 600_000) })
        .success,
    ).toBe(false);
  });

  it("rejects a date that is not one", () => {
    expect(
      shareLinkSchema.safeParse({ expiresAt: "no soy una fecha" }).success,
    ).toBe(false);
  });
});

describe("PLACEHOLDER_SLUG_RE", () => {
  it("matches the slugs a fresh draft is created with", () => {
    expect(PLACEHOLDER_SLUG_RE.test("borrador")).toBe(true);
    expect(PLACEHOLDER_SLUG_RE.test("borrador-2")).toBe(true);
    expect(PLACEHOLDER_SLUG_RE.test("borrador-17")).toBe(true);
  });

  /**
   * Both the server, which swaps a placeholder for a title-derived slug, and
   * the editor's URL preview key off this, so a real slug that merely starts
   * with the word must not be mistaken for one.
   */
  it("does not match a slug the author actually chose", () => {
    for (const slug of [
      "borrador-de-viaje",
      "mi-borrador",
      "borradores",
      "guia-de-precios",
    ]) {
      expect(PLACEHOLDER_SLUG_RE.test(slug)).toBe(false);
    }
  });
});
