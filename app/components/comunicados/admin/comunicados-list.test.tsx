// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ComunicadosList, {
  comunicadoActivityLine,
  comunicadoBadge,
  ComunicadosEmptyState,
} from "@/app/components/comunicados/admin/comunicados-list";
import type { ComunicadoListRow } from "@/app/lib/comunicados/queries";
import type { Paged } from "@/app/lib/distribution_lists/definitions";

vi.mock("@/app/lib/comunicados/actions", () => ({
  createComunicadoDraftAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const NOW = new Date("2026-10-25T20:00:00Z");

function row(overrides: Partial<ComunicadoListRow> = {}): ComunicadoListRow {
  return {
    id: 7,
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

describe("ComunicadosList", () => {
  afterEach(cleanup);

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
