import { describe, expect, it } from "vitest";

import {
  normalizeAnnouncementDoc,
  type NormalizeAnnouncementResult,
} from "@/app/lib/comunicados/content";
import {
  COMUNICADO_DOC_MAX_BYTES,
  COMUNICADO_FOREIGN_IMAGE_MESSAGE,
  COMUNICADO_MAX_BLOCKS,
  COMUNICADO_MAX_IMAGES,
  COMUNICADO_TEXT_MAX,
} from "@/app/lib/comunicados/definitions";
import {
  COMUNICADO_IMAGE_CAP_MESSAGE,
  foreignComunicadoImageUrls,
} from "@/app/lib/comunicados/images";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";

const DEFAULTS = {
  backgroundColor: "default",
  textColor: "default",
  textAlignment: "left",
};

function text(value: string, styles: Record<string, unknown> = {}) {
  return { type: "text", text: value, styles };
}

function paragraph(content: unknown[] = [], extra = {}) {
  return { type: "paragraph", props: {}, content, children: [], ...extra };
}

function image(props: Record<string, unknown> = {}, extra = {}) {
  return { type: "image", props, children: [], ...extra };
}

/** Uploaded through the `comunicadoImage` route. */
const PLANO = "https://x7a9.ufs.sh/f/plano-armado";
const AFICHE = "https://utfs.io/f/afiche";
/** Pasted from another page. */
const PASTED = "https://www.instagram.com/p/afiche.jpg";

function draft(input: unknown) {
  return normalizeAnnouncementDoc(input, { stage: "draft" });
}

function send(input: unknown) {
  return normalizeAnnouncementDoc(input, { stage: "send" });
}

function ok(result: NormalizeAnnouncementResult) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result;
}

function refusal(result: NormalizeAnnouncementResult) {
  if (result.ok) throw new Error("expected a refusal");
  return result.message;
}

describe("normalizeAnnouncementDoc: refusals", () => {
  it("refuses a block the variant does not have, naming it in Spanish", () => {
    expect(
      refusal(
        draft([paragraph([text("Hola")]), { type: "table", content: {} }]),
      ),
    ).toBe("Este bloque no se puede usar en un comunicado: tabla.");
    // An image is a block of the variant now (PR 8).
    ok(draft([image({ url: PLANO })]));
  });

  it("names every refused type at once, nested ones included, and falls back to the raw type", () => {
    const message = refusal(
      draft([
        { type: "codeBlock", content: [] },
        paragraph([], { children: [{ type: "checkListItem", content: [] }] }),
        { type: "mention", content: [] },
      ]),
    );

    expect(message).toBe(
      "Estos bloques no se pueden usar en un comunicado: bloque de código, lista de tareas, mention.",
    );
  });

  it("refuses a heading level no editor writes", () => {
    for (const level of ["2", 2.5, null]) {
      expect(
        refusal(
          draft([{ type: "heading", props: { level }, content: [text("T")] }]),
        ),
      ).toMatch(/No pudimos leer el texto/);
    }
  });

  it("refuses links that are not https, http, mailto or a Glitter path", () => {
    for (const href of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example/x",
      "/\\evil.example",
      "vbscript:msgbox(1)",
      "evil.example",
      "",
      // Browsers strip the tab while parsing and land on //evil.example.
      "/\t/evil.example",
      "/\n/evil.example",
      "https://x.com/\r\na",
    ]) {
      const message = refusal(
        draft([
          paragraph([
            text("Mirá "),
            { type: "link", href, content: [text("esto")] },
          ]),
        ]),
      );
      expect(message).toMatch(/^Revisá el enlace «[\s\S]+»/);
    }
  });

  it("names the address it refuses, clipped when it is long", () => {
    const message = refusal(
      draft([
        paragraph([
          { type: "link", href: "javascript:alert(1)", content: [text("x")] },
        ]),
      ]),
    );
    expect(message).toContain("«javascript:alert(1)»");

    const long = `data:${"a".repeat(200)}`;
    const clipped = refusal(
      draft([paragraph([{ type: "link", href: long, content: [text("x")] }])]),
    );
    expect(clipped).toContain(`«${long.slice(0, 59)}…»`);
  });

  it("refuses a nested link refused deep in a list", () => {
    const doc = [
      {
        type: "bulletListItem",
        content: [text("Uno")],
        children: [
          {
            type: "bulletListItem",
            content: [
              {
                type: "link",
                href: "javascript:void(0)",
                content: [text("x")],
              },
            ],
          },
        ],
      },
    ];
    expect(refusal(draft(doc))).toMatch(/^Revisá el enlace/);
  });

  it("refuses shapes it cannot read instead of storing them", () => {
    const malformed = [
      "not an array",
      { type: "paragraph" },
      [null],
      [{ content: [] }],
      [paragraph([{ type: "mention", user: "x" }])],
      [paragraph([{ type: "text", text: 3 }])],
      [{ type: "paragraph", content: { type: "tableContent", rows: [] } }],
      [{ type: "paragraph", children: "x" }],
    ];
    for (const input of malformed) {
      expect(refusal(draft(input))).toMatch(/No pudimos leer el texto/);
    }
  });
});

describe("normalizeAnnouncementDoc: silent normalization", () => {
  it("keeps bold and italic and drops underline, strike, code and colours", () => {
    const { blocks } = ok(
      draft([
        paragraph([
          text("negrita", { bold: true, underline: true }),
          text("cursiva", { italic: true, strike: true }),
          text("código", { code: true }),
          text(" color", { textColor: "red", backgroundColor: "yellow" }),
        ]),
      ]),
    );

    expect(blocks[0].content).toEqual([
      text("negrita", { bold: true }),
      text("cursiva", { italic: true }),
      // Neighbours left with the same styles become one run.
      text("código color"),
    ]);
  });

  it("resets block colours and alignment and drops unknown props", () => {
    const { blocks } = ok(
      draft([
        paragraph([text("centrado")], {
          props: {
            textAlignment: "center",
            textColor: "red",
            backgroundColor: "blue",
            onclick: "alert(1)",
          },
        }),
        {
          type: "heading",
          props: { level: 2, textAlignment: "right", isToggleable: true },
          content: [text("Título")],
        },
        {
          type: "quote",
          props: { textColor: "red", textAlignment: "center" },
          content: [text("cita")],
        },
        {
          type: "numberedListItem",
          props: { start: 7 },
          content: [text("siete")],
        },
        { type: "divider", props: { textColor: "red" }, content: [text("x")] },
      ]),
    );

    expect(blocks.map((block) => block.props)).toEqual([
      DEFAULTS,
      { ...DEFAULTS, level: 2 },
      { backgroundColor: "default", textColor: "default" },
      DEFAULTS,
      {},
    ]);
    // A divider holds no text.
    expect(blocks[4]).not.toHaveProperty("content");
  });

  it("trims empty paragraphs at the end, and only at the end", () => {
    const { blocks } = ok(
      draft([
        paragraph([]),
        paragraph([text("Hola")]),
        paragraph([]),
        paragraph([text("Chau")]),
        paragraph([]),
        paragraph([text("   ")]),
        paragraph(),
      ]),
    );

    expect(blocks).toHaveLength(4);
    expect(blocks.at(-1)?.content).toEqual([text("Chau")]);
  });

  it("keeps a trailing empty paragraph that holds nested blocks", () => {
    const { blocks } = ok(
      draft([
        paragraph([text("Hola")]),
        paragraph([], { children: [paragraph([text("adentro")])] }),
      ]),
    );
    expect(blocks).toHaveLength(2);
  });

  it("keeps a safe link, trimmed, and drops one around no text", () => {
    const { blocks } = ok(
      draft([
        paragraph([
          {
            type: "link",
            href: "  https://x.com/a  ",
            content: [text("a", { underline: true })],
          },
          { type: "link", href: "/my_participations", content: "reserva" },
          {
            type: "link",
            href: "mailto:hola@x.com",
            content: [text("correo")],
          },
          { type: "link", href: "javascript:alert(1)", content: [] },
        ]),
      ]),
    );

    expect(blocks[0].content).toEqual([
      { type: "link", href: "https://x.com/a", content: [text("a")] },
      { type: "link", href: "/my_participations", content: [text("reserva")] },
      { type: "link", href: "mailto:hola@x.com", content: [text("correo")] },
    ]);
  });

  it("saves a pasted heading as the nearer of Título (2) and Subtítulo (3)", () => {
    // BlockNote parses <h1> and <h4>–<h6>, and Markdown's "#", whatever the
    // schema's levels.
    const levels = [1, 2, 3, 4, 5, 6, undefined];
    const doc = levels.map((level) => ({
      type: "heading",
      props: { level },
      content: [text(`h${level}`)],
    }));

    for (const stage of ["draft", "send"] as const) {
      const { blocks } = ok(normalizeAnnouncementDoc(doc, { stage }));
      expect(blocks.map((block) => block.props.level)).toEqual([
        2, 2, 3, 3, 3, 3, 2,
      ]);
    }
  });

  it("lifts a third level of nesting to follow its parent, in order", () => {
    const item = (label: string, children: unknown[] = []) => ({
      type: "bulletListItem",
      content: [text(label)],
      children,
    });
    const doc = [
      item("Uno", [
        item("Dos", [item("Tres", [item("Cuatro")]), item("Tres bis")]),
        item("Dos bis"),
      ]),
      item("Otro"),
    ];

    for (const stage of ["draft", "send"] as const) {
      const result = ok(normalizeAnnouncementDoc(doc, { stage }));
      const [uno, otro] = result.blocks;
      expect(uno.children.map((child) => child.content)).toEqual(
        ["Dos", "Tres", "Cuatro", "Tres bis", "Dos bis"].map((label) => [
          text(label),
        ]),
      );
      for (const child of uno.children) expect(child.children).toEqual([]);
      expect(otro.content).toEqual([text("Otro")]);
      expect(result.text).toBe(
        "• Uno\n  • Dos\n  • Tres\n  • Cuatro\n  • Tres bis\n  • Dos bis\n• Otro",
      );
    }
    // A list inside a list is kept as it is.
    expect(ok(draft([item("Uno", [item("Dos")])])).blocks[0].children).toEqual([
      expect.objectContaining({ content: [text("Dos")], children: [] }),
    ]);
  });

  it("encodes whitespace inside an address, so every rendering carries the same one", () => {
    const { blocks } = ok(
      draft([
        paragraph([
          { type: "link", href: " /mis cosas ", content: [text("a")] },
          {
            type: "link",
            href: "https://drive.example/mi archivo final.pdf",
            content: [text("b")],
          },
          {
            type: "link",
            href: "mailto:hola@x.com?subject=Hola che",
            content: [text("c")],
          },
        ]),
      ]),
    );

    expect(
      (blocks[0].content ?? []).map((node) =>
        node.type === "link" ? node.href : null,
      ),
    ).toEqual([
      "/mis%20cosas",
      "https://drive.example/mi%20archivo%C2%A0final.pdf",
      "mailto:hola@x.com?subject=Hola%20che",
    ]);
  });

  it("strips characters Postgres jsonb refuses", () => {
    const { blocks } = ok(draft([paragraph([text("a\u0000b\r\nc\ud800d")])]));
    expect(blocks[0].content).toEqual([text("ab\nc�d")]);
  });

  it("encodes a lone surrogate in a link's address, which jsonb would refuse", () => {
    const { blocks } = ok(
      draft([
        paragraph([
          { type: "link", href: "/merch?q=a\ud800b", content: [text("x")] },
        ]),
      ]),
    );
    const href = (blocks[0].content ?? []).map((node) =>
      node.type === "link" ? node.href : null,
    )[0];
    expect(href).toBe("/merch?q=a%EF%BF%BDb");
    // The stored document survives a JSON round trip Postgres would accept.
    expect(JSON.stringify(blocks)).not.toMatch(/\\ud800/i);
  });

  it("returns blocks in the editor's shape, keeping ids and dropping extra keys", () => {
    const { blocks } = ok(
      draft([
        {
          id: "b1",
          type: "paragraph",
          content: "Hola",
          html: "<script>alert(1)</script>",
        },
      ]),
    );

    expect(blocks).toEqual([
      {
        id: "b1",
        type: "paragraph",
        props: DEFAULTS,
        content: [text("Hola")],
        children: [],
      },
    ]);
  });

  it("returns the plain text without URLs", () => {
    const result = ok(
      draft([
        { type: "heading", props: { level: 2 }, content: [text("Horario")] },
        paragraph([
          text("Mirá "),
          { type: "link", href: "https://x.com", content: [text("el mapa")] },
        ]),
      ]),
    );
    expect(result.text).toBe("Horario\n\nMirá el mapa");
  });
});

describe("normalizeAnnouncementDoc: size limits", () => {
  it(`refuses more than ${COMUNICADO_MAX_BLOCKS} blocks, children counted`, () => {
    const flat = Array.from({ length: COMUNICADO_MAX_BLOCKS }, () =>
      paragraph([text("x")]),
    );
    ok(draft(flat));

    const nested = [
      ...flat.slice(1),
      paragraph([text("x")], { children: [paragraph([text("y")])] }),
    ];
    expect(refusal(draft(nested))).toBe(
      `El texto puede tener hasta ${COMUNICADO_MAX_BLOCKS} párrafos, títulos o puntos de lista.`,
    );
  });

  it("refuses a document over the JSON size limit", () => {
    const big = [paragraph([text("a".repeat(COMUNICADO_DOC_MAX_BYTES))])];
    expect(refusal(draft(big))).toBe(
      "El comunicado es demasiado largo. Acortá el texto.",
    );
  });

  it("measures the normalized document too: each batch of a send measures it again", () => {
    // Under the limit as the editor hands it over; over it once each space in
    // the address is encoded as %20, or each caption is copied into `name`.
    const spaced = `https://glitter.bo/${" ".repeat(25_000)}x`;
    const link = [
      paragraph([
        { type: "link", href: spaced, content: [text("el formulario")] },
      ]),
    ];
    expect(JSON.stringify(link).length).toBeLessThan(COMUNICADO_DOC_MAX_BYTES);
    const captioned = Array.from({ length: COMUNICADO_MAX_IMAGES }, (_, i) =>
      image({ url: PLANO, name: `IMG_${i}.jpg`, caption: "a".repeat(5_800) }),
    );
    expect(JSON.stringify(captioned).length).toBeLessThan(
      COMUNICADO_DOC_MAX_BYTES,
    );

    for (const doc of [link, captioned]) {
      expect(refusal(draft(doc))).toBe(
        "El comunicado es demasiado largo. Acortá el texto.",
      );
      expect(refusal(send(doc))).toMatch(/demasiado largo/);
    }

    // Whatever is accepted is accepted again as it was stored.
    const fits = [
      paragraph([
        {
          type: "link",
          href: `https://glitter.bo/${" ".repeat(10_000)}x`,
          content: [text("el formulario")],
        },
      ]),
    ];
    const once = ok(send(fits));
    expect(ok(send(once.blocks)).blocks).toEqual(once.blocks);
  });

  it("measures the size in bytes, not characters", () => {
    // Each "ñ" is two bytes of UTF-8: under the limit in characters, over in bytes.
    const doc = [
      paragraph([text("ñ".repeat(COMUNICADO_DOC_MAX_BYTES / 2 + 10))]),
    ];
    expect(JSON.stringify(doc).length).toBeLessThan(COMUNICADO_DOC_MAX_BYTES);
    expect(refusal(draft(doc))).toMatch(/demasiado largo/);
  });
});

describe("normalizeAnnouncementDoc: stages", () => {
  const long = [paragraph([text("a".repeat(COMUNICADO_TEXT_MAX + 1))])];
  const exact = [paragraph([text("a".repeat(COMUNICADO_TEXT_MAX))])];

  it("lets a draft be empty or too long", () => {
    expect(ok(draft([])).blocks).toEqual([]);
    expect(ok(draft([paragraph([])])).blocks).toEqual([]);
    ok(draft(long));
  });

  it("asks for text before sending", () => {
    for (const input of [
      [],
      [paragraph([])],
      [paragraph([text("   ")])],
      // Visible, but says nothing.
      [{ type: "divider" }],
    ]) {
      expect(refusal(normalizeAnnouncementDoc(input, { stage: "send" }))).toBe(
        "Escribí el texto del comunicado.",
      );
    }
  });

  it(`bounds the plain text to ${COMUNICADO_TEXT_MAX} characters before sending`, () => {
    expect(refusal(normalizeAnnouncementDoc(long, { stage: "send" }))).toBe(
      "El texto puede tener hasta 5.000 caracteres.",
    );
    ok(normalizeAnnouncementDoc(exact, { stage: "send" }));
  });

  it("refuses the same content problems at both stages", () => {
    for (const doc of [
      [paragraph([text("T")]), { type: "table", content: {} }],
      [
        paragraph([
          { type: "link", href: "javascript:alert(1)", content: [text("T")] },
        ]),
      ],
    ]) {
      expect(draft(doc).ok).toBe(false);
      expect(normalizeAnnouncementDoc(doc, { stage: "send" }).ok).toBe(false);
    }
  });
});

describe("normalizeAnnouncementDoc: images", () => {
  it("keeps an uploaded image's address and caption, and nothing else", () => {
    const pasted = image(
      {
        url: `  ${PLANO}  `,
        caption: "  El plano\u0000 del armado ",
        name: "IMG_1234.jpg",
        showPreview: false,
        previewWidth: 512,
        textAlignment: "center",
        backgroundColor: "red",
        textColor: "blue",
        onerror: "alert(1)",
      },
      { id: "img1", content: [text("x")] },
    );

    for (const stage of ["draft", "send"] as const) {
      const { blocks } = ok(
        normalizeAnnouncementDoc([paragraph([text("Hola")]), pasted], {
          stage,
        }),
      );
      expect(blocks[1]).toEqual({
        id: "img1",
        type: "image",
        props: {
          url: PLANO,
          caption: "El plano del armado",
          // The inbox `alt` is the caption, as in the email, not a file name.
          name: "El plano del armado",
          textAlignment: "left",
          backgroundColor: "default",
        },
        children: [],
      });
    }
  });

  it("keeps a pasted image on a draft and refuses it at send", () => {
    const doc = [paragraph([text("Hola")]), image({ url: PASTED })];

    const { blocks } = ok(draft(doc));
    expect(blocks[1].props.url).toBe(PASTED);
    // What the composer flags, from the same blocks.
    expect(foreignComunicadoImageUrls(blocks)).toEqual([PASTED]);

    expect(refusal(send(doc))).toBe(COMUNICADO_FOREIGN_IMAGE_MESSAGE);
    expect(COMUNICADO_FOREIGN_IMAGE_MESSAGE).toBe(
      "Esta imagen no está subida a Glitter: subila de nuevo.",
    );
  });

  it("flags on the client exactly what it refuses at send, from the document as the editor holds it", () => {
    for (const url of [
      PLANO,
      `\u0001${PLANO}\u007f`,
      ` ${AFICHE}\u0008 `,
      `${PLANO}\tx`,
      `${PLANO}\nx`,
      PASTED,
    ]) {
      const doc = [paragraph([text("Hola")]), image({ url })];
      expect(foreignComunicadoImageUrls(doc).length > 0).toBe(!send(doc).ok);
    }
  });

  it("refuses at send an image that is not a bare https UploadThing file, nested ones included", () => {
    for (const url of [
      "http://x7a9.ufs.sh/f/plano-armado",
      `${PLANO}?w=1200`,
      "data:image/png;base64,iVBORw0KGgo=",
      "/img/plano.png",
    ]) {
      const doc = [
        paragraph([text("Hola")]),
        {
          type: "bulletListItem",
          content: [text("Mirá")],
          children: [image({ url })],
        },
      ];
      ok(draft(doc));
      expect(refusal(send(doc))).toBe(COMUNICADO_FOREIGN_IMAGE_MESSAGE);
    }
    ok(send([paragraph([text("Hola")]), image({ url: AFICHE })]));
  });

  it(`refuses more than ${COMUNICADO_MAX_IMAGES} images at both stages, nested ones counted`, () => {
    const six = [
      paragraph([text("Hola")]),
      ...Array.from({ length: COMUNICADO_MAX_IMAGES - 1 }, () =>
        image({ url: PLANO }),
      ),
      paragraph([text("Uno más:")], { children: [image({ url: AFICHE })] }),
    ];
    ok(draft(six));
    ok(send(six));

    const seven = [...six, image({ url: PLANO })];
    expect(refusal(draft(seven))).toBe(COMUNICADO_IMAGE_CAP_MESSAGE);
    expect(refusal(send(seven))).toBe(
      "Un comunicado puede tener hasta 6 imágenes.",
    );
    // Pasted ones count too: the draft would hold them.
    expect(refusal(draft([...six, image({ url: PASTED })]))).toBe(
      COMUNICADO_IMAGE_CAP_MESSAGE,
    );
  });

  it("drops an image with no address, its children taking its place", () => {
    const { blocks } = ok(
      draft([
        paragraph([text("Antes")]),
        image(
          { url: "" },
          {
            children: [
              paragraph([text("Hijo")], {
                children: [paragraph([text("Nieto")])],
              }),
            ],
          },
        ),
        image({ url: "   " }),
        { type: "image" },
        paragraph([text("Después")], {
          children: [image({ url: "", caption: "Sin subir" })],
        }),
      ]),
    );

    expect(blocks.map((block) => block.content)).toEqual([
      [text("Antes")],
      [text("Hijo")],
      [text("Después")],
    ]);
    // The child keeps its own child: it moved up one level, no deeper.
    expect(blocks[1].children.map((child) => child.content)).toEqual([
      [text("Nieto")],
    ]);
    expect(blocks[2].children).toEqual([]);
    expect(blocks.some((block) => block.type === "image")).toBe(false);
  });

  it("does not count an image with no address against the cap", () => {
    const doc = [
      paragraph([text("Hola")]),
      ...Array.from({ length: COMUNICADO_MAX_IMAGES }, () =>
        image({ url: PLANO }),
      ),
      image({ url: "" }),
      image({ url: "" }),
    ];
    expect(ok(send(doc)).blocks).toHaveLength(1 + COMUNICADO_MAX_IMAGES);
  });

  it("refuses an image address or caption it cannot read", () => {
    for (const props of [
      { url: 3 },
      { url: { href: PLANO } },
      { url: PLANO, caption: 3 },
      { url: PLANO, caption: ["El plano"] },
    ]) {
      expect(refusal(draft([image(props)]))).toMatch(
        /No pudimos leer el texto/,
      );
    }
  });

  it("still asks for text before sending an image alone", () => {
    const doc = [image({ url: PLANO, caption: "El plano del armado" })];
    ok(draft(doc));
    expect(refusal(send(doc))).toBe("Escribí el texto del comunicado.");
  });

  it("prints an image as its caption in the plain text", () => {
    const { text: plain } = ok(
      send([
        paragraph([text("Mirá el plano:")]),
        image({ url: PLANO, caption: "El plano del armado" }),
        image({ url: AFICHE }),
        paragraph([text("Chau")]),
      ]),
    );
    expect(plain).toBe("Mirá el plano:\n\nEl plano del armado\n\nChau");
  });

  it("gives back the same blocks when it normalizes its own output", () => {
    // Every batch of a send normalizes the stored revision again.
    const { blocks } = ok(
      send([
        paragraph([text("Hola")]),
        image(
          { url: PLANO, caption: "El plano", name: "IMG_1.jpg" },
          {
            children: [paragraph([text("Debajo")])],
          },
        ),
        image({ url: AFICHE, showPreview: false }),
      ]),
    );
    expect(ok(send(blocks)).blocks).toEqual(blocks);
  });
});

describe("normalizeAnnouncementDoc: what the renderers get", () => {
  it("hands the announcement renderer blocks it can draw from a messy paste", async () => {
    // Raw, this throws inside BlockNote: the schema has no underline style.
    const pasted = [
      {
        type: "heading",
        props: { level: 2, textColor: "red", isToggleable: true },
        content: [text("Armado", { bold: true, underline: true })],
      },
      paragraph(
        [
          text("Llegá ", { textColor: "blue" }),
          text("temprano", { italic: true, strike: true }),
          {
            type: "link",
            href: "/my_participations",
            content: [text("tu reserva", { code: true })],
          },
        ],
        { props: { textAlignment: "center" } },
      ),
      { type: "divider" },
      paragraph([]),
    ];
    await expect(
      blocksToSanitizedHtml(pasted, "announcement"),
    ).rejects.toThrow();

    const { blocks } = ok(draft(pasted));
    const html = await blocksToSanitizedHtml(blocks, "announcement");

    expect(html).toContain("<h2><strong>Armado</strong></h2>");
    expect(html).toContain("<em>temprano</em>");
    expect(html).toContain('href="/my_participations"');
    expect(html).toContain("<hr />");
    expect(html).not.toMatch(/style=|data-|<details|<u>|<s>|<code/);
  });

  it("hands it pasted h1/h4 headings and a third list level it can draw", async () => {
    const pasted = [
      { type: "heading", props: { level: 1 }, content: [text("Grande")] },
      { type: "heading", props: { level: 4 }, content: [text("Chico")] },
      {
        type: "bulletListItem",
        content: [text("Uno")],
        children: [
          {
            type: "bulletListItem",
            content: [text("Dos")],
            children: [{ type: "bulletListItem", content: [text("Tres")] }],
          },
        ],
      },
    ];
    // Raw, the renderer's backstop refuses the levels.
    await expect(
      blocksToSanitizedHtml(pasted, "announcement"),
    ).rejects.toThrow();

    const html = await blocksToSanitizedHtml(
      ok(draft(pasted)).blocks,
      "announcement",
    );
    expect(html).toContain("<h2>Grande</h2>");
    expect(html).toContain("<h3>Chico</h3>");
    // "Tres" sits next to "Dos", not under it.
    expect(html).toContain(
      "<ul><li><p>Uno</p><ul><li><p>Dos</p></li><li><p>Tres</p></li></ul></li></ul>",
    );
  });

  it("hands it an uploaded image, with its caption as the figure and the alt", async () => {
    const pasted = [
      paragraph([text("Mirá el plano:")]),
      image({
        url: PLANO,
        caption: "El plano",
        name: "IMG_1234.jpg",
        showPreview: false,
        previewWidth: 512,
      }),
      image({ url: AFICHE, name: "afiche-final.png" }),
    ];
    // Raw, "show as a link" turns the image into a link to the file, and
    // the alt is the file name.
    const raw = await blocksToSanitizedHtml(pasted, "announcement");
    expect(raw).toContain(`<a href="${PLANO}">IMG_1234.jpg</a>`);
    expect(raw).toContain('alt="afiche-final.png"');

    const html = await blocksToSanitizedHtml(
      ok(send(pasted)).blocks,
      "announcement",
    );
    expect(html).toContain(
      `<figure><img src="${PLANO}" alt="El plano" /><figcaption>El plano</figcaption></figure>`,
    );
    // Without a caption there is no figure, and the alt says nothing rather
    // than a file name.
    expect(html).toContain(`<img src="${AFICHE}" alt="" />`);
    expect(html).not.toMatch(/IMG_1234|afiche-final|width=|data-|<a /);
  });

  it("leaves a draft's pasted image out of the inbox HTML", async () => {
    const { blocks } = ok(
      draft([
        paragraph([text("Hola")]),
        image({ url: PASTED, caption: "Afiche" }),
        image({ url: "http://x7a9.ufs.sh/f/plano-armado" }),
      ]),
    );
    expect(blocks).toHaveLength(3);

    const html = await blocksToSanitizedHtml(blocks, "announcement");
    expect(html).toBe("<p>Hola</p>");
  });
});
