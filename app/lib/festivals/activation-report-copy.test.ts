import { describe, expect, it } from "vitest";

import {
  activationReportTiles,
  enrollmentCell,
  percent,
  pushCell,
  readCell,
} from "@/app/lib/festivals/activation-report-copy";

const report = {
  // 10:00 in La Paz.
  sentAt: new Date("2026-11-04T14:00:00Z"),
  kpis: {
    notified: 640,
    read: 410,
    pushReached: 180,
    pushSent: 212,
    pushFailed: 9,
    pushPending: 0,
    enrolledAfter: 256,
    enrolledBefore: 3,
  },
};

describe("percent", () => {
  it("rounds, and is 0% with nothing to divide", () => {
    expect(percent(410, 640)).toBe("64%");
    expect(percent(1, 3)).toBe("33%");
    expect(percent(0, 0)).toBe("0%");
  });
});

describe("activationReportTiles", () => {
  it("says who got it, read it, took the push and enrolled", () => {
    expect(activationReportTiles(report)).toEqual([
      {
        label: "Notificados",
        value: "640",
        sub: "el 4 nov 2026, 10:00 AM",
      },
      { label: "Leídos en Glitter", value: "410 (64%)", sub: "230 sin leer" },
      {
        label: "Con push enviado",
        value: "180",
        sub: "212 dispositivos · 9 no se pudieron enviar",
      },
      {
        label: "Inscritos después del aviso",
        value: "256 (40%)",
        sub: "3 ya estaban inscritos",
      },
    ]);
  });

  it("leaves out what is zero, and is singular at one", () => {
    const tiles = activationReportTiles({
      ...report,
      kpis: {
        ...report.kpis,
        pushSent: 1,
        pushFailed: 0,
        pushPending: 2,
        enrolledBefore: 1,
      },
    });
    expect(tiles[2]!.sub).toBe("1 dispositivo · 2 pendientes");
    expect(tiles[3]!.sub).toBe("1 ya estaba inscrito");
    expect(
      activationReportTiles({
        ...report,
        kpis: { ...report.kpis, enrolledBefore: 0 },
      })[3]!.sub,
    ).toBeUndefined();
  });
});

describe("the recipients table", () => {
  it("says when it was read", () => {
    expect(readCell({ readAt: new Date("2026-11-04T15:30:00Z") })).toBe(
      "Leído el 4 nov 2026, 11:30 AM",
    );
    expect(readCell({ readAt: null })).toBe("Sin leer");
  });

  it("sums the pushes per outcome", () => {
    expect(pushCell({ sent: 1, failed: 0, pending: 0 })).toBe("Enviado");
    expect(pushCell({ sent: 2, failed: 1, pending: 0 })).toBe(
      "Enviado a 2 dispositivos · 1 no enviado",
    );
    expect(pushCell({ sent: 0, failed: 2, pending: 1 })).toBe(
      "2 no enviados · Pendiente",
    );
    expect(pushCell({ sent: 0, failed: 0, pending: 0 })).toBe("Sin push");
  });

  it("tells an enrollment after the notice from one before it", () => {
    const at = new Date("2026-11-04T16:00:00Z");
    expect(
      enrollmentCell({ at, status: "accepted", afterNotice: true }),
    ).toBe("Inscrito el 4 nov 2026, 12:00 PM (aceptada)");
    expect(
      enrollmentCell({ at, status: "pending", afterNotice: false }),
    ).toBe("Ya estaba inscrito (en revisión)");
    expect(enrollmentCell(null)).toBe("Sin inscribirse");
  });
});
