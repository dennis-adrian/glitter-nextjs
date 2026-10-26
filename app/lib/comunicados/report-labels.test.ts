import { describe, expect, it } from "vitest";

import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import {
  audienceSourcesText,
  bounceShareText,
  COMUNICADO_RECIPIENT_FILTERS,
  type ComunicadoEmailDelivery,
  comunicadoAppLabel,
  comunicadoDeviceLabel,
  comunicadoEmailLabel,
  comunicadoReportHref,
  emailNotSentText,
  essentialRecordText,
  notReceivedText,
  parseRecipientFilter,
  readKpiValue,
  recipientsRangeLabel,
  retractedBannerText,
  sendingBannerText,
  sentByText,
  stagingBannerText,
  stalledBannerText,
} from "@/app/lib/comunicados/report-labels";
import { COMUNICADO_RETRACTED_SKIP_REASON } from "@/app/lib/comunicados/skip-reasons";

/** 10:14 AM in La Paz. */
const SENT_AT = new Date("2026-10-24T14:14:00Z");

function delivery(
  overrides: Partial<ComunicadoEmailDelivery> = {},
): ComunicadoEmailDelivery {
  return {
    status: "sent",
    lastError: null,
    maybeSent: false,
    sentAt: SENT_AT,
    contentRevision: 2,
    ...overrides,
  };
}

function emailLabel(
  row: ComunicadoEmailDelivery | null,
  overrides: Partial<Parameters<typeof comunicadoEmailLabel>[0]> = {},
) {
  return comunicadoEmailLabel({
    delivery: row,
    unsubscribedAll: false,
    sendEmail: true,
    recipientStatus: "notified",
    currentRevision: 2,
    ...overrides,
  });
}

function summary(
  overrides: Partial<ComunicadoAudienceSummary> = {},
): ComunicadoAudienceSummary {
  return {
    v: 1,
    env: "production",
    narrowed: false,
    sources: [
      {
        kind: "festival",
        id: 12,
        label: "Confirmados · Glitter Navidad 2026",
        matched: 320,
        eligible: 312,
      },
      {
        kind: "list",
        id: 4,
        label: "Ilustradores",
        matched: 850,
        eligible: 845,
      },
      {
        kind: "people",
        id: null,
        label: "3 personas por nombre",
        matched: 3,
        eligible: 3,
      },
    ],
    matched: 1_173,
    eligible: 1_160,
    willReceive: 1_160,
    stagingAdmins: 0,
    pickedByName: 3,
    skipped: [],
    channels: { email: true, push: false },
    email: {
      sendTo: 1_120,
      unsubscribedAnnouncements: 30,
      unsubscribedAll: 4,
      suppressed: 0,
      invalid: 6,
    },
    essentialFestival: { id: 12, name: "Glitter Navidad 2026" },
    essentialOverride: 30,
    essentialNotOverridden: 4,
    ...overrides,
  };
}

describe("comunicadoEmailLabel", () => {
  it("reads every row of G6's Correo table, in order", () => {
    const cases: [ComunicadoEmailDelivery, string][] = [
      [
        delivery({ lastError: "idempotent_replay", contentRevision: null }),
        "Enviado (sin confirmación por persona)",
      ],
      [delivery(), "Enviado 10:14 AM"],
      [
        delivery({ status: "pending", maybeSent: true }),
        "En cola (puede haber llegado)",
      ],
      [delivery({ status: "processing" }), "En cola"],
      [
        delivery({ status: "skipped", lastError: "suppressed" }),
        "Correo bloqueado (rebote o spam)",
      ],
      [
        delivery({ status: "skipped", lastError: "invalid_address" }),
        "Correo inválido",
      ],
      [
        delivery({ status: "skipped", lastError: "not_eligible" }),
        "Ya no puede recibirlo",
      ],
      [
        delivery({ status: "skipped", lastError: "deleting" }),
        "Cuenta en eliminación",
      ],
      [
        delivery({ status: "skipped", lastError: "staging" }),
        "Entorno de prueba",
      ],
      [
        delivery({ status: "skipped", lastError: "retracted" }),
        "Cancelado (retirado)",
      ],
      [
        delivery({ status: "failed", lastError: "expired" }),
        "Venció sin enviarse",
      ],
      [
        delivery({ status: "failed", lastError: "address_changed" }),
        "Cambió su correo",
      ],
      [
        delivery({
          status: "failed",
          lastError: "resend:daily_quota_exceeded",
        }),
        "Límite de Resend",
      ],
      [
        delivery({
          status: "failed",
          lastError: "resend:monthly_quota_exceeded",
        }),
        "Límite de Resend",
      ],
      [
        delivery({ status: "failed", lastError: "resend:item_rejected" }),
        "Con error",
      ],
      [delivery({ status: "failed", lastError: null }), "Con error"],
    ];
    for (const [row, label] of cases) {
      expect(emailLabel(row), JSON.stringify(row)).toBe(label);
    }
  });

  it("tells the two opt-outs apart by whether the address left all bulk mail", () => {
    const row = delivery({ status: "skipped", lastError: "unsubscribed" });
    expect(emailLabel(row)).toBe("Se dio de baja de los anuncios");
    expect(emailLabel(row, { unsubscribedAll: true })).toBe(
      "Se dio de baja de los correos masivos",
    );
  });

  it("says a row may have landed whatever ended it, and only a send beats that", () => {
    for (const ended of [
      delivery({ status: "failed", lastError: "outcome_unknown" }),
      delivery({ status: "failed", lastError: "expired" }),
      delivery({ status: "skipped", lastError: "retracted" }),
      delivery({ status: "skipped", lastError: "address_changed" }),
      delivery({ status: "skipped", lastError: "unsubscribed" }),
    ]) {
      expect(emailLabel({ ...ended, maybeSent: true })).toBe(
        "Puede haber llegado",
      );
    }
    expect(
      emailLabel(delivery({ status: "processing", maybeSent: true })),
    ).toBe("En cola (puede haber llegado)");
    expect(emailLabel(delivery({ maybeSent: true }))).toBe("Enviado 10:14 AM");
    expect(
      emailLabel(
        delivery({
          maybeSent: true,
          lastError: "idempotent_replay",
          contentRevision: null,
        }),
      ),
    ).toBe("Enviado (sin confirmación por persona)");
  });

  it("names the version a send carried only when it is older than the current one", () => {
    expect(emailLabel(delivery({ contentRevision: 1 }))).toBe(
      "Enviado 10:14 AM · versión 1",
    );
    expect(emailLabel(delivery({ contentRevision: 3 }))).toBe(
      "Enviado 10:14 AM",
    );
    expect(emailLabel(delivery({ contentRevision: null }))).toBe(
      "Enviado 10:14 AM",
    );
    expect(emailLabel(delivery({ sentAt: null }))).toBe("Enviado");
    // A development send is simulated, and reads sent like any other.
    expect(emailLabel(delivery({ lastError: "simulated" }))).toBe(
      "Enviado 10:14 AM",
    );
  });

  it("reads an unknown skip code as not sent", () => {
    expect(
      emailLabel(delivery({ status: "skipped", lastError: "constructor" })),
    ).toBe("No se envió");
    expect(emailLabel(delivery({ status: "skipped", lastError: null }))).toBe(
      "No se envió",
    );
  });

  it("explains a person with no email row by their recipient row", () => {
    expect(emailLabel(null, { sendEmail: false })).toBe("Sin correo");
    expect(
      emailLabel(null, { sendEmail: false, recipientStatus: "skipped" }),
    ).toBe("Sin correo");
    expect(emailLabel(null, { recipientStatus: "pending" })).toBe("En cola");
    expect(emailLabel(null, { recipientStatus: "notified" })).toBe(
      "Sin correo",
    );
    expect(emailLabel(null, { recipientStatus: "skipped" })).toBe("—");
    expect(emailLabel(null, { recipientStatus: "failed" })).toBe("—");
  });
});

describe("comunicadoAppLabel", () => {
  it("names each recipient state", () => {
    const label = (
      status: Parameters<typeof comunicadoAppLabel>[0]["status"],
      skippedReason: string | null = null,
      readAt: Date | null = null,
    ) => comunicadoAppLabel({ status, skippedReason, readAt });

    expect(label("notified", null, SENT_AT)).toBe("Leído");
    expect(label("notified")).toBe("No leído");
    expect(label("pending")).toBe("En cola");
    expect(label("failed")).toBe("Falló");
    expect(label("skipped", "Cuenta suspendida")).toBe(
      "Omitido: Cuenta suspendida",
    );
    expect(label("skipped", COMUNICADO_RETRACTED_SKIP_REASON)).toBe(
      "Retirado antes de enviarse",
    );
    expect(label("granted")).toBe("—");
  });
});

describe("comunicadoDeviceLabel", () => {
  const label = (
    overrides: Partial<Parameters<typeof comunicadoDeviceLabel>[0]>,
  ) =>
    comunicadoDeviceLabel({
      sendPush: true,
      notified: true,
      pushes: 2,
      pushesSent: 2,
      ...overrides,
    });

  it("counts the devices it reached", () => {
    expect(label({})).toBe("Enviada a 2");
    expect(label({ pushesSent: 1 })).toBe("Enviada a 1");
    expect(label({ pushes: 0, pushesSent: 0 })).toBe("Sin dispositivos");
  });

  it("is a dash when push was not ticked, the item never arrived, or nothing went yet", () => {
    expect(label({ sendPush: false })).toBe("—");
    expect(label({ notified: false })).toBe("—");
    expect(label({ pushesSent: 0 })).toBe("—");
  });
});

describe("recipientsRangeLabel", () => {
  it("says which rows the page holds, with thousands separated", () => {
    expect(recipientsRangeLabel(1, 50, 1_254)).toBe("1–50 de 1.254");
    expect(recipientsRangeLabel(26, 50, 1_254)).toBe("1.251–1.254 de 1.254");
    expect(recipientsRangeLabel(2, 50, 60)).toBe("51–60 de 60");
    expect(recipientsRangeLabel(1, 50, 12)).toBe("1–12 de 12");
    expect(recipientsRangeLabel(1, 50, 0)).toBe("0 de 0");
  });
});

describe("parseRecipientFilter", () => {
  it("takes each chip and reads anything else as everyone", () => {
    for (const filter of COMUNICADO_RECIPIENT_FILTERS) {
      expect(parseRecipientFilter(filter)).toBe(filter);
    }
    expect(parseRecipientFilter(undefined)).toBe("all");
    expect(parseRecipientFilter("leidos")).toBe("all");
    expect(parseRecipientFilter(["unread", "error"])).toBe("all");
  });
});

describe("comunicadoReportHref", () => {
  it("keeps only what differs from the first page of everyone", () => {
    expect(comunicadoReportHref(7)).toBe("/dashboard/communications/7");
    expect(
      comunicadoReportHref(7, { filter: "unread", query: " ana ", page: 3 }),
    ).toBe("/dashboard/communications/7?filter=unread&q=ana&page=3");
    expect(comunicadoReportHref(7, { filter: "all", query: "", page: 1 })).toBe(
      "/dashboard/communications/7",
    );
    expect(comunicadoReportHref(7, { query: "a&b" })).toBe(
      "/dashboard/communications/7?q=a%26b",
    );
  });
});

describe("KPI sentences", () => {
  it("reads the read share in whole percent, 0 with nobody", () => {
    expect(readKpiValue(512, 1_240)).toBe("512 · 41 %");
    expect(readKpiValue(0, 0)).toBe("0 · 0 %");
    expect(readKpiValue(1_240, 1_240)).toBe("1.240 · 100 %");
  });

  it("says how many did not receive it, in the singular for one", () => {
    expect(notReceivedText(14)).toBe("14 no lo recibieron");
    expect(notReceivedText(1)).toBe("1 no lo recibió");
    expect(notReceivedText(1_014)).toBe("1.014 no lo recibieron");
  });

  it("splits the emails not sent, naming the others only when there are some", () => {
    expect(
      emailNotSentText({
        unsubscribed: 34,
        suppressed: 12,
        failed: 6,
        other: 0,
      }),
    ).toBe("34 bajas · 12 bloqueados · 6 con error");
    expect(
      emailNotSentText({ unsubscribed: 1, suppressed: 1, failed: 1, other: 1 }),
    ).toBe("1 baja · 1 bloqueado · 1 con error · 1 otro");
    expect(
      emailNotSentText({ unsubscribed: 0, suppressed: 0, failed: 0, other: 3 }),
    ).toBe("0 bajas · 0 bloqueados · 0 con error · 3 otros");
  });

  it("gives the bounce share with one decimal at most, over the confirmed sends", () => {
    expect(bounceShareText(9, 1_180)).toBe("0,8 % · desde este comunicado");
    expect(bounceShareText(1, 4)).toBe("25 % · desde este comunicado");
    expect(bounceShareText(0, 0)).toBe("0 % · desde este comunicado");
  });
});

describe("header sentences", () => {
  it("says when and by whom it was sent", () => {
    expect(sentByText("sáb, 24 oct, 10:12 AM", "Dennis")).toBe(
      "Enviado el sáb, 24 oct, 10:12 AM por Dennis",
    );
    expect(sentByText("sáb, 24 oct, 10:12 AM", null)).toBe(
      "Enviado el sáb, 24 oct, 10:12 AM",
    );
  });

  it("lists the sources as sent, the people picked by name as their own label", () => {
    expect(audienceSourcesText(summary())).toBe(
      "Destinatarios al enviar: Confirmados · Glitter Navidad 2026: 312 · Ilustradores: 845 · 3 personas por nombre",
    );
    expect(
      audienceSourcesText(
        summary({
          sources: [
            {
              kind: "list",
              id: 9,
              label: "Todos",
              matched: 2_000,
              eligible: 1_999,
            },
          ],
        }),
      ),
    ).toBe("Destinatarios al enviar: Todos: 1.999");
    expect(audienceSourcesText(summary({ sources: [] }))).toBeNull();
  });

  it("records an essential send with what it overrode and what it did not", () => {
    expect(
      essentialRecordText({
        summary: summary(),
        confirmedBy: "Dennis",
        confirmedAt: "sáb, 24 oct, 10:11 AM",
        reason: "Cambió el horario de armado",
      }),
    ).toBe(
      "Correo esencial · Confirmados · Glitter Navidad 2026 · lo confirmó Dennis el sáb, 24 oct, 10:11 AM · «Cambió el horario de armado» · 30 personas dadas de baja de los anuncios lo recibieron igual · 4 sin correos masivos no.",
    );
  });

  it("adds the blocked addresses only when there are some, in the singular for one override", () => {
    expect(
      essentialRecordText({
        summary: summary({
          essentialOverride: 1,
          email: { ...summary().email, unsubscribedAll: 0, suppressed: 2 },
        }),
        confirmedBy: "Ana",
        confirmedAt: "sáb, 24 oct, 10:11 AM",
        reason: "Cambió la sede",
      }),
    ).toBe(
      "Correo esencial · Confirmados · Glitter Navidad 2026 · lo confirmó Ana el sáb, 24 oct, 10:11 AM · «Cambió la sede» · 1 persona dada de baja de los anuncios lo recibió igual · 0 sin correos masivos no · 2 con el correo bloqueado no.",
    );
  });

  it("keeps what it knows when the summary no longer parses", () => {
    expect(
      essentialRecordText({
        summary: null,
        confirmedBy: null,
        confirmedAt: "sáb, 24 oct, 10:11 AM",
        reason: "Cambió la sede",
      }),
    ).toBe(
      "Correo esencial · confirmado el sáb, 24 oct, 10:11 AM · «Cambió la sede».",
    );
  });
});

describe("banner sentences", () => {
  it("says how far the send went, leaving email out when it was not ticked", () => {
    expect(
      sendingBannerText({
        notified: 820,
        pending: 420,
        emailSent: 600,
        sendEmail: true,
      }),
    ).toBe(
      "Lo estamos enviando: ya está en la app de 820 de 1.240 personas y salieron 600 correos. Esta página se actualiza sola.",
    );
    expect(
      sendingBannerText({
        notified: 0,
        pending: 1,
        emailSent: 1,
        sendEmail: true,
      }),
    ).toBe(
      "Lo estamos enviando: ya está en la app de 0 de 1 persona y salió 1 correo. Esta página se actualiza sola.",
    );
    expect(
      sendingBannerText({
        notified: 3,
        pending: 2,
        emailSent: 0,
        sendEmail: false,
      }),
    ).toBe(
      "Lo estamos enviando: ya está en la app de 3 de 5 personas. Esta página se actualiza sola.",
    );
  });

  it("says since when nothing moved, in Bolivia time", () => {
    expect(stalledBannerText(new Date("2026-10-24T14:12:00Z"))).toBe(
      "No avanza desde las 10:12 AM.",
    );
  });

  it("records a retraction with who and why", () => {
    expect(
      retractedBannerText({
        moment: "dom, 25 oct, 11:02 AM",
        by: "Dennis",
        reason: "Salió con la fecha equivocada",
      }),
    ).toBe(
      "Retirado el dom, 25 oct, 11:02 AM por Dennis · Motivo: «Salió con la fecha equivocada»",
    );
    expect(
      retractedBannerText({
        moment: "dom, 25 oct, 11:02 AM",
        by: null,
        reason: "Duplicado",
      }),
    ).toBe("Retirado el dom, 25 oct, 11:02 AM · Motivo: «Duplicado»");
  });

  it("names how many admins replaced the lists", () => {
    expect(stagingBannerText(4)).toBe(
      "Enviado en un entorno de prueba: las listas se reemplazaron por los 4 administradores.",
    );
    expect(stagingBannerText(1)).toBe(
      "Enviado en un entorno de prueba: las listas se reemplazaron por 1 administrador.",
    );
  });
});
