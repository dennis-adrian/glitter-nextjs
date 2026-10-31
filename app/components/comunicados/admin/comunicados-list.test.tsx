// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ComunicadosList, {
  comunicadoActivityLine,
  comunicadoBadge,
  ComunicadosEmptyState,
  comunicadoStatsLine,
} from "@/app/components/comunicados/admin/comunicados-list";
import { VERSION_CHANGED_TEXT } from "@/app/components/comunicados/admin/send-confirm-copy";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import type { ComunicadoSendConfirmation } from "@/app/lib/comunicados/contracts";
import type { ComunicadoListRow } from "@/app/lib/comunicados/queries";
import { SCHEDULE_STALE_MESSAGE } from "@/app/lib/comunicados/schedule-copy";
import type { Paged } from "@/app/lib/distribution_lists/definitions";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  load: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/actions", () => ({
  createComunicadoDraftAction: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/send-actions", () => ({
  loadComunicadoSendConfirmationAction: mocks.load,
  sendComunicadoNowAction: mocks.send,
}));
vi.mock("@/app/lib/comunicados/schedule-actions", () => ({
  scheduleComunicadoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const NOW = new Date("2026-10-25T20:00:00Z");
const OVERDUE_MS = 3 * 60_000;
const OVERDUE_TEXT =
  "Debería haber salido el dom, 25 oct, 3:57 PM y todavía no salió.";

function row(overrides: Partial<ComunicadoListRow> = {}): ComunicadoListRow {
  return {
    id: 7,
    version: 3,
    title: "Cambio de horario de armado",
    status: "draft",
    essential: false,
    scheduledAt: null,
    scheduleMissedAt: null,
    sentAt: null,
    sending: false,
    retractedAt: null,
    editedAt: null,
    updatedAt: new Date("2026-10-25T19:55:00Z"),
    audienceLabel: "Para: Confirmados · Glitter Navidad 2026 y 3 personas",
    createdByName: "Ana",
    updatedByName: "Dennis",
    sentByName: null,
    stats: null,
    ...overrides,
  };
}

function paged(
  rows: ComunicadoListRow[],
  page = 1,
  pageCount = 1,
): Paged<ComunicadoListRow> {
  return { rows, total: rows.length, page, pageCount };
}

describe("comunicadoBadge", () => {
  it("names each state, a missed schedule before the draft it went back to", () => {
    expect(comunicadoBadge(row())).toMatchObject({ label: "Borrador" });
    expect(
      comunicadoBadge(row({ scheduleMissedAt: new Date("2026-10-25T10:00Z") })),
    ).toMatchObject({ label: "No se envió", variant: "red" });
    expect(
      comunicadoBadge(
        row({
          status: "scheduled",
          scheduledAt: new Date("2026-10-31T13:00:00Z"),
        }),
      ).label,
    ).toBe("Programado · sáb, 31 oct, 9:00 AM");
    expect(comunicadoBadge(row({ status: "sent" })).label).toBe("Enviado");
    expect(comunicadoBadge(row({ status: "sent", sending: true })).label).toBe(
      "Enviando…",
    );
  });

  it("reads a retraction over a send still in progress", () => {
    expect(
      comunicadoBadge(row({ status: "sent", sending: true, retractedAt: NOW }))
        .label,
    ).toBe("Retirado");
  });
});

describe("comunicadoActivityLine", () => {
  it("says how long ago a draft changed, and who changed it", () => {
    expect(comunicadoActivityLine(row(), NOW)).toBe(
      "Actualizado hace 5 minutos · Dennis",
    );
  });

  it("gives the date once it is more than a week old", () => {
    expect(
      comunicadoActivityLine(
        row({ updatedAt: new Date("2026-10-12T15:00:00Z") }),
        NOW,
      ),
    ).toBe("Actualizado el 12 oct 2026 · Dennis");
  });

  it("falls back to the author, and to no name at all", () => {
    expect(comunicadoActivityLine(row({ updatedByName: null }), NOW)).toBe(
      "Actualizado hace 5 minutos · Ana",
    );
    expect(
      comunicadoActivityLine(
        row({ updatedByName: null, createdByName: null }),
        NOW,
      ),
    ).toBe("Actualizado hace 5 minutos");
  });

  it("says when and by whom a sent one went out", () => {
    expect(
      comunicadoActivityLine(
        row({
          status: "sent",
          sentAt: new Date("2026-10-24T14:12:00Z"),
          sentByName: "Dennis",
        }),
        NOW,
      ),
    ).toBe("Enviado el sáb, 24 oct, 10:12 AM · Dennis");
  });
});

describe("comunicadoStatsLine", () => {
  it("reads as G3 words it", () => {
    expect(
      comunicadoStatsLine({
        recipients: 1_240,
        emailsSent: 1_180,
        readPercent: 41,
      }),
    ).toBe("1.240 personas · 1.180 correos · 41 % leído");
  });

  it("leaves the correos out when email was not ticked, and the share with nobody", () => {
    expect(
      comunicadoStatsLine({ recipients: 1, emailsSent: null, readPercent: 0 }),
    ).toBe("1 persona · 0 % leído");
    expect(
      comunicadoStatsLine({ recipients: 0, emailsSent: 1, readPercent: null }),
    ).toBe("0 personas · 1 correo");
  });
});

describe("ComunicadosList", () => {
  afterEach(cleanup);

  it("shows a sent row's numbers, and none before it is sent", () => {
    render(
      <ComunicadosList
        tab="sent"
        now={NOW}
        list={paged([
          row({
            status: "sent",
            sentAt: new Date("2026-10-24T14:12:00Z"),
            stats: { recipients: 1_240, emailsSent: 1_180, readPercent: 41 },
          }),
          row({ id: 8 }),
        ])}
      />,
    );
    const [sent, draft] = screen.getAllByRole("link");
    expect(
      within(sent!).getByText("1.240 personas · 1.180 correos · 41 % leído"),
    ).toBeTruthy();
    expect(draft!.textContent).not.toContain("% leído");
  });

  it("links each row to its comunicado, untitled ones included", () => {
    render(
      <ComunicadosList
        tab="drafts"
        now={NOW}
        list={paged([
          row(),
          row({ id: 8, title: "  ", audienceLabel: null, essential: true }),
        ])}
      />,
    );
    const links = within(
      screen.getByRole("list", { name: "Borradores" }),
    ).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard/communications/7",
      "/dashboard/communications/8",
    ]);
    expect(links[0]!.textContent).toContain(
      "Para: Confirmados · Glitter Navidad 2026 y 3 personas",
    );
    expect(links[1]!.textContent).toContain("Sin título");
    expect(links[1]!.textContent).toContain("Sin destinatarios todavía");
    expect(within(links[1]!).getByText("Esencial")).toBeTruthy();
    expect(within(links[0]!).queryByText("Esencial")).toBeNull();
  });

  it("tags a sent comunicado edited after it went out", () => {
    render(
      <ComunicadosList
        tab="sent"
        now={NOW}
        list={paged([
          row({
            status: "sent",
            sentAt: new Date("2026-10-24T14:12:00Z"),
            sentByName: "Dennis",
            editedAt: NOW,
          }),
        ])}
      />,
    );
    const item = screen.getByRole("link");
    expect(within(item).getByText("Enviado")).toBeTruthy();
    expect(within(item).getByText("Editado")).toBeTruthy();
    expect(item.textContent).toContain("Enviado el sáb, 24 oct, 10:12 AM");
  });

  it("says each tab is empty in its own words", () => {
    const { rerender } = render(
      <ComunicadosList tab="scheduled" now={NOW} list={paged([])} />,
    );
    expect(screen.getByText("No hay comunicados programados.")).toBeTruthy();
    rerender(<ComunicadosList tab="sent" now={NOW} list={paged([])} />);
    expect(
      screen.getByText("Todavía no se envió ningún comunicado."),
    ).toBeTruthy();
    rerender(<ComunicadosList tab="drafts" now={NOW} list={paged([])} />);
    expect(screen.getByText("No hay borradores.")).toBeTruthy();
  });

  it("pages within the tab it is on", () => {
    render(
      <ComunicadosList tab="sent" now={NOW} list={paged([row()], 2, 3)} />,
    );
    const pagination = screen.getByRole("navigation", { name: "Paginación" });
    expect(
      within(pagination)
        .getByRole("link", { name: "Anterior" })
        .getAttribute("href"),
    ).toBe("/dashboard/communications?tab=sent");
    expect(
      within(pagination)
        .getByRole("link", { name: "Siguiente" })
        .getAttribute("href"),
    ).toBe("/dashboard/communications?tab=sent&page=3");
    expect(within(pagination).getByText("Página 2 de 3")).toBeTruthy();
  });

  it("shows no pagination on a single page", () => {
    render(<ComunicadosList tab="drafts" now={NOW} list={paged([row()])} />);
    expect(screen.queryByRole("navigation", { name: "Paginación" })).toBeNull();
  });
});

/** A schedule `late` ms past its time, as the list reads it at NOW. */
function scheduledRow(
  late: number,
  overrides: Partial<ComunicadoListRow> = {},
) {
  return row({
    status: "scheduled",
    scheduledAt: new Date(NOW.getTime() - late),
    ...overrides,
  });
}

/** What the confirm dialog counts for an overdue row, at `version`. */
function confirmation(version: number): ComunicadoSendConfirmation {
  const preview: ComunicadoAudiencePreview = {
    sources: [],
    matched: 12,
    eligible: 12,
    overlap: 0,
    skipped: [],
    skippedTotal: 0,
    willReceive: 12,
    email: {
      sendTo: 12,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
      essentialOverride: 0,
    },
    pushDevices: 0,
    pushSubscriptions: 0,
    tooLarge: false,
    narrowed: false,
    stagingAdmins: 0,
    essentialAllowed: { ok: false, reason: null, festival: null },
  };
  return {
    comunicadoId: 7,
    version,
    title: "Cambio de horario de armado",
    sendEmail: true,
    sendPush: false,
    essential: false,
    essentialReason: null,
    essentialFestivalName: null,
    preview,
    pickedReceiving: { count: 0, names: [] },
    typedRequired: false,
    env: "production",
    notificationsLaunched: true,
    problem: null,
  };
}

describe("ComunicadosList: an overdue schedule (E6)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("says so under the row, with Enviar ahora outside its link", () => {
    render(
      <ComunicadosList
        tab="scheduled"
        now={NOW}
        list={paged([scheduledRow(OVERDUE_MS)])}
      />,
    );
    const item = screen.getByRole("listitem");
    const link = within(item).getByRole("link");
    const button = within(item).getByRole("button", { name: "Enviar ahora" });

    expect(within(item).getByText(OVERDUE_TEXT)).toBeTruthy();
    expect(link.textContent).not.toContain("Debería haber salido");
    expect(link.contains(button)).toBe(false);
    expect(link.getAttribute("href")).toBe("/dashboard/communications/7");
  });

  it("shows neither until 3 minutes have passed, nor for any other state", () => {
    render(
      <ComunicadosList
        tab="scheduled"
        now={NOW}
        list={paged([
          scheduledRow(OVERDUE_MS - 1),
          scheduledRow(-60 * 60_000, { id: 8 }),
          row({
            id: 9,
            scheduledAt: new Date(NOW.getTime() - OVERDUE_MS),
            scheduleMissedAt: NOW,
          }),
          row({
            id: 10,
            status: "sent",
            scheduledAt: new Date(NOW.getTime() - OVERDUE_MS),
            sentAt: NOW,
          }),
        ])}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText(/Debería haber salido/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar ahora" })).toBeNull();
  });

  it("sends it at the version the list read, then opens its page", async () => {
    mocks.load.mockResolvedValue({
      success: true,
      confirmation: confirmation(4),
    });
    mocks.send.mockResolvedValue({
      success: true,
      alreadySent: false,
      message: "Lo estamos enviando.",
    });
    render(
      <ComunicadosList
        tab="scheduled"
        now={NOW}
        list={paged([scheduledRow(OVERDUE_MS, { version: 4 })])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar ahora" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(mocks.load).toHaveBeenCalledWith(7);
    const send = within(dialog).getByRole("button", {
      name: "Enviar ahora",
    }) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/communications/7"),
    );
    expect(mocks.send).toHaveBeenCalledWith({
      comunicadoId: 7,
      expectedVersion: 4,
      typedCount: null,
    });
  });

  it("does not send numbers for a version the list did not read", async () => {
    // A change of date since the list was read.
    mocks.load.mockResolvedValue({
      success: true,
      confirmation: confirmation(5),
    });
    render(
      <ComunicadosList
        tab="scheduled"
        now={NOW}
        list={paged([scheduledRow(OVERDUE_MS, { version: 4 })])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar ahora" }));
    const dialog = await screen.findByRole("alertdialog");
    // Scheduled, and changed by whoever: not "este borrador … otra pestaña".
    await within(dialog).findByText(SCHEDULE_STALE_MESSAGE);
    expect(within(dialog).queryByText(VERSION_CHANGED_TEXT)).toBeNull();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Enviar ahora",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("ComunicadosEmptyState", () => {
  afterEach(cleanup);

  it("invites the first one, with the button to write it", () => {
    render(<ComunicadosEmptyState />);
    expect(screen.getByText("Todavía no hay comunicados.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Nuevo comunicado" }),
    ).toBeTruthy();
  });
});
