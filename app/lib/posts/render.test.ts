import { describe, expect, it, vi } from "vitest";

// The renderer is server-only by design; `server-only` throws outside a
// server build, and the rendering itself has no server dependency.
vi.mock("server-only", () => ({}));

const { renderPostHtml } = await import("@/app/lib/posts/render");

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text, styles: {} }] };
}

describe("renderPostHtml", () => {
  it("derives the html from the stored blocks", async () => {
    const html = await renderPostHtml([
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Cómo armar tu stand", styles: {} }],
      },
      paragraph("Primero, medí la mesa."),
    ]);

    expect(html).toContain("<h2>Cómo armar tu stand</h2>");
    expect(html).toContain("Primero, medí la mesa.");
  });

  it("returns empty string for an empty or malformed document", async () => {
    expect(await renderPostHtml([])).toBe("");
    expect(await renderPostHtml(null)).toBe("");
    expect(await renderPostHtml("<p>no soy bloques</p>")).toBe("");
  });

  it("keeps the blog-only blocks that the article variant would drop", async () => {
    const html = await renderPostHtml([
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                [{ type: "text", text: "Talla", styles: {} }],
                [{ type: "text", text: "Precio", styles: {} }],
              ],
            },
          ],
        },
      },
      {
        type: "toggleListItem",
        content: [{ type: "text", text: "Ver detalles", styles: {} }],
      },
      {
        type: "checkListItem",
        props: { checked: true },
        content: [{ type: "text", text: "Llevar cinta", styles: {} }],
      },
    ]);

    expect(html).toContain("<table>");
    expect(html).toContain("Talla");
    expect(html).toContain("<details");
    expect(html).toContain("<summary>");
    expect(html).toContain('data-checked="true"');
  });

  it("renders an image block as a figure with its caption", async () => {
    const html = await renderPostHtml([
      {
        type: "image",
        props: { url: "https://cdn.example.com/a.png", caption: "El stand" },
      },
    ]);

    expect(html).toContain('<img src="https://cdn.example.com/a.png"');
    expect(html).toContain("<figcaption>El stand</figcaption>");
  });

  it("shows check state but never hands the reader a live control", async () => {
    const html = await renderPostHtml([
      {
        type: "checkListItem",
        props: { checked: true },
        content: [{ type: "text", text: "Listo", styles: {} }],
      },
    ]);

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("disabled");
  });
});

describe("renderPostHtml — untrusted block content", () => {
  it("strips a javascript: link href written into a block", async () => {
    const html = await renderPostHtml([
      {
        type: "paragraph",
        content: [
          {
            type: "link",
            // eslint-disable-next-line no-script-url
            href: "javascript:alert(1)",
            content: [{ type: "text", text: "click", styles: {} }],
          },
        ],
      },
    ]);

    expect(html).not.toContain("javascript:");
    expect(html).toContain("click");
  });

  it("escapes markup smuggled in as block text rather than emitting it", async () => {
    const html = await renderPostHtml([
      paragraph('<script>alert(1)</script><img src=x onerror="alert(2)">'),
    ]);

    // The payload survives as visible text, which is the point: it is escaped,
    // so no element or handler is ever created from it.
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
  });

  it("drops an image whose url is not http(s)", async () => {
    const html = await renderPostHtml([
      { type: "image", props: { url: "javascript:alert(1)", caption: "" } },
    ]);

    expect(html).not.toContain("javascript:");
  });
});
