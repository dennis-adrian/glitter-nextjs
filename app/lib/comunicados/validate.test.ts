// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: { VERCEL_ENV: "preview" } }));

import {
  COMUNICADO_DOC_MAX_BYTES,
  COMUNICADO_MAX_BLOCKS,
  COMUNICADO_TEXT_MAX,
} from "@/app/lib/comunicados/definitions";
import {
  COMUNICADO_EMAIL_TOO_LARGE_MESSAGE,
  type ComunicadoSendCheckInput,
  validateComunicadoForSend,
} from "@/app/lib/comunicados/validate";

/** A real preview deployment's host is about this long. */
const PREVIEW_BASE =
  "https://glitter-nextjs-git-claude-comunicados-writing-dennis-adrian.vercel.app";

function paragraph(content: unknown) {
  return { type: "paragraph", content };
}

const DOC = [
  {
    type: "paragraph",
    props: { textColor: "red", textAlignment: "center" },
    content: [
      {
        type: "text",
        text: "El armado se adelanta.",
        styles: { underline: true },
      },
    ],
  },
  paragraph(""),
];

function input(
  overrides: Partial<ComunicadoSendCheckInput> = {},
): ComunicadoSendCheckInput {
  return {
    title: "  Cambio de horario de armado  ",
    doc: DOC,
    actionLabel: " Ver mi reserva ",
    actionPath: " /my_participations ",
    essential: false,
    essentialReason: null,
    sendEmail: true,
    ...overrides,
  };
}

async function refusal(overrides: Partial<ComunicadoSendCheckInput>) {
  const result = await validateComunicadoForSend(input(overrides));
  if (result.ok) throw new Error("expected a refusal");
  return result.message;
}

/**
 * Within every limit of the document (64 KB of JSON, as it comes in and as
 * it is stored, 200 blocks, 5,000 characters), yet over 90 KB once each
 * one-letter link is an absolute URL with its inline style.
 */
function heavyDoc() {
  const blocks: unknown[] = [];
  let index = 0;
  const size = () => JSON.stringify(blocks).length;
  while (size() < COMUNICADO_DOC_MAX_BYTES - 2_000) {
    const links = Array.from({ length: 20 }, () => {
      index += 1;
      return {
        type: "link",
        href: `/my_participations/${index}`,
        content: [{ type: "text", text: "x", styles: {} }],
      };
    });
    // With the props and children it is stored with, so it measures the same
    // normalized (C2 step 1).
    blocks.push({
      ...paragraph(links),
      props: {
        backgroundColor: "default",
        textColor: "default",
        textAlignment: "left",
      },
      children: [],
    });
  }
  return blocks;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", PREVIEW_BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateComunicadoForSend", () => {
  it("returns the comunicado as the send writes it", async () => {
    const result = await validateComunicadoForSend(input());
    expect(result).toEqual({
      ok: true,
      title: "Cambio de horario de armado",
      blocks: [
        {
          type: "paragraph",
          props: {
            backgroundColor: "default",
            textColor: "default",
            textAlignment: "left",
          },
          content: [
            { type: "text", text: "El armado se adelanta.", styles: {} },
          ],
          children: [],
        },
      ],
      text: "El armado se adelanta.",
      actionLabel: "Ver mi reserva",
      actionPath: "/my_participations",
      essentialReason: null,
    });
  });

  it("asks for a one-line title of 1 to 80 characters", async () => {
    expect(await refusal({ title: "   " })).toBe("Escribí un título.");
    expect(await refusal({ title: "x".repeat(81) })).toBe(
      "El título puede tener hasta 80 caracteres.",
    );
    expect(await refusal({ title: "Línea uno\nLínea dos" })).toBe(
      "El título va en una sola línea.",
    );
    const ok = await validateComunicadoForSend(
      input({ title: "x".repeat(80) }),
    );
    expect(ok.ok).toBe(true);
  });

  it("checks the text at the send stage, which a draft does not need", async () => {
    expect(await refusal({ doc: [] })).toBe("Escribí el texto del comunicado.");
    expect(await refusal({ doc: [paragraph("   ")] })).toBe(
      "Escribí el texto del comunicado.",
    );
    expect(await refusal({ doc: "<p>html</p>" })).toMatch(
      /No pudimos leer el texto/,
    );
    expect(
      await refusal({ doc: [paragraph("x".repeat(COMUNICADO_TEXT_MAX + 1))] }),
    ).toBe("El texto puede tener hasta 5.000 caracteres.");
    expect(await refusal({ doc: [{ type: "table", content: [] }] })).toBe(
      "Este bloque no se puede usar en un comunicado: tabla.",
    );
    expect(
      await refusal({
        doc: [
          paragraph([
            {
              type: "link",
              href: "javascript:alert(1)",
              content: [{ type: "text", text: "acá", styles: {} }],
            },
          ]),
        ],
      }),
    ).toMatch(/^Revisá el enlace «javascript:alert\(1\)»/);
  });

  it("takes the button whole or not at all, with a Glitter path", async () => {
    expect(await refusal({ actionPath: null })).toBe(
      "Falta la página de Glitter del botón.",
    );
    expect(await refusal({ actionLabel: "  " })).toBe(
      "Falta el texto del botón.",
    );
    expect(await refusal({ actionLabel: "x".repeat(31) })).toBe(
      "El texto del botón puede tener hasta 30 caracteres.",
    );
    expect(await refusal({ actionPath: "/my participations" })).toBe(
      "La dirección no puede tener espacios.",
    );
    expect(await refusal({ actionPath: "//evil.example" })).toMatch(
      /^Pegá un enlace de Glitter/,
    );
    expect(await refusal({ actionPath: "https://evil.example" })).toMatch(
      /^Pegá un enlace de Glitter/,
    );

    const none = await validateComunicadoForSend(
      input({ actionLabel: " ", actionPath: "" }),
    );
    expect(none).toMatchObject({
      ok: true,
      actionLabel: null,
      actionPath: null,
    });
  });

  it("asks an essential comunicado why, in 10 to 300 characters", async () => {
    const reason = "El armado se adelanta por la lluvia";
    expect(await refusal({ essential: true, essentialReason: null })).toBe(
      "Contá por qué es esencial, en al menos 10 caracteres.",
    );
    expect(
      await refusal({ essential: true, essentialReason: "  123456789  " }),
    ).toBe("Contá por qué es esencial, en al menos 10 caracteres.");
    expect(
      await refusal({ essential: true, essentialReason: "x".repeat(301) }),
    ).toBe("El motivo puede tener hasta 300 caracteres.");

    expect(
      await validateComunicadoForSend(
        input({ essential: true, essentialReason: ` ${reason} ` }),
      ),
    ).toMatchObject({ ok: true, essentialReason: reason });
    expect(
      await validateComunicadoForSend(
        input({ essential: true, essentialReason: "x".repeat(10) }),
      ),
    ).toMatchObject({ ok: true });
    // Not essential: a leftover reason is neither checked nor kept.
    expect(
      await validateComunicadoForSend(input({ essentialReason: "x" })),
    ).toMatchObject({ ok: true, essentialReason: null });
  });

  it("refuses an email Gmail would clip, measured on the rendered email", async () => {
    const doc = heavyDoc();
    // The document itself is within every limit of its own.
    expect(JSON.stringify(doc).length).toBeLessThan(COMUNICADO_DOC_MAX_BYTES);
    expect(doc.length).toBeLessThanOrEqual(COMUNICADO_MAX_BLOCKS);

    expect(await refusal({ doc })).toBe(COMUNICADO_EMAIL_TOO_LARGE_MESSAGE);
    expect(COMUNICADO_EMAIL_TOO_LARGE_MESSAGE).toBe(
      "El correo quedaría demasiado largo y Gmail lo cortaría. Acortá el texto o sacá alguna imagen.",
    );

    // Without email there is nothing for Gmail to clip.
    expect(
      await validateComunicadoForSend(input({ doc, sendEmail: false })),
    ).toMatchObject({ ok: true });
  });

  it("refuses the title before the text, and the text before the button", async () => {
    expect(
      await refusal({ title: "", doc: [], actionPath: "//evil.example" }),
    ).toBe("Escribí un título.");
    expect(await refusal({ doc: [], actionPath: "//evil.example" })).toBe(
      "Escribí el texto del comunicado.",
    );
  });
});
