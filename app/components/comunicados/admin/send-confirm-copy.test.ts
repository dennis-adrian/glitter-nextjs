import { describe, expect, it } from "vitest";

import {
  confirmCallouts,
  confirmRows,
  confirmTitle,
  PUSH_CALLOUT_TEXT,
  typedCount,
  typedMatches,
  typedPrompt,
} from "@/app/components/comunicados/admin/send-confirm-copy";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import type { ComunicadoSendConfirmation } from "@/app/lib/comunicados/contracts";
import { COMUNICADO_SKIP_REASONS } from "@/app/lib/comunicados/skip-reasons";

function preview(
  overrides: Partial<Omit<ComunicadoAudiencePreview, "email">> & {
    email?: Partial<ComunicadoAudiencePreview["email"]>;
  } = {},
): ComunicadoAudiencePreview {
  const { email, ...rest } = overrides;
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
    ...rest,
  };
}

function confirmation(
  overrides: Partial<ComunicadoSendConfirmation> = {},
): ComunicadoSendConfirmation {
  return {
    comunicadoId: 7,
    version: 3,
    title: "Cambio de horario de armado",
    sendEmail: true,
    sendPush: false,
    essential: false,
    essentialReason: null,
    essentialFestivalName: null,
    preview: preview(),
    pickedReceiving: { count: 0, names: [] },
    typedRequired: false,
    env: "production",
    notificationsLaunched: true,
    problem: null,
    ...overrides,
  };
}

const { staging, not_verified, banned, not_participant, deletion_pending } =
  COMUNICADO_SKIP_REASONS;

function values(c: ComunicadoSendConfirmation) {
  return Object.fromEntries(
    confirmRows(c).map((row) => [row.label, row.value]),
  );
}

function environment(c: ComunicadoSendConfirmation) {
  return confirmCallouts(c).find((callout) => callout.kind === "environment")
    ?.text;
}

function essential(c: ComunicadoSendConfirmation) {
  return confirmCallouts(c).find((callout) => callout.kind === "essential")
    ?.text;
}

/** A preview where the lists went to 4 admins and two picked people get it. */
const NARROWED = preview({
  narrowed: true,
  stagingAdmins: 4,
  willReceive: 6,
  skipped: [{ reason: staging, count: 1_236 }],
  skippedTotal: 1_236,
});
const TWO_PICKED = { count: 2, names: ["Ana Pérez", "Luis Rojas"] };

describe("confirmRows", () => {
  it("reads as G5 lays it out, every clause in", () => {
    const rows = confirmRows(
      confirmation({
        sendPush: true,
        preview: preview({
          eligible: 1_240,
          willReceive: 1_240,
          email: {
            sendTo: 1_194,
            unsubscribedAnnouncements: 30,
            unsubscribedAll: 4,
            suppressed: 12,
          },
          pushDevices: 352,
          pushSubscriptions: 410,
          skipped: [
            { reason: not_verified, count: 8 },
            { reason: banned, count: 4 },
            { reason: not_participant, count: 2 },
          ],
          skippedTotal: 14,
        }),
      }),
    );
    expect(rows).toEqual([
      { label: "Pueden recibirlo hoy", value: "1.240 personas", strong: true },
      { label: "En la app", value: "1.240" },
      {
        label: "Por correo",
        value:
          "1.194 · 30 dados de baja de los anuncios · 4 sin correos masivos · 12 con el correo bloqueado",
      },
      { label: "En el dispositivo", value: "352 personas (410 dispositivos)" },
      {
        label: "No lo reciben",
        value:
          "14 · 8 perfiles no verificados · 4 cuentas suspendidas · 2 no son participantes",
      },
    ]);
  });

  it("says No for a channel that is not ticked", () => {
    const rows = values(confirmation({ sendEmail: false, sendPush: false }));
    expect(rows["Por correo"]).toBe("No");
    expect(rows["En el dispositivo"]).toBe("No");
  });

  it("keeps the zeros where the number is all there is, and leaves out empty clauses", () => {
    const rows = values(
      confirmation({
        sendPush: true,
        preview: preview({
          matched: 0,
          eligible: 0,
          willReceive: 0,
          email: { sendTo: 0 },
        }),
      }),
    );
    expect(rows).toEqual({
      "Pueden recibirlo hoy": "0 personas",
      "En la app": "0",
      "Por correo": "0",
      "En el dispositivo": "0 personas (0 dispositivos)",
      "No lo reciben": "0",
    });
  });

  it("reads one in the singular", () => {
    const rows = values(
      confirmation({
        sendPush: true,
        preview: preview({
          eligible: 1,
          willReceive: 1,
          email: {
            sendTo: 0,
            unsubscribedAnnouncements: 1,
            unsubscribedAll: 1,
            suppressed: 1,
            invalid: 1,
          },
          pushDevices: 1,
          pushSubscriptions: 1,
          skipped: [
            { reason: not_verified, count: 1 },
            { reason: banned, count: 1 },
            { reason: not_participant, count: 1 },
            { reason: deletion_pending, count: 1 },
          ],
          skippedTotal: 4,
        }),
      }),
    );
    expect(rows["Pueden recibirlo hoy"]).toBe("1 persona");
    expect(rows["Por correo"]).toBe(
      "0 · 1 dado de baja de los anuncios · 1 sin correos masivos · 1 con el correo bloqueado · 1 con un correo inválido",
    );
    expect(rows["En el dispositivo"]).toBe("1 persona (1 dispositivo)");
    expect(rows["No lo reciben"]).toBe(
      "4 · 1 perfil no verificado · 1 cuenta suspendida · 1 no es participante · 1 cuenta en eliminación",
    );
  });

  it("names every reason in the plural, the deletions included", () => {
    const rows = values(
      confirmation({
        preview: preview({
          skipped: [{ reason: deletion_pending, count: 3 }],
          skippedTotal: 3,
        }),
      }),
    );
    expect(rows["No lo reciben"]).toBe("3 · 3 cuentas en eliminación");
  });

  it("leaves the announcements opt-outs out of an essential send's email", () => {
    const rows = values(
      confirmation({
        essential: true,
        preview: preview({
          email: {
            sendTo: 1_210,
            unsubscribedAnnouncements: 30,
            suppressed: 12,
          },
        }),
      }),
    );
    expect(rows["Por correo"]).toBe("1.210 · 12 con el correo bloqueado");
  });

  it("leaves the preview narrowing out of who does not receive it", () => {
    const rows = values(
      confirmation({
        preview: preview({
          skipped: [
            { reason: staging, count: 1_200 },
            { reason: not_verified, count: 8 },
          ],
          skippedTotal: 1_208,
        }),
      }),
    );
    expect(rows["No lo reciben"]).toBe("8 · 8 perfiles no verificados");
  });

  it("still reads a reason it has no noun for", () => {
    const rows = values(
      confirmation({
        preview: preview({
          skipped: [{ reason: "Retirado antes de enviarse", count: 2 }],
          skippedTotal: 2,
        }),
      }),
    );
    expect(rows["No lo reciben"]).toBe("2 · 2 retirado antes de enviarse");
  });
});

describe("confirmCallouts", () => {
  it("has nothing to add for a plain send in production", () => {
    expect(confirmCallouts(confirmation())).toEqual([]);
  });

  it("goes in G5's order, each in its tone", () => {
    const callouts = confirmCallouts(
      confirmation({
        env: "preview",
        essential: true,
        essentialReason: "Motivo",
        sendPush: true,
        notificationsLaunched: false,
        preview: NARROWED,
      }),
    );
    expect(callouts.map(({ kind, tone }) => [kind, tone])).toEqual([
      ["essential", "amber"],
      ["push", "neutral"],
      ["environment", "blue"],
      ["bell", "neutral"],
    ]);
  });

  it("warns that a push cannot be taken back", () => {
    expect(confirmCallouts(confirmation({ sendPush: true }))).toEqual([
      { kind: "push", tone: "neutral", text: PUSH_CALLOUT_TEXT },
    ]);
    expect(PUSH_CALLOUT_TEXT).toBe(
      "La notificación en el dispositivo no se puede borrar una vez que llega, aunque después edites o retires el comunicado.",
    );
  });

  describe("essential", () => {
    it("says whom it reaches despite the opt-out and whom it still does not", () => {
      expect(
        essential(
          confirmation({
            essential: true,
            essentialReason: "El armado se adelanta a las 7:00 por la lluvia",
            preview: preview({
              email: {
                sendTo: 1_224,
                essentialOverride: 30,
                unsubscribedAll: 4,
                suppressed: 12,
              },
            }),
          }),
        ),
      ).toBe(
        "Es un correo esencial: también les llega a las 30 personas que se dieron de baja de los anuncios. No les llega a las 4 que pidieron no recibir ningún correo masivo ni a los 12 correos bloqueados por rebote o spam: ellos lo ven en la app. Motivo: «El armado se adelanta a las 7:00 por la lluvia». Queda registrado a tu nombre.",
      );
    });

    it("drops the sentence about whom it misses when it misses nobody", () => {
      expect(
        essential(
          confirmation({
            essential: true,
            essentialReason: "Cambia el armado",
            preview: preview({ email: { essentialOverride: 30 } }),
          }),
        ),
      ).toBe(
        "Es un correo esencial: también les llega a las 30 personas que se dieron de baja de los anuncios. Motivo: «Cambia el armado». Queda registrado a tu nombre.",
      );
    });

    it("keeps only the clause with someone in it", () => {
      expect(
        essential(
          confirmation({
            essential: true,
            essentialReason: "Cambia el armado",
            preview: preview({
              email: { essentialOverride: 30, suppressed: 12 },
            }),
          }),
        ),
      ).toBe(
        "Es un correo esencial: también les llega a las 30 personas que se dieron de baja de los anuncios. No les llega a los 12 correos bloqueados por rebote o spam: ellos lo ven en la app. Motivo: «Cambia el armado». Queda registrado a tu nombre.",
      );
    });

    it("reads one in the singular, and says so when nobody opted out", () => {
      expect(
        essential(
          confirmation({
            essential: true,
            essentialReason: "Cambia el armado",
            preview: preview({
              email: { essentialOverride: 1, unsubscribedAll: 1 },
            }),
          }),
        ),
      ).toBe(
        "Es un correo esencial: también le llega a 1 persona que se dio de baja de los anuncios. No le llega a 1 que pidió no recibir ningún correo masivo: lo ve en la app. Motivo: «Cambia el armado». Queda registrado a tu nombre.",
      );
      expect(
        essential(
          confirmation({
            essential: true,
            essentialReason: "Cambia el armado",
            preview: preview({ email: { suppressed: 1 } }),
          }),
        ),
      ).toBe(
        "Es un correo esencial: también les llega a quienes se dieron de baja de los anuncios, aunque hoy nadie de esta audiencia lo hizo. No le llega a 1 correo bloqueado por rebote o spam: lo ve en la app. Motivo: «Cambia el armado». Queda registrado a tu nombre.",
      );
    });
  });

  describe("environment", () => {
    it("is not there in production, whoever was picked by name", () => {
      expect(
        environment(
          confirmation({ env: "production", pickedReceiving: TWO_PICKED }),
        ),
      ).toBeUndefined();
    });

    it("on a preview, says the admins stand in for the lists and the people picked get a real email", () => {
      expect(
        environment(
          confirmation({
            env: "preview",
            preview: NARROWED,
            pickedReceiving: TWO_PICKED,
          }),
        ),
      ).toBe(
        "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores. Las 2 personas elegidas por nombre sí lo reciben, con un correo real marcado como prueba: Ana Pérez, Luis Rojas.",
      );
    });

    it("on a preview, ends with the admins when nobody was picked by name", () => {
      expect(
        environment(confirmation({ env: "preview", preview: NARROWED })),
      ).toBe(
        "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores.",
      );
    });

    it("names ten people at most, and counts the rest", () => {
      const names = Array.from({ length: 10 }, (_, index) => `P${index + 1}`);
      expect(
        environment(
          confirmation({
            env: "preview",
            preview: NARROWED,
            pickedReceiving: { count: 13, names },
          }),
        ),
      ).toBe(
        "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores. Las 13 personas elegidas por nombre sí lo reciben, con un correo real marcado como prueba: P1, P2, P3, P4, P5, P6, P7, P8, P9, P10 y 3 más.",
      );
    });

    it("on a preview, reads one admin and one person in the singular", () => {
      expect(
        environment(
          confirmation({
            env: "preview",
            preview: preview({
              eligible: 1,
              narrowed: true,
              stagingAdmins: 1,
            }),
            pickedReceiving: { count: 1, names: ["Ana Pérez"] },
          }),
        ),
      ).toBe(
        "Estás en un entorno de prueba: en lugar de 1 persona de las listas, lo recibe 1 administrador. La persona elegida por nombre sí lo recibe, con un correo real marcado como prueba: Ana Pérez.",
      );
    });

    it("on a preview without email, promises no email", () => {
      expect(
        environment(
          confirmation({
            env: "preview",
            sendEmail: false,
            preview: NARROWED,
            pickedReceiving: TWO_PICKED,
          }),
        ),
      ).toBe(
        "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores. Las 2 personas elegidas por nombre sí lo reciben: Ana Pérez, Luis Rojas.",
      );
    });

    it("on a preview, says who of the people picked by name get it when there is no list", () => {
      const peopleOnly = preview({ eligible: 2, willReceive: 2 });
      expect(
        environment(
          confirmation({
            env: "preview",
            preview: peopleOnly,
            pickedReceiving: TWO_PICKED,
          }),
        ),
      ).toBe(
        "Estás en un entorno de prueba: las 2 personas elegidas por nombre lo reciben con un correo real marcado como prueba: Ana Pérez, Luis Rojas.",
      );
      expect(
        environment(
          confirmation({
            env: "preview",
            preview: peopleOnly,
            pickedReceiving: { count: 0, names: [] },
          }),
        ),
      ).toBeUndefined();
    });

    it("in development, says the people picked get it in the app and no email goes", () => {
      expect(
        environment(
          confirmation({
            env: "development",
            preview: NARROWED,
            pickedReceiving: TWO_PICKED,
          }),
        ),
      ).toBe(
        "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores. Las 2 personas elegidas por nombre lo reciben en la app (en desarrollo no se envían correos).",
      );
      expect(
        environment(confirmation({ env: "development", preview: NARROWED })),
      ).toBe(
        "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores (en desarrollo no se envían correos).",
      );
      expect(
        environment(
          confirmation({
            env: "development",
            preview: preview({ eligible: 2, willReceive: 2 }),
            pickedReceiving: TWO_PICKED,
          }),
        ),
      ).toBe(
        "Estás en un entorno de prueba: las 2 personas elegidas por nombre lo reciben en la app (en desarrollo no se envían correos).",
      );
    });
  });

  describe("bell", () => {
    it("says only the email arrives while the bell is closed", () => {
      expect(
        confirmCallouts(confirmation({ notificationsLaunched: false })),
      ).toEqual([
        {
          kind: "bell",
          tone: "neutral",
          text: "Los participantes todavía no ven la campana: les llega solo el correo.",
        },
      ]);
    });

    it("says they will see it once the bell opens, when no email goes", () => {
      expect(
        confirmCallouts(
          confirmation({ notificationsLaunched: false, sendEmail: false }),
        ),
      ).toEqual([
        {
          kind: "bell",
          tone: "neutral",
          text: "Los participantes todavía no ven la campana: lo van a ver cuando se abra a todos.",
        },
      ]);
    });
  });
});

describe("typed confirmation", () => {
  it("asks for the digits without a separator", () => {
    expect(typedPrompt(1_240)).toBe(
      "Para confirmar, escribí la cantidad de personas: 1240",
    );
  });

  it("takes the count with or without thousands dots and spaces", () => {
    for (const typed of ["1240", "1.240", "1 240", " 1240 "]) {
      expect(typedMatches(typed, 1_240)).toBe(true);
    }
    expect(typedCount("1.240")).toBe(1_240);
  });

  it("refuses anything else", () => {
    for (const typed of ["", "124", "1241", "1,240", "12a40", "-1240"]) {
      expect(typedMatches(typed, 1_240)).toBe(false);
    }
    expect(typedCount("")).toBeNull();
    expect(typedCount("1,240")).toBeNull();
  });
});

describe("confirmTitle", () => {
  it("asks to send, or to schedule, the comunicado by its title", () => {
    expect(confirmTitle("send", "Cambio de horario de armado")).toBe(
      "¿Enviar «Cambio de horario de armado»?",
    );
    expect(confirmTitle("schedule", "Cambio de horario de armado")).toBe(
      "¿Programar «Cambio de horario de armado»?",
    );
  });

  it("says this comunicado before the numbers bring its title", () => {
    expect(confirmTitle("send", null)).toBe("¿Enviar este comunicado?");
    expect(confirmTitle("schedule", null)).toBe("¿Programar este comunicado?");
  });
});
