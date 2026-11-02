// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RevisionHistory from "@/app/components/comunicados/admin/report/revision-history";
import type {
  ComunicadoRevisionView,
  LoadComunicadoRevisionResult,
} from "@/app/lib/comunicados/contracts";
import type { ComunicadoRevisionSummary } from "@/app/lib/comunicados/revisions";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/app/lib/comunicados/revision-actions", () => ({
  loadComunicadoRevisionAction: mocks.load,
}));

/** Sent on Saturday at 10:12 AM in La Paz, edited the next two days. */
const REVISIONS: ComunicadoRevisionSummary[] = [
  {
    revision: 1,
    title: "Cambio de horario de armado",
    editNote: null,
    createdAt: new Date("2026-10-24T14:12:00Z"),
    createdByName: "Dennis",
  },
  {
    revision: 2,
    title: "Cambio de horario de armado (corregido)",
    editNote: "Cambió el horario de armado",
    createdAt: new Date("2026-10-25T14:12:00Z"),
    createdByName: "Ana",
  },
  {
    revision: 3,
    title: "Cambio de horario de armado (corregido)",
    editNote: null,
    createdAt: new Date("2026-10-26T14:12:00Z"),
    createdByName: null,
  },
];

const VIEW_2: ComunicadoRevisionView = {
  revision: 2,
  title: "Cambio de horario de armado (corregido)",
  html: "<h2>Nuevo horario</h2><p>El armado empieza a las 7.</p>",
  actionLabel: "Ver mi reserva",
  actionPath: "/my_participations",
  editNote: "Cambió el horario de armado",
  createdAt: "2026-10-25T14:12:00.000Z",
  createdByName: "Ana",
};
const VERSION_2: LoadComunicadoRevisionResult = {
  success: true,
  revision: VIEW_2,
};

function renderHistory(revisions = REVISIONS, currentRevision = 3) {
  return render(
    <RevisionHistory
      comunicadoId={7}
      revisions={revisions}
      currentRevision={currentRevision}
    />,
  );
}

function rows() {
  return within(screen.getByRole("list", { name: "Versiones" })).getAllByRole(
    "listitem",
  );
}

function openVersion(revision: number) {
  fireEvent.click(
    screen.getByRole("button", { name: `Ver la versión ${revision}` }),
  );
  return screen.getByRole("dialog");
}

describe("RevisionHistory", () => {
  beforeEach(() => {
    mocks.load.mockResolvedValue(VERSION_2);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("lists every version, the first one first, with who, when and why", () => {
    renderHistory();

    expect(screen.getByText("Historial")).toBeTruthy();
    expect(rows().map((row) => row.textContent)).toEqual([
      "Versión 1 · enviada por Dennis el sáb, 24 oct, 10:12 AMVer",
      "Versión 2 · editada por Ana el dom, 25 oct, 10:12 AM · «Cambió el horario de armado»Ver",
      "Versión 3 · editada el lun, 26 oct, 10:12 AMActualVer",
    ]);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("marks only the current version as Actual", () => {
    renderHistory(REVISIONS.slice(0, 2), 2);

    expect(screen.getAllByText("Actual")).toHaveLength(1);
    expect(within(rows()[1]!).getByText("Actual")).toBeTruthy();
    expect(within(rows()[0]!).queryByText("Actual")).toBeNull();
  });

  it("shows nothing without versions", () => {
    const { container } = renderHistory([], 1);

    expect(container.innerHTML).toBe("");
  });

  it("opens a version rendered, with its button, once it is read", async () => {
    let resolve!: (value: LoadComunicadoRevisionResult) => void;
    mocks.load.mockReturnValue(new Promise((r) => (resolve = r)));
    renderHistory();

    const dialog = openVersion(2);
    expect(
      within(dialog).getByRole("heading", {
        name: "Versión 2 · «Cambio de horario de armado (corregido)»",
      }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Versión 2 · editada por Ana el dom, 25 oct, 10:12 AM · «Cambió el horario de armado»",
      ),
    ).toBeTruthy();
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith({ comunicadoId: 7, revision: 2 });

    resolve(VERSION_2);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { name: "Nuevo horario" }),
      ).toBeTruthy(),
    );
    expect(within(dialog).getByText("El armado empieza a las 7.")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Botón: Ver mi reserva (lleva a /my_participations)",
      ),
    ).toBeTruthy();
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("closes with Cerrar, and opens again without reading it again", async () => {
    renderHistory();

    const dialog = openVersion(2);
    await waitFor(() =>
      expect(
        within(dialog).getByText("El armado empieza a las 7."),
      ).toBeTruthy(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const again = openVersion(2);
    expect(within(again).getByText("El armado empieza a las 7.")).toBeTruthy();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("leaves the button out when the version had none", async () => {
    mocks.load.mockResolvedValue({
      success: true,
      revision: {
        ...VIEW_2,
        revision: 1,
        title: "Cambio de horario de armado",
        html: "<p>El armado empieza a las 8.</p>",
        actionLabel: null,
        actionPath: null,
        editNote: null,
      },
    });
    renderHistory();

    const dialog = openVersion(1);
    await waitFor(() =>
      expect(
        within(dialog).getByText("El armado empieza a las 8."),
      ).toBeTruthy(),
    );
    expect(within(dialog).queryByText(/^Botón:/)).toBeNull();
    expect(mocks.load).toHaveBeenCalledWith({ comunicadoId: 7, revision: 1 });
  });

  it("says when it cannot be read, and reads it again on the next opening", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.load.mockResolvedValueOnce({
      success: false,
      message: "No encontramos esta versión.",
    });
    renderHistory();

    let dialog = openVersion(2);
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe(
        "No encontramos esta versión.",
      ),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // A request that never answers reads as a failure too.
    mocks.load.mockRejectedValueOnce(new Error("offline"));
    dialog = openVersion(2);
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe(
        "No pudimos cargar esta versión. Probá de nuevo.",
      ),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    dialog = openVersion(2);
    await waitFor(() =>
      expect(
        within(dialog).getByText("El armado empieza a las 7."),
      ).toBeTruthy(),
    );
    expect(mocks.load).toHaveBeenCalledTimes(3);
  });
});
