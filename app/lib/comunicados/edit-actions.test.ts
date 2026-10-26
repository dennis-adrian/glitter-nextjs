// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  logFailure: vi.fn(),
  revalidatePath: vi.fn(),
  edit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
  logComunicadosFailure: mocks.logFailure,
}));
vi.mock("@/app/lib/comunicados/edit", () => ({
  editSentComunicado: mocks.edit,
}));

import type { EditRefusalCode } from "@/app/lib/comunicados/contracts";
import { editComunicadoAction } from "@/app/lib/comunicados/edit-actions";

const ADMIN = { id: 42, role: "admin" };
const BLOCKED = { success: false, message: "No autorizado." } as const;
const DOC = [
  {
    type: "paragraph",
    props: {},
    content: [
      { type: "text", text: "El armado empieza a las 9:00.", styles: {} },
    ],
    children: [],
  },
];
const INPUT = {
  comunicadoId: 7,
  expectedRevision: 1,
  title: "Cambio de horario de armado",
  doc: DOC,
  actionLabel: "Ver mis participaciones",
  actionPath: "/my_participations",
  editNote: null,
};
const UNREADABLE = {
  success: false,
  code: "INVALID",
  message: "No pudimos leer los cambios. Probá de nuevo.",
};
const NOTE_TOO_LONG = {
  success: false,
  code: "INVALID",
  message: "La nota puede tener hasta 300 caracteres.",
};
const REFUSALS: [EditRefusalCode, string][] = [
  ["NOT_FOUND", "No encontramos este comunicado."],
  ["NOT_SENT", "Este comunicado no se envió."],
  ["RETRACTED", "Este comunicado fue retirado."],
  ["STALE", "Alguien más lo editó recién. Recargá para ver la última versión."],
  [
    "NOTE_REQUIRED",
    "Contá por qué cambia un correo esencial (lo ve solo el equipo).",
  ],
  ["NO_CHANGES", "No cambiaste nada: el comunicado sigue igual."],
  ["INVALID_CONTENT", "Escribí un título."],
  [
    "LOCKED",
    "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
  ],
  ["BUSY", "No pudimos guardar los cambios. Probá de nuevo."],
];

beforeEach(() => {
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.edit.mockResolvedValue({
    ok: true,
    revision: 2,
    campaignId: 91,
    updatedItems: 12,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

/** The note the service was handed, from the one call made. */
function noteEdited() {
  expect(mocks.edit).toHaveBeenCalledTimes(1);
  return mocks.edit.mock.calls[0]![1].editNote;
}

describe("editComunicadoAction", () => {
  it("refuses anyone the guard refuses before reading the input", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(await editComunicadoAction("nada")).toEqual({
      ...BLOCKED,
      code: "FORBIDDEN",
    });
    expect(await editComunicadoAction(INPUT)).toEqual({
      ...BLOCKED,
      code: "FORBIDDEN",
    });
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("edits as the acting admin at the revision the page showed, and refreshes the list, the page and the edit page", async () => {
    expect(await editComunicadoAction(INPUT)).toEqual({
      success: true,
      revision: 2,
      message: "Guardamos los cambios.",
    });
    expect(mocks.edit).toHaveBeenCalledWith(
      7,
      {
        expectedRevision: 1,
        title: "Cambio de horario de armado",
        doc: DOC,
        actionLabel: "Ver mis participaciones",
        actionPath: "/my_participations",
        editNote: null,
      },
      ADMIN.id,
    );
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard/communications"],
      ["/dashboard/communications/7"],
      ["/dashboard/communications/7/edit"],
    ]);
  });

  it("hands the text over as written: the service checks it as a send would", async () => {
    await editComunicadoAction({
      ...INPUT,
      title: "  Sin recortar  ",
      actionLabel: "",
      actionPath: null,
    });
    expect(mocks.edit.mock.calls[0]![1]).toMatchObject({
      title: "  Sin recortar  ",
      actionLabel: "",
      actionPath: null,
    });
  });

  it("strips NUL from the note and trims it", async () => {
    await editComunicadoAction({
      ...INPUT,
      editNote: "  Cambió el horario\u0000 de armado \n",
    });
    expect(noteEdited()).toBe("Cambió el horario de armado");
  });

  it.each([
    ["an empty note", ""],
    ["only spaces", " \n\t "],
    ["only NUL", "\u0000\u0000"],
  ])("hands %s over as no note", async (_label, editNote) => {
    await editComunicadoAction({ ...INPUT, editNote });
    expect(noteEdited()).toBeNull();
  });

  it("takes a note of exactly 300 characters, counted after trimming", async () => {
    const note = "a".repeat(300);
    await editComunicadoAction({ ...INPUT, editNote: `  ${note}  ` });
    expect(noteEdited()).toBe(note);
  });

  it("refuses a note past 300 characters in its own words, editing nothing", async () => {
    expect(
      await editComunicadoAction({ ...INPUT, editNote: "a".repeat(301) }),
    ).toEqual(NOTE_TOO_LONG);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined],
    ["an id that is not one", { ...INPUT, comunicadoId: "7" }],
    ["id 0", { ...INPUT, comunicadoId: 0 }],
    ["revision 0", { ...INPUT, expectedRevision: 0 }],
    ["a fractional revision", { ...INPUT, expectedRevision: 1.5 }],
    ["no revision", { ...INPUT, expectedRevision: undefined }],
    ["no title", { ...INPUT, title: undefined }],
    ["a title past 300 characters", { ...INPUT, title: "a".repeat(301) }],
    ["a text that is not a list of blocks", { ...INPUT, doc: "Hola" }],
    ["no text", { ...INPUT, doc: undefined }],
    ["a button label past 120", { ...INPUT, actionLabel: "a".repeat(121) }],
    [
      "a button path past 2000",
      { ...INPUT, actionPath: `/${"a".repeat(2000)}` },
    ],
    ["a missing note", { ...INPUT, editNote: undefined }],
    ["a note that is not text", { ...INPUT, editNote: 3 }],
  ])("refuses %s without editing anything", async (_label, bad) => {
    expect(await editComunicadoAction(bad)).toEqual(UNREADABLE);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(REFUSALS)(
    "passes the service's %s refusal through, refreshing nothing",
    async (code, message) => {
      mocks.edit.mockResolvedValue({ ok: false, code, message });

      expect(await editComunicadoAction(INPUT)).toEqual({
        success: false,
        code,
        message,
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("answers anything unexpected as a failure, logged by its type", async () => {
    const failure = new Error("connect ECONNREFUSED ana@example.test");
    mocks.edit.mockRejectedValue(failure);

    expect(await editComunicadoAction(INPUT)).toEqual({
      success: false,
      code: "FAILED",
      message: "No pudimos guardar los cambios. Probá de nuevo.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] edit failed",
      failure,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
