// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "react-email";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  serverEnv: { VERCEL_ENV: "preview" as string },
}));
const { getCurrentUserProfileMock, featureFlagGuardMock } = vi.hoisted(() => ({
  getCurrentUserProfileMock: vi.fn(),
  featureFlagGuardMock: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => env);
// Only the preview action reads these.
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: getCurrentUserProfileMock,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  featureFlagGuard: featureFlagGuardMock,
}));

import ComunicadoEmail, {
  COMUNICADO_PREHEADER_MAX,
  COMUNICADO_STAGING_NOTE,
  type ComunicadoEmailProps,
  comunicadoPreheader,
} from "@/app/emails/comunicado";
import {
  announcementBlocksToEmail,
  comunicadoActionUrl,
  comunicadoEmailHref,
} from "@/app/emails/comunicado-blocks";
import {
  type AnnouncementBlock,
  type AnnouncementInline,
  type AnnouncementText,
  normalizeAnnouncementDoc,
} from "@/app/lib/comunicados/content";
import {
  COMUNICADOS_FROM,
  COMUNICADOS_FROM_STAGING,
  COMUNICADOS_REPLY_TO,
  comunicadoEmailSubject,
  renderComunicadoEmail,
} from "@/app/lib/comunicados/email";
import { renderComunicadoPreviewAction } from "@/app/lib/comunicados/preview-actions";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";

const BASE = "https://glitter.example";
const UNSUBSCRIBE = `${BASE}/email/unsubscribe?token=abc.def`;

function text(
  value: string,
  styles: AnnouncementText["styles"] = {},
): AnnouncementText {
  return { type: "text", text: value, styles };
}

function paragraph(...content: AnnouncementInline[]): AnnouncementBlock {
  return { type: "paragraph", props: {}, content, children: [] };
}

function linkTo(href: string, label = "el enlace"): AnnouncementInline {
  return { type: "link", href, content: [text(label)] };
}

/** Blocks as `normalizeAnnouncementDoc` returns them, from editor JSON. */
function normalized(raw: unknown[]) {
  const result = normalizeAnnouncementDoc(raw, { stage: "send" });
  if (!result.ok) throw new Error(result.message);
  return result.blocks;
}

const EVERY_BLOCK = normalized([
  {
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "Horario", styles: {} }],
  },
  {
    type: "heading",
    props: { level: 3 },
    content: [{ type: "text", text: "Sábado", styles: {} }],
  },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Llegá ", styles: {} },
      { type: "text", text: "temprano", styles: { bold: true } },
      { type: "text", text: " y ", styles: {} },
      { type: "text", text: "con calma", styles: { italic: true } },
      { type: "text", text: ". Revisá ", styles: {} },
      {
        type: "link",
        href: "/my_participations",
        content: [{ type: "text", text: "tu reserva", styles: {} }],
      },
      { type: "text", text: ".", styles: {} },
    ],
  },
  {
    type: "quote",
    content: [{ type: "text", text: "Nos vemos ahí", styles: {} }],
  },
  { type: "divider" },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Credencial", styles: {} }],
    children: [
      {
        type: "numberedListItem",
        content: [{ type: "text", text: "Impresa", styles: {} }],
      },
    ],
  },
  {
    type: "numberedListItem",
    content: [{ type: "text", text: "Primero", styles: {} }],
  },
]);

function emailProps(
  overrides: Partial<ComunicadoEmailProps> = {},
): ComunicadoEmailProps {
  return {
    greetingName: "Ana",
    title: "Cambio de horario de armado",
    blocks: EVERY_BLOCK,
    actionLabel: "Ver mi reserva",
    actionPath: "/my_participations",
    unsubscribeUrl: UNSUBSCRIBE,
    staging: false,
    baseUrl: BASE,
    ...overrides,
  };
}

function walk(blocks: AnnouncementBlock[], baseUrl = BASE) {
  return renderToStaticMarkup(
    <>{announcementBlocksToEmail(blocks, { baseUrl })}</>,
  ).replace(
    // React adds a preload hint per image to a fragment rendered on its
    // own; a whole email carries none (checked below).
    /<link rel="preload" as="image" href="[^"]*"\/>/g,
    "",
  );
}

function hrefs(html: string) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
    match[1]!.replaceAll("&amp;", "&"),
  );
}

const IMAGE = "https://abc123.ufs.sh/f/PLANO";
const OTHER_IMAGE = "https://utfs.io/f/CREDENCIAL";

function image(
  url: string,
  caption = "",
  children: AnnouncementBlock[] = [],
): AnnouncementBlock {
  return {
    type: "image",
    props: {
      url,
      caption,
      name: caption,
      textAlignment: "left",
      backgroundColor: "default",
    },
    children,
  };
}

/** Each `<img>`'s attributes, by name. */
function images(html: string) {
  return [...html.matchAll(/<img\b([^>]*?)\/?>/g)].map((match) =>
    Object.fromEntries(
      [...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [
        attribute[1]!,
        attribute[2]!.replaceAll("&amp;", "&"),
      ]),
    ),
  );
}

function renderInput(
  overrides: Partial<Parameters<typeof renderComunicadoEmail>[0]> = {},
) {
  return renderComunicadoEmail({
    title: "Cambio de horario de armado",
    blocks: EVERY_BLOCK,
    actionLabel: "Ver mi reserva",
    actionPath: "/my_participations",
    greetingName: "Ana",
    unsubscribeUrl: UNSUBSCRIBE,
    staging: false,
    test: false,
    baseUrl: BASE,
    ...overrides,
  });
}

beforeEach(() => {
  env.serverEnv.VERCEL_ENV = "preview";
  getCurrentUserProfileMock.mockResolvedValue({
    id: 42,
    role: "admin",
    email: "dennis@gmail.com",
    displayName: null,
    firstName: "Dennis",
    lastName: null,
  });
  featureFlagGuardMock.mockResolvedValue(null);
});

describe("announcementBlocksToEmail", () => {
  it("makes Glitter paths absolute by concatenation, never by URL resolution", () => {
    // A base with a path, and a path with dot segments and a query: new
    // URL(href, base) would drop "/app" and collapse "/foo/..".
    const html = walk(
      [paragraph(linkTo("/foo/../my_participations?tab=1&x=2#arriba"))],
      "https://glitter.example/app/",
    );
    expect(hrefs(html)).toEqual([
      "https://glitter.example/app/foo/../my_participations?tab=1&x=2#arriba",
    ]);
    expect(html).not.toContain(
      'href="https://glitter.example/my_participations',
    );
  });

  it("keeps https and mailto links as written", () => {
    const html = walk([
      paragraph(
        linkTo("https://maps.example/armado"),
        text(" o "),
        linkTo("mailto:soporte@productoraglitter.com"),
      ),
    ]);
    expect(hrefs(html)).toEqual([
      "https://maps.example/armado",
      "mailto:soporte@productoraglitter.com",
    ]);
    // A pasted space cannot move the host, so it is encoded, not dropped.
    expect(
      comunicadoEmailHref("https://drive.example/mi archivo.pdf", BASE),
    ).toBe("https://drive.example/mi%20archivo.pdf");
  });

  it("leaves a link that would leave Glitter as plain words", () => {
    for (const href of [
      "//evil.example/x",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/ espacio",
      "javascript:alert(1)",
      "data:text/html,hola",
      "relative/path",
      "https://evil.example/\tx",
    ]) {
      const html = walk([paragraph(linkTo(href, "mirá esto"))]);
      expect(html, href).not.toContain("<a");
      expect(html, href).toContain("mirá esto");
    }
    expect(comunicadoEmailHref("//evil.example", BASE)).toBeNull();
    expect(comunicadoActionUrl("https://evil.example", BASE)).toBeNull();
    expect(comunicadoActionUrl("/my_credits", `${BASE}/`)).toBe(
      `${BASE}/my_credits`,
    );
  });

  it("renders every block with its own email markup and inline styles", () => {
    const html = walk(EVERY_BLOCK);

    expect(html).toMatch(/<h2 style="[^"]+">Horario<\/h2>/);
    expect(html).toMatch(/<h3 style="[^"]+">Sábado<\/h3>/);
    expect(html).toMatch(/<p style="[^"]+">Llegá <strong>temprano<\/strong>/);
    expect(html).toContain("<em>con calma</em>");
    expect(html).toContain(`href="${BASE}/my_participations"`);
    // The quote: a table with a left border, as mail clients draw it.
    expect(html).toMatch(
      /<table[^>]*style="[^"]*border-left:3px solid[^"]*"[^>]*>.*Nos vemos ahí/,
    );
    expect(html).toMatch(/<hr style="[^"]+"\/>/);
    expect(html).toMatch(
      /<ul style="[^"]*padding:0 0 0 24px[^"]*"><li style="[^"]+">Credencial<ol style="[^"]+"><li style="[^"]+">Impresa<\/li><\/ol><\/li><\/ul>/,
    );
    // A numbered item after a bullet run starts its own list, as the text
    // part counts it.
    expect(html).toMatch(
      /<\/ul><ol style="[^"]+"><li style="[^"]+">Primero<\/li><\/ol>/,
    );
  });

  it("never emits details, input, figure or pre, nor a class or a stylesheet", async () => {
    // A captioned image too: the inbox draws it as a figure.
    const html = await render(
      ComunicadoEmail(
        emailProps({
          staging: true,
          blocks: [...EVERY_BLOCK, image(IMAGE, "El plano"), image(IMAGE)],
        }),
      ),
    );
    expect(html).toContain(`src="${IMAGE}"`);
    for (const tag of ["details", "input", "figure", "pre", "style"]) {
      expect(html, tag).not.toMatch(new RegExp(`<${tag}\\b`, "i"));
    }
    expect(html).not.toContain("<figcaption");
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/\sclass(Name)?=/);
    // Every element the walker writes carries its own style.
    for (const tag of [
      "h1",
      "h2",
      "h3",
      "p",
      "ul",
      "ol",
      "li",
      "hr",
      "a",
      "img",
    ]) {
      expect(html, tag).not.toMatch(
        new RegExp(`<${tag}(?![^>]*\\sstyle=)[\\s>]`),
      );
    }
  });

  it("renders the text nested under a divider after the line", () => {
    const blocks = normalized([
      {
        type: "divider",
        children: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Debajo", styles: {} }],
          },
        ],
      },
    ]);
    expect(blocks[0]?.children).toHaveLength(1);

    expect(walk(blocks)).toMatch(
      /^<hr style="[^"]+"\/><table[^>]*><tbody><tr><td style="padding:0 0 0 16px"><p style="[^"]+">Debajo<\/p>/,
    );
  });

  it("links the address the inbox and the text part show, a pasted space included", async () => {
    const blocks = normalized([
      {
        type: "paragraph",
        content: [
          {
            type: "link",
            href: "/mis cosas",
            content: [{ type: "text", text: "tus cosas", styles: {} }],
          },
          { type: "text", text: " y ", styles: {} },
          {
            type: "link",
            href: "https://drive.example/mi archivo.pdf",
            content: [{ type: "text", text: "el archivo", styles: {} }],
          },
        ],
      },
    ]);
    const inbox = await blocksToSanitizedHtml(blocks, "announcement");
    const email = await renderInput({ blocks });

    expect(hrefs(inbox)).toEqual([
      "/mis%20cosas",
      "https://drive.example/mi%20archivo.pdf",
    ]);
    const linked = [
      `${BASE}/mis%20cosas`,
      "https://drive.example/mi%20archivo.pdf",
    ];
    expect(hrefs(walk(blocks))).toEqual(linked);
    expect(email.text).toContain(
      `tus cosas (${linked[0]}) y el archivo (${linked[1]})`,
    );
  });

  it("turns a soft line break into <br> and drops empty paragraphs", () => {
    const html = walk([
      paragraph(text("Línea uno\nLínea dos")),
      paragraph(text("   ")),
      paragraph(),
      paragraph(text("Después")),
    ]);
    expect(html).toContain("Línea uno<br/>Línea dos");
    expect(html.match(/<p\b/g)).toHaveLength(2);
  });

  it("refuses a block type it has no email markup for", () => {
    expect(() =>
      walk([
        {
          type: "table",
          props: {},
          children: [],
        } as unknown as AnnouncementBlock,
      ]),
    ).toThrow(/table/);
  });

  it("draws an uploaded image at the body's width, with its caption as the alt", () => {
    const blocks = normalized([
      { type: "paragraph", content: "Así queda el armado:" },
      { type: "image", props: { url: IMAGE, caption: "El plano" } },
      { type: "image", props: { url: OTHER_IMAGE } },
    ]);
    const html = walk(blocks);

    expect(images(html)).toEqual([
      expect.objectContaining({ src: IMAGE, alt: "El plano", width: "430" }),
      expect.objectContaining({ src: OTHER_IMAGE, alt: "", width: "430" }),
    ]);
    for (const { style } of images(html)) {
      // The pixel width is for Outlook; the rest scale it down on a phone.
      expect(style).toContain("display:block");
      expect(style).toContain("width:100%");
      expect(style).toContain("max-width:430px");
      expect(style).toContain("height:auto");
    }
    // Only the address, the alt, the width and the style: no lazy loading.
    expect(Object.keys(images(html)[0]!).sort()).toEqual([
      "alt",
      "src",
      "style",
      "width",
    ]);
    expect(html).toMatch(/Así queda el armado:<\/p><img /);
  });

  it("leaves out an image not uploaded to Glitter, but not what is nested under it", () => {
    for (const url of [
      "https://evil.example/plano.png",
      "http://abc123.ufs.sh/f/PLANO",
      "https://abc123.ufs.sh/f/PLANO?w=1",
      "https://abc123.ufs.sh/f/PLANO#x",
      "https://abc123.ufs.sh:8443/f/PLANO",
      "https://abc123.ufs.sh/a/PLANO",
      "https://ufs.sh.evil.example/f/PLANO",
      "//abc123.ufs.sh/f/PLANO",
      "data:image/png;base64,iVBORw0KGgo=",
      "javascript:alert(1)",
      "",
    ]) {
      const html = walk([
        image(url, "Ajena", [paragraph(text("Debajo de la imagen"))]),
      ]);
      expect(html, url).not.toContain("<img");
      expect(html, url).not.toContain("Ajena");
      expect(html, url).toContain("Debajo de la imagen");
    }
  });

  it("renders what is nested under an image after it, and an image nested in a list inside its item", () => {
    expect(walk([image(IMAGE, "", [paragraph(text("Debajo"))])])).toMatch(
      /^<img [^>]*\/><table[^>]*><tbody><tr><td style="padding:0 0 0 16px"><p style="[^"]+">Debajo<\/p>/,
    );

    const list = walk(
      normalized([
        {
          type: "bulletListItem",
          content: "Tu puesto",
          children: [{ type: "image", props: { url: IMAGE } }],
        },
      ]),
    );
    expect(list).toMatch(/<li style="[^"]+">Tu puesto<img [^>]*\/><\/li>/);
  });

  it("gives an image the alt text the inbox gives it", async () => {
    const blocks = normalized([
      { type: "paragraph", content: "Mirá el plano" },
      { type: "image", props: { url: IMAGE, caption: "El plano" } },
      { type: "image", props: { url: OTHER_IMAGE } },
    ]);
    const inbox = images(await blocksToSanitizedHtml(blocks, "announcement"));
    const email = images(walk(blocks));

    expect(inbox.map(({ src, alt }) => ({ src, alt }))).toEqual(
      email.map(({ src, alt }) => ({ src, alt })),
    );
  });
});

describe("ComunicadoEmail", () => {
  it("opens with the greeting, then the title, the text and the button", async () => {
    const html = await render(ComunicadoEmail(emailProps()));
    const greeting = html.indexOf("¡Hola Ana!");
    const title = html.search(/<h1[^>]*>Cambio de horario de armado<\/h1>/);
    const body = html.indexOf("Horario</h2>");
    const button = html.indexOf(
      `href="${BASE}/my_participations" style="line-height:100%`,
    );
    expect(greeting).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(greeting);
    expect(body).toBeGreaterThan(title);
    expect(button).toBeGreaterThan(body);
    expect(html).toContain(">Ver mi reserva<");
    expect(html).toContain(`href="${UNSUBSCRIBE.replace("&", "&amp;")}"`);
  });

  it("greets without a name when there is none", async () => {
    const html = await render(
      ComunicadoEmail(emailProps({ greetingName: null })),
    );
    expect(html).toContain("¡Hola!");
    expect(html).not.toContain("¡Hola !");
  });

  it("shows the button only with a label and a Glitter path", async () => {
    for (const overrides of [
      { actionLabel: null },
      { actionLabel: "   " },
      { actionPath: null },
      { actionPath: "//evil.example" },
      { actionPath: "https://evil.example" },
      { actionPath: "/\t/evil.example" },
    ]) {
      const html = await render(ComunicadoEmail(emailProps(overrides)));
      expect(html, JSON.stringify(overrides)).not.toContain("Ver mi reserva<");
      expect(html).not.toContain("evil.example");
    }
  });

  it("previews the excerpt, cut to 120 characters on a word", async () => {
    const long = "Palabra ".repeat(40).trim();
    const preheader = comunicadoPreheader(long);
    expect(preheader.length).toBeLessThanOrEqual(COMUNICADO_PREHEADER_MAX);
    expect(preheader).toMatch(/Palabra…$/);
    expect(comunicadoPreheader("Corto  y\n\nclaro")).toBe("Corto y claro");

    const html = await render(
      ComunicadoEmail(
        emailProps({
          blocks: normalized([{ type: "paragraph", content: long }]),
        }),
      ),
    );
    expect(html).toContain(`data-skip-in-text="true">${preheader}<`);
  });
});

describe("renderComunicadoEmail", () => {
  it("greets through safeGreetingName: anything that is not plainly a name says ¡Hola!", async () => {
    expect(
      (await renderInput({ greetingName: "  Ana   María " })).html,
    ).toContain("¡Hola Ana María!");
    for (const name of [
      "visita evil.com",
      "<b>Ana</b>",
      "https://evil.example",
      "Ana: entrá a este link",
      "",
      null,
    ]) {
      const email = await renderInput({ greetingName: name });
      expect(email.html, String(name)).toContain("¡Hola!");
      expect(email.text.startsWith("¡Hola!\n\n"), String(name)).toBe(true);
      expect(email.html).not.toContain("evil");
    }
  });

  it("adds the essential note and the staging note above the unsubscribe line", async () => {
    const email = await renderInput({
      essentialFestivalName: "Glitter Navidad 2026",
      staging: true,
    });
    const essential =
      "Es un correo esencial sobre tu participación en Glitter Navidad 2026: llega también a quienes se dieron de baja de los anuncios.";
    const essentialAt = email.html.indexOf(essential);
    const stagingAt = email.html.indexOf(COMUNICADO_STAGING_NOTE);
    expect(essentialAt).toBeGreaterThan(-1);
    expect(stagingAt).toBeGreaterThan(essentialAt);
    expect(email.html.indexOf("Darme de baja")).toBeGreaterThan(stagingAt);
    expect(email.text).toContain(essential);
    expect(email.text).toContain(COMUNICADO_STAGING_NOTE);

    const plain = await renderInput();
    expect(plain.html).not.toContain("Es un correo esencial");
    expect(plain.html).not.toContain(COMUNICADO_STAGING_NOTE);
    expect(plain.text).not.toContain("entorno de prueba");
  });

  it("marks staging mail in the From name and the subject", async () => {
    const preview = await renderInput({ staging: true });
    expect(preview.from).toBe(COMUNICADOS_FROM_STAGING);
    expect(preview.from).toBe(
      "Productora Glitter (prueba) <anuncios@productoraglitter.com>",
    );
    expect(preview.subject).toBe("[Prev] Cambio de horario de armado");
    expect(preview.replyTo).toBe(COMUNICADOS_REPLY_TO);
    expect(COMUNICADOS_REPLY_TO).toBe("soporte@productoraglitter.com");

    expect((await renderInput({ staging: true, test: true })).subject).toBe(
      "[Prev] [Prueba] Cambio de horario de armado",
    );

    env.serverEnv.VERCEL_ENV = "development";
    expect((await renderInput({ staging: true, test: true })).subject).toBe(
      "[Dev] [Prueba] Cambio de horario de armado",
    );

    env.serverEnv.VERCEL_ENV = "production";
    const production = await renderInput({ test: true });
    expect(production.from).toBe(
      "Productora Glitter <anuncios@productoraglitter.com>",
    );
    expect(production.from).toBe(COMUNICADOS_FROM);
    expect(production.subject).toBe("[Prueba] Cambio de horario de armado");
    expect((await renderInput()).subject).toBe("Cambio de horario de armado");
  });

  it("builds the subject from the title, the test mark and the label", () => {
    expect(
      comunicadoEmailSubject("  Hola  ", { test: false, envLabel: "" }),
    ).toBe("Hola");
    expect(comunicadoEmailSubject("Hola", { test: true, envLabel: "" })).toBe(
      "[Prueba] Hola",
    );
    expect(
      comunicadoEmailSubject("Hola", { test: false, envLabel: "[Prev]" }),
    ).toBe("[Prev] Hola");
    expect(
      comunicadoEmailSubject("Hola", { test: true, envLabel: "[Prev]" }),
    ).toBe("[Prev] [Prueba] Hola");
  });

  it("writes the text part with URLs, the button and the unsubscribe link last", async () => {
    const email = await renderInput({ baseUrl: `${BASE}/` });
    expect(email.text).toBe(
      [
        "¡Hola Ana!",
        "Cambio de horario de armado",
        "Horario",
        "Sábado",
        `Llegá temprano y con calma. Revisá tu reserva (${BASE}/my_participations).`,
        "Nos vemos ahí",
        "—",
        "• Credencial\n  1. Impresa\n1. Primero",
        `Ver mi reserva: ${BASE}/my_participations`,
        `Darme de baja: ${UNSUBSCRIBE}`,
      ].join("\n\n"),
    );

    const withImages = await renderInput({
      blocks: [
        paragraph(text("Así queda el armado:")),
        image(IMAGE, "El plano"),
        image(OTHER_IMAGE),
      ],
      actionLabel: null,
    });
    expect(
      images(withImages.html)
        .map(({ src }) => src)
        // The header's and the footer's logos aside.
        .filter((src) => src === IMAGE || src === OTHER_IMAGE),
    ).toEqual([IMAGE, OTHER_IMAGE]);
    // An image is its caption in the text part, or nothing.
    expect(withImages.text).toBe(
      [
        "¡Hola Ana!",
        "Cambio de horario de armado",
        "Así queda el armado:",
        "El plano",
        `Darme de baja: ${UNSUBSCRIBE}`,
      ].join("\n\n"),
    );

    const noButton = await renderInput({ actionPath: "//evil.example" });
    expect(noButton.text).not.toContain("Ver mi reserva");
    expect(noButton.text).not.toContain("evil");
  });
});

describe("renderComunicadoPreviewAction", () => {
  const draft = {
    title: "",
    doc: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Un borrador ", styles: { underline: true } },
          {
            type: "link",
            href: "/my_participations",
            content: [{ type: "text", text: "a medias", styles: {} }],
          },
        ],
      },
      { type: "divider" },
    ],
    actionLabel: "Ver mi reserva",
    actionPath: null,
  };

  it("previews a half-written draft: detail, excerpt and the admin's email", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", BASE);
    const result = await renderComunicadoPreviewAction(draft);
    vi.unstubAllEnvs();
    if (!result.success) throw new Error(result.message);

    expect(result.detailHtml).toContain('href="/my_participations"');
    expect(result.detailHtml).toContain("<hr");
    expect(result.detailHtml).not.toMatch(/<u>|underline/);
    expect(result.excerpt).toBe("Un borrador a medias —");

    expect(result.email.subject).toBe("[Prev] Sin título");
    expect(result.email.from).toBe(COMUNICADOS_FROM_STAGING);
    expect(result.email.html).toContain("¡Hola Dennis!");
    expect(result.email.html).toContain(`href="${BASE}/my_participations"`);
    // Its unsubscribe link is one the page refuses.
    expect(result.email.html).toContain(
      `href="${BASE}/email/unsubscribe?token=preview"`,
    );
    // Half a button is no button.
    expect(result.email.html).not.toContain("Ver mi reserva<");
  });

  it("explains a refused draft, and refuses anyone but a global admin with the flag", async () => {
    expect(
      await renderComunicadoPreviewAction({
        ...draft,
        doc: [{ type: "table", content: [] }],
      }),
    ).toEqual({
      success: false,
      message: "Este bloque no se puede usar en un comunicado: tabla.",
    });

    featureFlagGuardMock.mockResolvedValue({
      success: false,
      message: "Esta funcionalidad no está disponible",
    });
    expect((await renderComunicadoPreviewAction(draft)).success).toBe(false);

    getCurrentUserProfileMock.mockResolvedValue({
      id: 3,
      role: "festival_admin",
    });
    expect(await renderComunicadoPreviewAction(draft)).toEqual({
      success: false,
      message: "No autorizado.",
    });
  });
});
