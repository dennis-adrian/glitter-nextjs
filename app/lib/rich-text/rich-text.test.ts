import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import {
  ARTICLE_BLOCK_TYPES,
  COMPACT_BLOCK_TYPES,
  allowedBlockTypes,
  articleEditorSchema,
  assertCompactDocument,
  compactEditorSchema,
  disallowedBlockTypes,
} from "@/app/lib/rich-text/schemas";
import {
  isAllowedRichTextUri,
  sanitizeRichTextHtml,
} from "@/app/lib/rich-text/sanitize";

describe("editor schemas", () => {
  it("exposes compact as a subset of article", () => {
    for (const type of COMPACT_BLOCK_TYPES) {
      expect(ARTICLE_BLOCK_TYPES).toContain(type);
    }
    expect(allowedBlockTypes("article")).toContain("image");
    expect(allowedBlockTypes("compact")).not.toContain("image");
  });

  it("omits image, video, and file from the compact schema", () => {
    const compactTypes = Object.keys(compactEditorSchema.blockSchema);
    expect(compactTypes).not.toContain("image");
    expect(compactTypes).not.toContain("video");
    expect(compactTypes).not.toContain("file");
    expect(Object.keys(articleEditorSchema.blockSchema)).toContain("image");
  });

  it("rejects unsupported compact heading levels", () => {
    const levels =
      compactEditorSchema.blockSchema.heading.propSchema.level.values;

    expect(levels).toEqual([2, 3]);
    expect(levels).not.toContain(1);
    expect(levels).not.toContain(4);
  });

  it("rejects unsupported article heading levels", () => {
    const levels =
      articleEditorSchema.blockSchema.heading.propSchema.level.values;

    expect(levels).toEqual([1, 2, 3, 4]);
    expect(levels).not.toContain(5);
    expect(levels).not.toContain(6);
  });

  it("rejects image/video/file blocks in compact documents", () => {
    expect(disallowedBlockTypes([{ type: "image" }], "compact")).toEqual([
      "image",
    ]);
    expect(() =>
      assertCompactDocument([{ type: "video" }, { type: "file" }]),
    ).toThrow(/no permitidos en este documento: video, file/i);
  });

  it("rejects unsupported heading levels in compact documents", () => {
    expect(() =>
      assertCompactDocument([{ type: "heading", props: { level: 1 } }]),
    ).toThrow(/títulos de nivel 2 y 3 en este documento/i);
  });

  it("uses a caller-supplied document label in compact validation errors", () => {
    expect(() =>
      assertCompactDocument([{ type: "video" }], "una categoría"),
    ).toThrow(/no permitidos en una categoría: video/i);
    expect(() =>
      assertCompactDocument(
        [{ type: "heading", props: { level: 1 } }],
        "una categoría",
      ),
    ).toThrow(/títulos de nivel 2 y 3 en una categoría/i);
  });
});

describe("HTML sanitizer", () => {
  it("loads when synchronous CommonJS-to-ESM bridging is unavailable", () => {
    const require = createRequire(import.meta.url);
    const sanitizerPath = require.resolve("sanitize-html");
    const result = spawnSync(
      process.execPath,
      ["-e", `require(${JSON.stringify(sanitizerPath)})`],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: "--no-experimental-require-module",
        },
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("allowlists http(s), mailto, and root-relative URIs", () => {
    expect(isAllowedRichTextUri("https://example.com")).toBe(true);
    expect(isAllowedRichTextUri("http://example.com")).toBe(true);
    expect(isAllowedRichTextUri("mailto:equipo@productoraglitter.com")).toBe(
      true,
    );
    expect(isAllowedRichTextUri("/terms/diagram.png")).toBe(true);
    expect(isAllowedRichTextUri("//example.com/diagram.png")).toBe(false);
    expect(isAllowedRichTextUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRichTextUri("data:text/html,x")).toBe(false);
  });

  it("strips script tags and javascript: links", () => {
    const dirty =
      '<p>Hola</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>';
    const clean = sanitizeRichTextHtml(dirty, "compact");
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain("Hola");
  });

  it("strips non-root-relative and protocol-relative URIs", () => {
    const dirty =
      '<a href="relative/path">relative</a><img src="//example.com/image.png" alt="image">';
    const clean = sanitizeRichTextHtml(dirty, "article");
    expect(clean).not.toContain("href=");
    expect(clean).not.toContain("src=");
    expect(clean).toContain("relative");
    expect(clean).toContain('alt="image"');
  });

  it("keeps compact allowlisted markup including mailto links", () => {
    const html =
      '<h2>Título</h2><p>Texto <strong>negrita</strong> y <a href="mailto:equipo@productoraglitter.com">correo</a></p><ul><li>Uno</li></ul>';
    const clean = sanitizeRichTextHtml(html, "compact");
    expect(clean).toContain("<h2>");
    expect(clean).toContain("<strong>");
    expect(clean).toContain("mailto:equipo@productoraglitter.com");
    expect(clean).toContain("<li>");
  });
});
