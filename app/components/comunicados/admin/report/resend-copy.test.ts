import { describe, expect, it } from "vitest";

import {
  channelsText,
  essentialResendText,
  newcomersText,
  resendActionLabel,
  resendEnvironmentText,
  resendHistoryLine,
  resendRows,
} from "@/app/components/comunicados/admin/report/resend-copy";
import type { ComunicadoResendPreview } from "@/app/lib/comunicados/contracts";

type Ready = Extract<ComunicadoResendPreview, { ok: true }>;

function previewOf(overrides: Partial<Ready> = {}): Ready {
  return {
    ok: true,
    original: { sendEmail: true, sendPush: false },
    originalEssential: false,
    currentRevision: 1,
    newcomers: 12,
    pickedByName: 0,
    eligible: 12,
    willReceive: 12,
    notReceiving: [],
    narrowed: false,
    stagingAdmins: 0,
    email: {
      sendTo: 11,
      unsubscribedAnnouncements: 1,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
      essentialOverride: 0,
    },
    pushDevices: 0,
    pushSubscriptions: 0,
    essential: false,
    essentialLapsed: false,
    typedRequired: false,
    env: "production",
    problem: null,
    ...overrides,
  };
}

describe("newcomersText", () => {
  it("counts who joined the audience since the send", () => {
    expect(newcomersText(0)).toBe("Nadie nuevo en la audiencia desde el envío");
    expect(newcomersText(1)).toBe(
      "1 persona nueva en la audiencia desde el envío",
    );
    expect(newcomersText(1240)).toBe(
      "1.240 personas nuevas en la audiencia desde el envío",
    );
  });
});

describe("resendActionLabel", () => {
  it("names the total once counted", () => {
    expect(resendActionLabel(null)).toBe("Enviar");
    expect(resendActionLabel(previewOf({ eligible: 1 }))).toBe(
      "Enviar a 1 persona",
    );
    expect(resendActionLabel(previewOf())).toBe("Enviar a 12 personas");
  });
});

describe("channelsText", () => {
  it("always says the app, then what is ticked", () => {
    expect(channelsText(false, false)).toBe("en la app");
    expect(channelsText(true, false)).toBe("en la app y por correo");
    expect(channelsText(true, true)).toBe(
      "en la app, por correo y en el dispositivo",
    );
  });
});

describe("resendRows", () => {
  it("splits newcomers and people by name, and says who cannot receive it", () => {
    const rows = resendRows(
      previewOf({
        newcomers: 9,
        pickedByName: 3,
        notReceiving: [{ reason: "Perfil no verificado", count: 2 }],
      }),
      { sendEmail: true, sendPush: false },
    );
    expect(rows).toEqual([
      { label: "Le llega a", value: "12 personas", strong: true },
      { label: "De ellos", value: "9 nuevos en la audiencia · 3 por nombre" },
      { label: "Por correo", value: "11 · 1 dado de baja de los anuncios" },
      { label: "En el dispositivo", value: "No" },
      { label: "No pueden recibirlo", value: "2 · 2 perfiles no verificados" },
    ]);
  });
});

describe("essentialResendText (B7)", () => {
  it("says it stays essential, and whom it reaches because of it", () => {
    expect(
      essentialResendText(
        previewOf({
          essential: true,
          email: { ...previewOf().email, essentialOverride: 1 },
        }),
      ),
    ).toBe(
      "Sale como correo esencial, como el envío original. También le llega por correo a 1 persona que se dio de baja de los anuncios. Queda registrado a tu nombre.",
    );
  });

  it("says it goes out normal past the festival's window", () => {
    expect(essentialResendText(previewOf({ essentialLapsed: true }))).toMatch(
      /^El festival terminó hace más de 7 días/,
    );
    expect(essentialResendText(previewOf())).toBeNull();
  });
});

describe("resendEnvironmentText (B6)", () => {
  it("says the lists' newcomers do not receive it on a preview", () => {
    expect(resendEnvironmentText(previewOf())).toBeNull();
    expect(resendEnvironmentText(previewOf({ narrowed: true }))).toBe(
      "Estás en un entorno de prueba: las 12 personas nuevas de las listas no lo reciben.",
    );
    expect(
      resendEnvironmentText(
        previewOf({ narrowed: true, newcomers: 1, stagingAdmins: 1 }),
      ),
    ).toBe(
      "Estás en un entorno de prueba: la persona nueva de las listas no lo recibe; lo recibe 1 administrador que todavía no lo tenía.",
    );
  });
});

describe("resendHistoryLine", () => {
  const summary = {
    v: 1 as const,
    env: "production" as const,
    narrowed: false,
    newcomers: 9,
    pickedByName: 3,
    eligible: 12,
    willReceive: 12,
    stagingAdmins: 0,
    stagingSkipped: 0,
    channels: { email: true, push: false },
    email: {
      sendTo: 12,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
    },
    essentialOverride: 0,
    essentialNotOverridden: 0,
  };

  it("says how many, when, who, how they came in and by which channels", () => {
    expect(
      resendHistoryLine({
        moment: "dom, 25 oct, 10:12 AM",
        byName: "Ana",
        sendEmail: true,
        sendPush: true,
        essential: true,
        summary,
      }),
    ).toBe(
      "Enviado a 12 personas más el dom, 25 oct, 10:12 AM por Ana · 9 nuevas en la audiencia · 3 por nombre · en la app, por correo y en el dispositivo · esencial",
    );
  });

  it("reads without a name or a summary", () => {
    expect(
      resendHistoryLine({
        moment: "dom, 25 oct, 10:12 AM",
        byName: null,
        sendEmail: false,
        sendPush: false,
        essential: false,
        summary: null,
      }),
    ).toBe("Enviado a más personas el dom, 25 oct, 10:12 AM · en la app");
  });
});
