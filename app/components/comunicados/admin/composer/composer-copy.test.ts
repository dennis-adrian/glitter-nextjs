import { describe, expect, it } from "vitest";

import {
  emailChannelLine,
  missingForSend,
  narrowedNote,
  overlapText,
  realSkippedCount,
  textCounterText,
} from "@/app/components/comunicados/admin/composer/composer-copy";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";

function preview(
  email: Partial<ComunicadoAudiencePreview["email"]> = {},
  overrides: Partial<ComunicadoAudiencePreview> = {},
): ComunicadoAudiencePreview {
  return {
    sources: [],
    matched: 1_240,
    eligible: 1_240,
    overlap: 0,
    skipped: [],
    skippedTotal: 0,
    willReceive: 1_240,
    email: {
      sendTo: 1_240,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
      essentialOverride: 0,
      ...email,
    },
    pushDevices: 0,
    pushSubscriptions: 0,
    tooLarge: false,
    narrowed: false,
    stagingAdmins: 0,
    essentialAllowed: { ok: false, reason: null, festival: null },
    ...overrides,
  };
}

describe("emailChannelLine", () => {
  it("reads as G4 words it, with every clause", () => {
    expect(
      emailChannelLine(
        preview({
          sendTo: 1_194,
          unsubscribedAnnouncements: 30,
          unsubscribedAll: 4,
          suppressed: 12,
        }),
      ),
    ).toBe(
      "1.194 de 1.240. No les llega a 30 que se dieron de baja de los anuncios, a 4 que pidieron no recibir ningún correo masivo ni a 12 con el correo bloqueado.",
    );
  });

  it("leaves out the clauses with nobody, and keeps the grammar", () => {
    expect(emailChannelLine(preview({ sendTo: 1_228, suppressed: 12 }))).toBe(
      "1.228 de 1.240. No les llega a 12 con el correo bloqueado.",
    );
    expect(
      emailChannelLine(
        preview({
          sendTo: 1_235,
          unsubscribedAnnouncements: 1,
          unsubscribedAll: 4,
        }),
      ),
    ).toBe(
      "1.235 de 1.240. No les llega a 1 que se dio de baja de los anuncios ni a 4 que pidieron no recibir ningún correo masivo.",
    );
    expect(emailChannelLine(preview())).toBe("1.240 de 1.240.");
  });

  it("counts addresses that are not valid, so the split adds up", () => {
    expect(emailChannelLine(preview({ sendTo: 1_238, invalid: 2 }))).toBe(
      "1.238 de 1.240. No les llega a 2 con un correo que no es válido.",
    );
  });

  it("says when nobody can receive it", () => {
    expect(emailChannelLine(preview({ sendTo: 0 }, { willReceive: 0 }))).toBe(
      "Nadie de esta audiencia puede recibirlo.",
    );
  });
});

describe("the summary's numbers", () => {
  it("formats counters and overlaps", () => {
    expect(textCounterText(1_204)).toBe("1.204/5.000");
    expect(overlapText(85)).toBe(
      "85 están en más de una lista (cuentan una vez)",
    );
    expect(overlapText(1)).toBe("1 está en más de una lista (cuenta una vez)");
  });

  it("tells real skips from the preview narrowing", () => {
    const narrowed = preview(
      {},
      {
        skipped: [
          { reason: "Entorno de prueba: no se envía a listas", count: 300 },
          { reason: "Perfil no verificado", count: 8 },
        ],
        skippedTotal: 308,
        narrowed: true,
        willReceive: 4,
      },
    );
    expect(realSkippedCount(narrowed)).toBe(8);
    expect(narrowedNote(narrowed, "preview", false)).toBe(
      "Estás en un entorno de prueba: lo recibirían 4 personas, los administradores en lugar de las listas.",
    );
    expect(narrowedNote(narrowed, "development", true)).toBe(
      "Estás en un entorno de prueba: lo recibirían 4 personas, los administradores en lugar de las listas, y las personas elegidas por nombre. En desarrollo no se envían correos.",
    );
  });
});

describe("missingForSend", () => {
  const ready = {
    title: "Cambio de horario",
    text: "El armado empieza a las 7.",
    audienceEmpty: false,
    action: { enabled: false, label: "", path: "" },
    essential: { on: false, reason: "" },
  };

  it("is empty when it could be sent", () => {
    expect(missingForSend(ready)).toEqual([]);
  });

  it("lists a title, the text and a recipient in G4's order", () => {
    expect(
      missingForSend({ ...ready, title: "   ", text: "", audienceEmpty: true }),
    ).toEqual(["un título", "el texto", "al menos un destinatario"]);
  });

  it("asks for the other half of a button and for the essential reason", () => {
    expect(
      missingForSend({
        ...ready,
        action: { enabled: true, label: "Ver", path: "" },
        essential: { on: true, reason: "corto" },
      }),
    ).toEqual(["la página del botón", "por qué es esencial"]);
    // An empty pair is no button at all.
    expect(
      missingForSend({
        ...ready,
        action: { enabled: true, label: "", path: "" },
      }),
    ).toEqual([]);
  });
});
