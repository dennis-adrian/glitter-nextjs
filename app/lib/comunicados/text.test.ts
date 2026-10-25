import { describe, expect, it } from "vitest";

import { COMUNICADO_EXCERPT_MAX } from "@/app/lib/comunicados/definitions";
import {
  announcementBlocksToText,
  excerptOf,
} from "@/app/lib/comunicados/text";

function text(value: string, styles: Record<string, true> = {}) {
  return { type: "text", text: value, styles };
}

function block(type: string, content: unknown[] = [], extra = {}) {
  return { type, props: {}, content, children: [], ...extra };
}

function link(href: string, label: string) {
  return { type: "link", href, content: [text(label)] };
}

const plain = { withUrls: false };
const withUrls = { withUrls: true };

describe("announcementBlocksToText", () => {
  it("puts a blank line between blocks and headings on their own line", () => {
    const doc = [
      block("heading", [text("Cambio de horario")], { props: { level: 2 } }),
      block("paragraph", [
        text("El armado empieza a las "),
        text("8:00", { bold: true }),
        text("."),
      ]),
      block("quote", [text("Traé tu credencial.")]),
    ];

    expect(announcementBlocksToText(doc, plain)).toBe(
      "Cambio de horario\n\nEl armado empieza a las 8:00.\n\nTraé tu credencial.",
    );
  });

  it("marks list items, numbers each run from 1 and indents nested items", () => {
    const doc = [
      block("bulletListItem", [text("Mesa")], {
        children: [block("bulletListItem", [text("Mantel")])],
      }),
      block("bulletListItem", [text("Silla")]),
      block("paragraph", [text("Y además:")]),
      block("numberedListItem", [text("Llegar")]),
      block("numberedListItem", [text("Armar")], {
        children: [block("numberedListItem", [text("Colgar el cartel")])],
      }),
    ];

    expect(announcementBlocksToText(doc, plain)).toBe(
      [
        "• Mesa\n  • Mantel\n• Silla",
        "Y además:",
        "1. Llegar\n2. Armar\n  1. Colgar el cartel",
      ].join("\n\n"),
    );
  });

  it("restarts the numbering when a bullet interrupts a numbered run", () => {
    const doc = [
      block("numberedListItem", [text("Uno")]),
      block("bulletListItem", [text("Aparte")]),
      block("numberedListItem", [text("Otra vez")]),
    ];

    expect(announcementBlocksToText(doc, plain)).toBe(
      "1. Uno\n• Aparte\n1. Otra vez",
    );
  });

  it("shows links as their text, or with the address when asked", () => {
    const doc = [
      block("paragraph", [
        text("Mirá "),
        link("https://productoraglitter.com/mapa", "el mapa"),
        text(" o escribinos a "),
        link("mailto:hola@productoraglitter.com", "nuestro correo"),
        text("."),
      ]),
    ];

    expect(announcementBlocksToText(doc, plain)).toBe(
      "Mirá el mapa o escribinos a nuestro correo.",
    );
    expect(announcementBlocksToText(doc, withUrls)).toBe(
      "Mirá el mapa (https://productoraglitter.com/mapa) o escribinos a nuestro correo (hola@productoraglitter.com).",
    );
  });

  it("does not repeat an address that is its own label", () => {
    const doc = [
      block("paragraph", [
        link("https://productoraglitter.com/", "productoraglitter.com"),
      ]),
    ];

    expect(announcementBlocksToText(doc, withUrls)).toBe(
      "productoraglitter.com",
    );
  });

  it("makes a Glitter path absolute by concatenation when given a base", () => {
    const doc = [
      block("paragraph", [link("/my_participations", "tu reserva")]),
    ];

    expect(announcementBlocksToText(doc, withUrls)).toBe(
      "tu reserva (/my_participations)",
    );
    expect(
      announcementBlocksToText(doc, {
        withUrls: true,
        baseUrl: "https://productoraglitter.com/",
      }),
    ).toBe("tu reserva (https://productoraglitter.com/my_participations)");
  });

  it("renders dividers as a dash, images as their caption, and skips empty paragraphs", () => {
    const doc = [
      block("paragraph", [text("Antes")]),
      block("paragraph", []),
      block("paragraph", [text("   ")]),
      { type: "divider", props: {}, children: [] },
      { type: "image", props: { caption: "El plano" }, children: [] },
      { type: "image", props: {}, children: [] },
      block("paragraph", [text("Después")]),
    ];

    expect(announcementBlocksToText(doc, plain)).toBe(
      "Antes\n\n—\n\nEl plano\n\nDespués",
    );
  });

  it("keeps line breaks inside a block, aligned under a list item's text", () => {
    const doc = [
      block("paragraph", [text("Línea uno\nLínea dos")]),
      block("bulletListItem", [text("Punto\nsigue acá")]),
    ];

    expect(announcementBlocksToText(doc, plain)).toBe(
      "Línea uno\nLínea dos\n\n• Punto\n  sigue acá",
    );
  });

  it("is empty for an empty or malformed document", () => {
    expect(announcementBlocksToText([], plain)).toBe("");
    expect(announcementBlocksToText([null, "x", 3], plain)).toBe("");
  });
});

describe("excerptOf", () => {
  it("collapses whitespace and keeps a short text whole", () => {
    expect(excerptOf("  Hola\n\n• uno\n  • dos  ")).toBe("Hola • uno • dos");
  });

  it("cuts a long text on a word boundary with an ellipsis, within the limit", () => {
    const words = Array.from({ length: 120 }, (_, index) => `palabra${index}`);
    const excerpt = excerptOf(words.join(" "));

    expect(excerpt.length).toBeLessThanOrEqual(COMUNICADO_EXCERPT_MAX);
    expect(excerpt.endsWith("…")).toBe(true);
    const kept = excerpt.slice(0, -1).split(" ");
    // Every word kept is a whole word of the original, in order.
    expect(kept).toEqual(words.slice(0, kept.length));
  });

  it("keeps a text exactly at the limit uncut", () => {
    const exact = "a".repeat(COMUNICADO_EXCERPT_MAX);
    expect(excerptOf(exact)).toBe(exact);
  });

  it("drops a trailing comma before the ellipsis", () => {
    const head = "x".repeat(COMUNICADO_EXCERPT_MAX - 10);
    const excerpt = excerptOf(`${head} uno, ${"y".repeat(40)}`);
    expect(excerpt).toBe(`${head} uno…`);
  });

  it("hard-cuts one long word without splitting an emoji", () => {
    const long = `${"a".repeat(COMUNICADO_EXCERPT_MAX - 2)}😀${"b".repeat(20)}`;
    const excerpt = excerptOf(long);

    expect(excerpt.length).toBeLessThanOrEqual(COMUNICADO_EXCERPT_MAX);
    expect(excerpt).toBe(`${"a".repeat(COMUNICADO_EXCERPT_MAX - 2)}…`);
    expect(excerpt.isWellFormed()).toBe(true);
  });
});
