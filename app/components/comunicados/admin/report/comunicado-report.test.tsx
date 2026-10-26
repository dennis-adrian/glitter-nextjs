// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ComunicadoReport from "@/app/components/comunicados/admin/report/comunicado-report";
import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import type {
  ComunicadoRecipientRow,
  ComunicadoReport as ComunicadoReportData,
} from "@/app/lib/comunicados/report";
import type { Paged } from "@/app/lib/distribution_lists/definitions";

vi.mock("@/app/lib/comunicados/actions", () => ({
  createComunicadoDraftAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The menu and the button are tested on their own; here they only show up.
vi.mock("@/app/components/comunicados/admin/retract-dialog", () => ({
  default: (props: { comunicadoId: number; title: string }) => (
    <button type="button" data-comunicado={props.comunicadoId}>
      Retirar «{props.title}»
    </button>
  ),
}));
vi.mock("@/app/components/comunicados/admin/process-pending-button", () => ({
  default: () => <button type="button">Procesar envíos pendientes</button>,
}));

const SUMMARY: ComunicadoAudienceSummary = {
  v: 1,
  env: "production",
  narrowed: false,
  sources: [
    {
      kind: "festival",
      id: 3,
      label: "Confirmados · Glitter Navidad 2026",
      matched: 320,
      eligible: 312,
    },
    {
      kind: "people",
      id: null,
      label: "3 personas por nombre",
      matched: 3,
      eligible: 3,
    },
  ],
  matched: 323,
  eligible: 315,
  willReceive: 315,
  stagingAdmins: 0,
  pickedByName: 3,
  skipped: [],
  channels: { email: true, push: true },
  email: {
    sendTo: 300,
    unsubscribedAnnouncements: 10,
    unsubscribedAll: 4,
    suppressed: 1,
    invalid: 0,
  },
  essentialFestival: null,
  essentialOverride: 0,
  essentialNotOverridden: 0,
};

function reportOf(
  overrides: Partial<ComunicadoReportData> = {},
): ComunicadoReportData {
  return {
    id: 7,
    title: "Cambio de horario de armado",
    campaignId: 70,
    campaignStatus: "completed",
    sentAt: new Date("2026-10-24T14:12:00Z"),
    sentByName: "Dennis",
    currentRevision: 1,
    html: "<h2>Nuevo horario</h2><p>El armado empieza a las 8.</p>",
    sendEmail: true,
    sendPush: true,
    essential: false,
    essentialReason: null,
    essentialConfirmedByName: null,
    essentialConfirmedAt: null,
    retractedAt: null,
    retractedByName: null,
    retractReason: null,
    summary: SUMMARY,
    kpis: {
      recipients: 1_240,
      notReceived: 14,
      stagingSkipped: 0,
      read: 512,
      notified: 1_232,
      emailSent: 1_180,
      emailPlanned: 1_194,
      emailUnsubscribed: 34,
      emailSuppressed: 12,
      emailFailed: 6,
      emailOtherSkipped: 0,
      emailQueued: 8,
      maybeSent: 0,
      bounces: 9,
      confirmedSent: 1_180,
      pushSent: 395,
      pushTotal: 410,
      pendingRecipients: 8,
    },
    banners: { configStalled: false, quota: false, stalledSince: null },
    retractCounts: {
      people: 1_240,
      queuedEmails: 8,
      maybeSentEmails: 0,
      sentEmails: 1_180,
    },
    ...overrides,
  };
}

function rowOf(
  overrides: Partial<ComunicadoRecipientRow> = {},
): ComunicadoRecipientRow {
  return {
    userId: 11,
    name: "Ana Pérez",
    email: "ana@example.test",
    source: "list",
    app: "Leído",
    emailLabel: "Enviado 10:14 AM",
    device: "Enviada a 2",
    ...overrides,
  };
}

function pagedOf(
  rows: ComunicadoRecipientRow[],
  overrides: Partial<Paged<ComunicadoRecipientRow>> = {},
): Paged<ComunicadoRecipientRow> {
  return { rows, total: rows.length, page: 1, pageCount: 1, ...overrides };
}

function renderReport(
  report: ComunicadoReportData = reportOf(),
  options: {
    recipients?: Paged<ComunicadoRecipientRow>;
    filter?: "all" | "unread" | "email_not_sent" | "skipped" | "error";
    query?: string;
    env?: "development" | "preview" | "production";
  } = {},
) {
  return render(
    <ComunicadoReport
      report={report}
      recipients={options.recipients ?? pagedOf([rowOf()])}
      filter={options.filter ?? "all"}
      query={options.query ?? ""}
      env={options.env ?? "production"}
    />,
  );
}

/** A KPI card's text, found by its label. */
function kpi(label: string) {
  return screen.getByText(label, { selector: "p" }).parentElement!.textContent;
}

describe("ComunicadoReport", () => {
  afterEach(cleanup);

  it("heads the page with who sent it, to whom, and its badges", () => {
    renderReport(reportOf({ essential: true, campaignStatus: "processing" }));

    expect(
      screen.getByRole("heading", { name: "Cambio de horario de armado" }),
    ).toBeTruthy();
    expect(screen.getByText("Enviando…")).toBeTruthy();
    expect(screen.getByText("Esencial")).toBeTruthy();
    expect(
      screen.getByText("Enviado el sáb, 24 oct, 10:12 AM por Dennis"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Destinatarios al enviar: Confirmados · Glitter Navidad 2026: 312 · 3 personas por nombre",
      ),
    ).toBeTruthy();
  });

  it("shows every KPI G6 lists while it sends, with their subs", () => {
    renderReport(reportOf({ campaignStatus: "processing" }));

    expect(kpi("Destinatarios")).toBe("Destinatarios1.24014 no lo recibieron");
    expect(kpi("Leídos en la app")).toBe("Leídos en la app512 · 41 %");
    expect(kpi("Correos enviados")).toBe("Correos enviados1.180 de 1.194");
    expect(kpi("Correos no enviados")).toBe(
      "Correos no enviados5234 bajas · 12 bloqueados · 6 con error",
    );
    expect(kpi("Rebotes y spam")).toBe(
      "Rebotes y spam90,8 % · desde este comunicado",
    );
    expect(kpi("En el dispositivo")).toBe("En el dispositivo395 de 410");
    expect(kpi("En cola")).toBe("En cola16");
  });

  it("leaves out the email cards when email was not ticked, push's likewise, and the queue once done", () => {
    renderReport(
      reportOf({
        sendEmail: false,
        sendPush: false,
        kpis: { ...reportOf().kpis, notReceived: 0 },
      }),
    );

    expect(kpi("Destinatarios")).toBe("Destinatarios1.240");
    for (const label of [
      "Correos enviados",
      "Correos no enviados",
      "Rebotes y spam",
      "En el dispositivo",
      "En cola",
    ]) {
      expect(screen.queryByText(label, { selector: "p" })).toBeNull();
    }
  });

  it("says it is sending and refreshes, and offers the retraction", () => {
    renderReport(reportOf({ campaignStatus: "processing" }));

    expect(
      screen.getByText(
        "Lo estamos enviando: ya está en la app de 1.232 de 1.240 personas y salieron 1.180 correos. Esta página se actualiza sola.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Retirar «Cambio de horario de armado»" })
        .getAttribute("data-comunicado"),
    ).toBe("7");
  });

  it("freezes once retracted: its banner, no sending, stall or Resend banners, no queue and no menu", () => {
    renderReport(
      reportOf({
        campaignStatus: "processing",
        retractedAt: new Date("2026-10-25T15:02:00Z"),
        retractedByName: "Dennis",
        retractReason: "Salió con la fecha equivocada",
        banners: {
          configStalled: true,
          quota: true,
          stalledSince: new Date("2026-10-25T14:00:00Z"),
        },
      }),
    );

    expect(
      screen.getByText(
        "Retirado el dom, 25 oct, 11:02 AM por Dennis · Motivo: «Salió con la fecha equivocada»",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Retirado")).toBeTruthy();
    expect(screen.queryByText(/^Lo estamos enviando/)).toBeNull();
    expect(screen.queryByText(/^No avanza/)).toBeNull();
    expect(screen.queryByText(/^Detenido: Resend/)).toBeNull();
    expect(screen.queryByText(/^Resend no acepta más correos/)).toBeNull();
    expect(screen.queryByText("En cola", { selector: "p" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Retirar/ })).toBeNull();
  });

  it("says when Resend stopped it, ran out, or nothing moves, with the button on a preview", () => {
    const stalled = reportOf({
      campaignStatus: "processing",
      banners: {
        configStalled: true,
        quota: true,
        stalledSince: new Date("2026-10-24T14:12:00Z"),
      },
    });
    const { unmount } = renderReport(stalled, { env: "preview" });

    expect(screen.getByText(/^Detenido: Resend rechazó el envío/)).toBeTruthy();
    expect(
      screen.getByText(/^Resend no acepta más correos por ahora/),
    ).toBeTruthy();
    expect(screen.getByText("No avanza desde las 10:12 AM.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Procesar envíos pendientes" }),
    ).toBeTruthy();
    unmount();

    renderReport(stalled, { env: "production" });
    expect(screen.getByText("No avanza desde las 10:12 AM.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Procesar envíos pendientes" }),
    ).toBeNull();
  });

  it("marks a send from a test environment, and a simulated one in development", () => {
    const { unmount } = renderReport(
      reportOf({
        summary: {
          ...SUMMARY,
          env: "preview",
          narrowed: true,
          stagingAdmins: 4,
        },
      }),
    );
    expect(
      screen.getByText(
        "Enviado en un entorno de prueba: las listas se reemplazaron por los 4 administradores.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^Simulado/)).toBeNull();
    unmount();

    renderReport(
      reportOf({
        summary: {
          ...SUMMARY,
          env: "development",
          narrowed: true,
          stagingAdmins: 2,
          // People picked by name only: no list was replaced.
          sources: [SUMMARY.sources[1]!],
        },
      }),
    );
    expect(
      screen.getByText("Simulado (desarrollo): no se envió ningún correo."),
    ).toBeTruthy();
    expect(screen.queryByText(/^Enviado en un entorno de prueba/)).toBeNull();
  });

  it("writes out the essential record", () => {
    renderReport(
      reportOf({
        essential: true,
        essentialReason: "Cambió el horario de armado",
        essentialConfirmedByName: "Dennis",
        essentialConfirmedAt: new Date("2026-10-24T14:11:00Z"),
        summary: {
          ...SUMMARY,
          essentialFestival: { id: 3, name: "Glitter Navidad 2026" },
          essentialOverride: 30,
        },
      }),
    );

    expect(
      screen.getByText(
        "Correo esencial · Confirmados · Glitter Navidad 2026 · lo confirmó Dennis el sáb, 24 oct, 10:11 AM · «Cambió el horario de armado» · 30 personas dadas de baja de los anuncios lo recibieron igual · 4 sin correos masivos no · 1 con el correo bloqueado no.",
      ),
    ).toBeTruthy();
  });

  it("renders the message as HTML", () => {
    renderReport();

    expect(screen.getByRole("heading", { name: "Nuevo horario" })).toBeTruthy();
    expect(screen.getByText("El armado empieza a las 8.")).toBeTruthy();
  });

  it("lists each person with their labels, the origin in words", () => {
    renderReport(reportOf(), {
      recipients: pagedOf([
        rowOf(),
        rowOf({
          userId: 12,
          name: "Luis Rojas",
          email: "luis@example.test",
          source: "staging_admin",
          app: "En cola",
          emailLabel: "En cola",
          device: "—",
        }),
        rowOf({ userId: 13, name: "Sin origen", source: null }),
      ]),
    });

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Ana Pérezana@example.testListaLeídoEnviado 10:14 AMEnviada a 2",
      "Luis Rojasluis@example.testAdmin de pruebaEn colaEn cola—",
      "Sin origenana@example.test—LeídoEnviado 10:14 AMEnviada a 2",
    ]);
  });

  it("says nobody matches when a chip or the search empties the table", () => {
    renderReport(reportOf(), { recipients: pagedOf([]), filter: "error" });

    expect(screen.getByText("Nadie coincide con este filtro.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("links each chip keeping the search and dropping the page", () => {
    renderReport(reportOf(), {
      filter: "unread",
      query: "ana",
      recipients: pagedOf([rowOf()], { total: 120, page: 2, pageCount: 3 }),
    });

    const chips = within(
      screen.getByRole("navigation", { name: "Filtrar destinatarios" }),
    ).getAllByRole("link");
    expect(
      chips.map((chip) => [chip.textContent, chip.getAttribute("href")]),
    ).toEqual([
      ["Todos", "/dashboard/communications/7?q=ana"],
      ["No leídos", "/dashboard/communications/7?filter=unread&q=ana"],
      [
        "Correo no enviado",
        "/dashboard/communications/7?filter=email_not_sent&q=ana",
      ],
      ["Omitidos", "/dashboard/communications/7?filter=skipped&q=ana"],
      ["Con error", "/dashboard/communications/7?filter=error&q=ana"],
    ]);
    expect(
      chips.find((chip) => chip.getAttribute("aria-current") === "page")
        ?.textContent,
    ).toBe("No leídos");
  });

  it("pages with the range, keeping the chip and the search", () => {
    renderReport(reportOf(), {
      filter: "unread",
      query: "ana",
      recipients: pagedOf([rowOf()], { total: 1_254, page: 2, pageCount: 26 }),
    });

    const pagination = screen.getByRole("navigation", { name: "Paginación" });
    expect(within(pagination).getByText("51–100 de 1.254")).toBeTruthy();
    expect(
      within(pagination)
        .getByRole("link", { name: "Anterior" })
        .getAttribute("href"),
    ).toBe("/dashboard/communications/7?filter=unread&q=ana");
    expect(
      within(pagination)
        .getByRole("link", { name: "Siguiente" })
        .getAttribute("href"),
    ).toBe("/dashboard/communications/7?filter=unread&q=ana&page=3");
  });

  it("shows only the range on a single page", () => {
    renderReport(reportOf(), {
      recipients: pagedOf([rowOf()]),
    });

    expect(screen.queryByRole("navigation", { name: "Paginación" })).toBeNull();
    expect(screen.getByText("1–1 de 1")).toBeTruthy();
  });
});
