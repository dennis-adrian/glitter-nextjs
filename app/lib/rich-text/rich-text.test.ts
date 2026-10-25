import { describe, expect, it } from "vitest";

import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";
import {
  ANNOUNCEMENT_BLOCK_TYPES,
  ARTICLE_BLOCK_TYPES,
  BLOG_BLOCK_TYPES,
  COMPACT_BLOCK_TYPES,
  allowedBlockTypes,
  allowedHeadingLevels,
  announcementEditorSchema,
  articleEditorSchema,
  assertAnnouncementDocument,
  assertCompactDocument,
  blogEditorSchema,
  compactEditorSchema,
  disallowedBlockTypes,
  schemaForVariant,
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

  it("keeps tables and toggles out of the article variant", () => {
    // `article` also drives the festival terms editor. The blog wanting
    // tables must not hand terms editors a table block.
    const articleTypes = Object.keys(articleEditorSchema.blockSchema);
    expect(articleTypes).not.toContain("table");
    expect(articleTypes).not.toContain("toggleListItem");

    const blogTypes = Object.keys(blogEditorSchema.blockSchema);
    expect(blogTypes).toContain("table");
    expect(blogTypes).toContain("toggleListItem");

    for (const type of ARTICLE_BLOCK_TYPES) {
      expect(BLOG_BLOCK_TYPES).toContain(type);
    }
    expect(allowedBlockTypes("blog")).toContain("table");
    expect(allowedBlockTypes("article")).not.toContain("table");
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

  it("gives comunicados exactly what survives an email", () => {
    expect(Object.keys(announcementEditorSchema.blockSchema).sort()).toEqual(
      [...ANNOUNCEMENT_BLOCK_TYPES].sort(),
    );
    expect(allowedBlockTypes("announcement")).toEqual(ANNOUNCEMENT_BLOCK_TYPES);
    expect(schemaForVariant("announcement")).toBe(announcementEditorSchema);
    for (const type of [
      "image",
      "table",
      "toggleListItem",
      "checkListItem",
      "codeBlock",
    ]) {
      expect(allowedBlockTypes("announcement")).not.toContain(type);
    }

    const heading = announcementEditorSchema.blockSchema.heading.propSchema;
    expect(heading.level.values).toEqual([2, 3]);
    expect(heading.level.default).toBe(2);
    // Toggle headings export as <details>, which email clients do not run.
    expect(heading).not.toHaveProperty("isToggleable");
    expect(allowedHeadingLevels("announcement")).toEqual([2, 3]);

    // Only bold and italic: no underline, strike, code or colours to lose.
    expect(Object.keys(announcementEditorSchema.styleSchema).sort()).toEqual([
      "bold",
      "italic",
    ]);
  });

  it("leaves the other variants' schemas as they were", () => {
    expect(schemaForVariant("compact")).toBe(compactEditorSchema);
    expect(schemaForVariant("article")).toBe(articleEditorSchema);
    expect(schemaForVariant("blog")).toBe(blogEditorSchema);
    expect(allowedBlockTypes("compact")).not.toContain("divider");
    expect(allowedHeadingLevels("compact")).toEqual([2, 3]);
    expect(allowedHeadingLevels("article")).toEqual([1, 2, 3, 4]);
    expect(allowedHeadingLevels("blog")).toEqual([1, 2, 3, 4]);
    expect(Object.keys(compactEditorSchema.styleSchema)).toContain("underline");
    expect(compactEditorSchema.blockSchema.heading.propSchema).toHaveProperty(
      "isToggleable",
    );
  });

  it("refuses blocks and heading levels outside the announcement variant", () => {
    expect(
      disallowedBlockTypes(
        [{ type: "divider" }, { type: "image" }, { type: "table" }],
        "announcement",
      ),
    ).toEqual(["image", "table"]);
    expect(() => assertAnnouncementDocument([{ type: "image" }])).toThrow(
      /no permitidos en un comunicado: image/i,
    );
    expect(() =>
      assertAnnouncementDocument([{ type: "heading", props: { level: 4 } }]),
    ).toThrow(/títulos de nivel 2 y 3 en un comunicado/i);
    expect(() =>
      assertAnnouncementDocument([{ type: "divider" }, { type: "quote" }]),
    ).not.toThrow();
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
  it("allowlists http(s), mailto, and root-relative URIs", () => {
    expect(isAllowedRichTextUri("https://example.com")).toBe(true);
    expect(isAllowedRichTextUri("http://example.com")).toBe(true);
    expect(isAllowedRichTextUri("mailto:equipo@productoraglitter.com")).toBe(
      true,
    );
    expect(isAllowedRichTextUri("/terms/diagram.png")).toBe(true);
    expect(isAllowedRichTextUri("//example.com/diagram.png")).toBe(false);
    expect(isAllowedRichTextUri("/\\example.com/image.png")).toBe(false);
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

  it("blocks raw-text end-tag mutation XSS", () => {
    const dirty =
      '<textarea></textarea/><img src="/safe.png" onerror="alert(1)">';
    const clean = sanitizeRichTextHtml(dirty, "article");
    expect(clean).not.toMatch(/textarea|onerror|alert/i);
    expect(clean).toContain('src="/safe.png"');
  });

  it("sanitizes the blog variant's extra tags without widening article", () => {
    const dirty =
      "<table><tr><td>c</td></tr></table><details><summary>s</summary></details>" +
      '<input type="checkbox" checked><figure><figcaption>pie</figcaption></figure>';

    const blog = sanitizeRichTextHtml(dirty, "blog");
    expect(blog).toContain("<table>");
    expect(blog).toContain("<details>");
    expect(blog).toContain("<figcaption>");
    // Shown, never operable — the reader is reading, not filling a form.
    expect(blog).toContain("disabled");

    const article = sanitizeRichTextHtml(dirty, "article");
    expect(article).not.toContain("<table");
    expect(article).not.toContain("<details");
    expect(article).not.toContain("<input");
  });

  it("strips scripts and handlers in the blog variant too", () => {
    const dirty =
      '<table><tr><td onclick="alert(1)">c</td></tr></table>' +
      '<script>alert(2)</script><a href="javascript:alert(3)">x</a>';
    const clean = sanitizeRichTextHtml(dirty, "blog");
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
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

describe("HTML sanitizer: announcement variant", () => {
  it("keeps the compact tags plus the divider", () => {
    const html =
      '<h2>Título</h2><h3>Subtítulo</h3><p><strong>a</strong> <em>b</em> <a href="/my_participations">c</a><br></p>' +
      "<ul><li>u</li></ul><ol><li>o</li></ol><blockquote>q</blockquote><hr>";
    const clean = sanitizeRichTextHtml(html, "announcement");
    for (const tag of [
      "<h2>",
      "<h3>",
      "<strong>",
      "<em>",
      "<br />",
      "<ul>",
      "<ol>",
      "<li>",
      "<blockquote>",
      "<hr />",
    ]) {
      expect(clean).toContain(tag);
    }
    expect(clean).toContain('href="/my_participations"');

    // The divider is announcement-only: compact still drops it.
    expect(
      sanitizeRichTextHtml("<p>a</p><hr><p>b</p>", "compact"),
    ).not.toContain("<hr");
  });

  it("strips script tags, handlers and javascript: links", () => {
    const dirty =
      '<p onclick="alert(1)">Hola</p><script>alert(2)</script>' +
      '<a href="javascript:alert(3)">x</a><a href=" JaVaScRiPt:alert(4)">y</a>' +
      '<hr onmouseover="alert(5)">';
    const clean = sanitizeRichTextHtml(dirty, "announcement");
    expect(clean).not.toMatch(/script|onclick|onmouseover|alert/i);
    expect(clean).toContain("Hola");
    expect(clean).toContain("<hr />");
  });

  it("strips data:, vbscript:, protocol-relative and backslash hrefs", () => {
    const dirty =
      '<a href="data:text/html,<script>alert(1)</script>">a</a>' +
      '<a href="vbscript:msgbox(1)">b</a>' +
      '<a href="//evil.example/x">c</a>' +
      '<a href="/\\evil.example">d</a>' +
      '<a href="relative/path">e</a>';
    const clean = sanitizeRichTextHtml(dirty, "announcement");
    expect(clean).not.toContain("href=");
    expect(clean).not.toMatch(/data:|vbscript:|evil\.example/i);
    expect(clean).toContain("a");
  });

  it("drops images, media, frames and forms until images ship", () => {
    const dirty =
      '<img src="https://x.com/a.png" onerror="alert(1)"><figure><figcaption>pie</figcaption></figure>' +
      '<iframe src="https://evil.example"></iframe><svg><script>alert(2)</script></svg>' +
      '<video src="https://x.com/v.mp4"></video><form action="https://evil.example"><input type="text" name="clave"></form>' +
      "<details open><summary>s</summary></details><table><tr><td>t</td></tr></table>" +
      '<object data="https://evil.example"></object><embed src="https://evil.example">';
    const clean = sanitizeRichTextHtml(dirty, "announcement");
    expect(clean).not.toMatch(
      /<img|<figure|<iframe|<svg|<script|<video|<form|<input|<details|<table|<object|<embed|onerror|alert/i,
    );
    expect(clean).not.toContain("evil.example");
  });

  it("drops styles, colours, classes and the formats email clients break", () => {
    const dirty =
      '<p style="color:red;background:url(javascript:alert(1))" class="x" data-text-color="red">a</p>' +
      "<u>sub</u><s>tach</s><code>c</code><pre>p</pre><mark>m</mark><h1>uno</h1><h4>cuatro</h4>" +
      "<style>p{color:red}</style>";
    const clean = sanitizeRichTextHtml(dirty, "announcement");
    expect(clean).not.toMatch(
      /style|class=|data-|<u>|<s>|<code|<pre|<mark|<h1|<h4|color:red/i,
    );
    // The text survives; only the markup goes.
    for (const word of ["sub", "tach", "uno", "cuatro"]) {
      expect(clean).toContain(word);
    }
  });

  it("blocks raw-text end-tag mutation XSS", () => {
    const dirty =
      '<textarea></textarea/><img src="/safe.png" onerror="alert(1)">' +
      '<noscript><p title="</noscript><img src=x onerror=alert(2)>"></noscript>';
    const clean = sanitizeRichTextHtml(dirty, "announcement");
    expect(clean).not.toMatch(/textarea|noscript|<img|onerror|alert/i);
  });
});

describe("blocksToSanitizedHtml: announcement variant", () => {
  it("renders the variant's blocks on the server", async () => {
    const html = await blocksToSanitizedHtml(
      [
        { type: "heading", props: { level: 2 }, content: "Cambio de horario" },
        { type: "heading", props: { level: 3 }, content: "Armado" },
        {
          type: "paragraph",
          props: { textColor: "red", textAlignment: "center" },
          content: [
            { type: "text", text: "Llegá ", styles: {} },
            { type: "text", text: "temprano", styles: { bold: true } },
          ],
        },
        { type: "divider" },
        {
          type: "bulletListItem",
          content: "Mesa",
          children: [{ type: "bulletListItem", content: "Mantel" }],
        },
        { type: "numberedListItem", content: "Uno" },
        { type: "quote", content: "Traé tu credencial." },
      ],
      "announcement",
    );

    expect(html).toContain("<h2>Cambio de horario</h2>");
    expect(html).toContain("<h3>Armado</h3>");
    expect(html).toContain("<strong>temprano</strong>");
    expect(html).toContain("<hr />");
    expect(html).toMatch(/<ul><li>.*Mesa.*<ul><li>.*Mantel/);
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>Traé tu credencial.</blockquote>");
    // Colours and alignment never reach the page.
    expect(html).not.toMatch(/style=|data-/);
  });

  it("refuses a block the variant does not have instead of rendering it", async () => {
    await expect(
      blocksToSanitizedHtml(
        [{ type: "image", props: { url: "https://x.com/a.png" } }],
        "announcement",
      ),
    ).rejects.toThrow(/no permitidos en un comunicado: image/);
  });
});
