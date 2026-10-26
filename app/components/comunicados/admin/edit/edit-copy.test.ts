import { describe, expect, it } from "vitest";

import {
  editDialogLines,
  editNoteLabel,
} from "@/app/components/comunicados/admin/edit/edit-copy";
import type { ComunicadoRetractCounts } from "@/app/lib/comunicados/contracts";

function lines(
  counts: Partial<ComunicadoRetractCounts> = {},
  flags: Partial<{
    sendEmail: boolean;
    sendPush: boolean;
    sending: boolean;
    essential: boolean;
  }> = {},
) {
  return editDialogLines({
    counts: {
      people: 1240,
      queuedEmails: 8,
      maybeSentEmails: 3,
      sentEmails: 1180,
      ...counts,
    },
    sendEmail: true,
    sendPush: true,
    sending: false,
    essential: false,
    ...flags,
  });
}

describe("editDialogLines", () => {
  it("says it as G7 does", () => {
    expect(lines()).toEqual({
      inbox:
        "Se actualiza en las notificaciones de las 1.240 personas y se marca como «Editado».",
      emails:
        "Correos: los 1.180 que ya salieron no cambian; los 8 que todavía no salieron se envían con el texto nuevo, salvo los que pueden haber llegado ya en un intento anterior.",
      devices:
        "Las notificaciones que ya llegaron a los dispositivos no cambian.",
      sending: null,
      essential: null,
      advice:
        "Si el cambio es importante para quienes ya lo leyeron, mejor enviá un comunicado nuevo.",
    });
  });

  it("speaks of one person in the singular, and of nobody plainly", () => {
    expect(lines({ people: 1 }).inbox).toBe(
      "Se actualiza en la notificación de la persona y se marca como «Editado».",
    );
    expect(lines({ people: 0 }).inbox).toBe(
      "Todavía no llegó a las notificaciones de nadie: quienes lo reciban verán la versión nueva.",
    );
  });

  it("promises nothing about what may have arrived when nothing may have", () => {
    expect(lines({ maybeSentEmails: 0 }).emails).toBe(
      "Correos: los 1.180 que ya salieron no cambian; los 8 que todavía no salieron se envían con el texto nuevo.",
    );
  });

  it("speaks of one email in the singular", () => {
    expect(
      lines({ sentEmails: 1, queuedEmails: 1, maybeSentEmails: 0 }).emails,
    ).toBe(
      "Correos: el correo que ya salió no cambia; el correo que todavía no salió se envía con el texto nuevo.",
    );
    expect(lines({ sentEmails: 1, queuedEmails: 1 }).emails).toBe(
      "Correos: el correo que ya salió no cambia; el correo que todavía no salió se envía con el texto nuevo, salvo los que pueden haber llegado ya en un intento anterior.",
    );
  });

  it("leaves out the half with no email in it", () => {
    expect(lines({ queuedEmails: 0 }).emails).toBe(
      "Correos: los 1.180 que ya salieron no cambian.",
    );
    expect(lines({ sentEmails: 0 }).emails).toBe(
      "Correos: los 8 que todavía no salieron se envían con el texto nuevo, salvo los que pueden haber llegado ya en un intento anterior.",
    );
    expect(
      lines({ sentEmails: 0, queuedEmails: 0, maybeSentEmails: 0 }).emails,
    ).toBeNull();
    // What may have arrived only qualifies the emails still to go.
    expect(lines({ sentEmails: 0, queuedEmails: 0 }).emails).toBeNull();
  });

  it("says nothing of emails or devices that were not ticked", () => {
    const shown = lines({}, { sendEmail: false, sendPush: false });
    expect(shown.emails).toBeNull();
    expect(shown.devices).toBeNull();
  });

  it("adds the sending line while it still sends", () => {
    expect(lines({}, { sending: true }).sending).toBe(
      "Todavía se está enviando: quienes no lo recibieron aún reciben directamente la versión nueva.",
    );
  });

  it("repeats the essential callout on an essential comunicado", () => {
    expect(lines({}, { essential: true }).essential).toBe(
      "Es un correo esencial: los correos que todavía no salieron llegan con el texto nuevo también a quienes se dieron de baja de los anuncios. Contá por qué en la nota.",
    );
  });
});

describe("editNoteLabel", () => {
  it("is optional, unless the comunicado is essential", () => {
    expect(editNoteLabel(false)).toBe(
      "Nota del cambio (opcional, solo para el equipo)",
    );
    expect(editNoteLabel(true)).toBe(
      "Nota del cambio (obligatoria en un correo esencial, solo para el equipo)",
    );
  });
});
