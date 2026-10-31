import { describe, expect, it } from "vitest";

import { retractDialogLines } from "@/app/components/comunicados/admin/retract-copy";
import type { ComunicadoRetractCounts } from "@/app/lib/comunicados/contracts";

function lines(
  counts: Partial<ComunicadoRetractCounts> = {},
  { sendPush = true } = {},
) {
  return retractDialogLines(
    {
      people: 1240,
      queuedEmails: 8,
      maybeSentEmails: 3,
      sentEmails: 1180,
      ...counts,
    },
    { sendPush },
  );
}

describe("retractDialogLines", () => {
  it("says it as G7 does", () => {
    expect(lines()).toEqual({
      disappears:
        "Desaparece de las notificaciones de las 1.240 personas, también de quienes ya lo leyeron.",
      emails:
        "Los 8 correos que todavía no salieron no se envían; 3 pueden haber llegado ya. Los 1.180 correos ya enviados y las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.",
    });
  });

  it("speaks of one person in the singular, and of nobody plainly", () => {
    expect(lines({ people: 1 }).disappears).toBe(
      "Desaparece de las notificaciones de la persona, también si ya lo leyó.",
    );
    expect(lines({ people: 0 }).disappears).toBe(
      "No está en las notificaciones de nadie.",
    );
  });

  it("leaves out what may have arrived when nothing may have", () => {
    expect(lines({ maybeSentEmails: 0 }).emails).toBe(
      "Los 8 correos que todavía no salieron no se envían. Los 1.180 correos ya enviados y las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.",
    );
  });

  it("speaks of one email in the singular", () => {
    expect(
      lines({ queuedEmails: 1, maybeSentEmails: 1, sentEmails: 1 }).emails,
    ).toBe(
      "El correo que todavía no salió no se envía; 1 puede haber llegado ya. El correo ya enviado y las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.",
    );
  });

  it("starts from the emails already sent when none is still queued", () => {
    expect(lines({ queuedEmails: 0, maybeSentEmails: 0 }).emails).toBe(
      "Los 1.180 correos ya enviados y las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.",
    );
  });

  it("still says which may have arrived when none is queued", () => {
    expect(lines({ queuedEmails: 0 }).emails).toBe(
      "3 correos pueden haber llegado ya. Los 1.180 correos ya enviados y las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.",
    );
    expect(lines({ queuedEmails: 0, maybeSentEmails: 1 }).emails).toMatch(
      /^1 correo puede haber llegado ya\. /,
    );
  });

  it("speaks only of the devices when no email went out", () => {
    expect(
      lines({ queuedEmails: 0, maybeSentEmails: 0, sentEmails: 0 }).emails,
    ).toBe(
      "Las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.",
    );
    expect(lines({ sentEmails: 0 }).emails).toBe(
      "Los 8 correos que todavía no salieron no se envían; 3 pueden haber llegado ya. Las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.",
    );
  });

  it("leaves the devices out when the device notification was not ticked", () => {
    const noPush = { sendPush: false };
    expect(lines({}, noPush).emails).toBe(
      "Los 8 correos que todavía no salieron no se envían; 3 pueden haber llegado ya. Los 1.180 correos ya enviados no se pueden borrar. El informe queda guardado.",
    );
    expect(lines({ sentEmails: 1 }, noPush).emails).toMatch(
      / El correo ya enviado no se puede borrar\. El informe queda guardado\.$/,
    );
    expect(lines({ sentEmails: 0 }, noPush).emails).toBe(
      "Los 8 correos que todavía no salieron no se envían; 3 pueden haber llegado ya. El informe queda guardado.",
    );
    // Neither email nor device: only the report is left to mention.
    expect(
      lines({ queuedEmails: 0, maybeSentEmails: 0, sentEmails: 0 }, noPush)
        .emails,
    ).toBe("El informe queda guardado.");
  });
});
