// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  logFailure: vi.fn(),
  fetchRevision: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
  logComunicadosFailure: mocks.logFailure,
}));
vi.mock("@/app/lib/comunicados/revisions", () => ({
  fetchComunicadoRevision: mocks.fetchRevision,
}));

import { loadComunicadoRevisionAction } from "@/app/lib/comunicados/revision-actions";

const ADMIN = { id: 42, role: "admin" };
const BLOCKED = { success: false, message: "No autorizado." } as const;
const NOT_FOUND = {
  success: false,
  message: "No encontramos esta versión.",
} as const;

/** What `fetchComunicadoRevision` answers: the whole stored version. */
const REVISION = {
  revision: 2,
  title: "Cambio de horario de armado",
  doc: [{ type: "paragraph", content: "El armado empieza a las 7." }],
  html: "<p>El armado empieza a las 7.</p>",
  text: "El armado empieza a las 7.",
  actionLabel: "Ver mi reserva",
  actionPath: "/my_participations",
  editNote: "Cambió el horario de armado",
  createdAt: new Date("2026-10-25T14:12:00Z"),
  createdByName: "Ana",
};

beforeEach(() => {
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.fetchRevision.mockResolvedValue(REVISION);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadComunicadoRevisionAction", () => {
  it("refuses anyone the guard refuses before reading the input or the version", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(
      await loadComunicadoRevisionAction({ comunicadoId: 7, revision: 2 }),
    ).toEqual(BLOCKED);
    expect(await loadComunicadoRevisionAction("garbage")).toEqual(BLOCKED);
    expect(mocks.fetchRevision).not.toHaveBeenCalled();
  });

  it("answers the version for the dialog: its HTML and button, the time as ISO, never the document", async () => {
    expect(
      await loadComunicadoRevisionAction({ comunicadoId: 7, revision: 2 }),
    ).toEqual({
      success: true,
      revision: {
        revision: 2,
        title: "Cambio de horario de armado",
        html: "<p>El armado empieza a las 7.</p>",
        actionLabel: "Ver mi reserva",
        actionPath: "/my_participations",
        editNote: "Cambió el horario de armado",
        createdAt: "2026-10-25T14:12:00.000Z",
        createdByName: "Ana",
      },
    });
    expect(mocks.fetchRevision).toHaveBeenCalledWith(7, 2);
  });

  it("says it was not found when there is no such version", async () => {
    mocks.fetchRevision.mockResolvedValue(null);

    expect(
      await loadComunicadoRevisionAction({ comunicadoId: 7, revision: 9 }),
    ).toEqual(NOT_FOUND);
  });

  it.each([
    ["nothing", undefined],
    ["a bare id", 7],
    ["no revision", { comunicadoId: 7 }],
    ["revision zero", { comunicadoId: 7, revision: 0 }],
    ["a fractional revision", { comunicadoId: 7, revision: 1.5 }],
    ["a revision as text", { comunicadoId: 7, revision: "2" }],
    ["a revision past the column", { comunicadoId: 7, revision: 2 ** 31 }],
    ["an id that is not one", { comunicadoId: "7", revision: 2 }],
    ["id zero", { comunicadoId: 0, revision: 2 }],
  ])("refuses %s as not found, without reading", async (_label, input) => {
    expect(await loadComunicadoRevisionAction(input)).toEqual(NOT_FOUND);
    expect(mocks.fetchRevision).not.toHaveBeenCalled();
  });

  it("logs an unexpected failure through the type-only logger", async () => {
    const error = new Error("connection lost");
    mocks.fetchRevision.mockRejectedValue(error);

    expect(
      await loadComunicadoRevisionAction({ comunicadoId: 7, revision: 2 }),
    ).toEqual({
      success: false,
      message: "No pudimos cargar esta versión. Probá de nuevo.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] revision load failed",
      error,
    );
  });
});
