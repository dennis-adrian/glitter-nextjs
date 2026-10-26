// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ComunicadoEditor, {
  type ComunicadoEditorProps,
} from "@/app/components/comunicados/admin/edit/comunicado-editor";
import type { EditComunicadoResult } from "@/app/lib/comunicados/contracts";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  edit: vi.fn(),
  renderPreview: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
const editor = vi.hoisted(() => ({
  emit: null as null | ((doc: unknown) => void),
  uploadFile: undefined as undefined | ((file: File) => Promise<string>),
}));
const startUpload = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
// BlockNote does not run in jsdom: a stand-in that can report a change, as
// the real editor does on mount and on input.
vi.mock("@/app/components/organisms/rich-text-editor", () => ({
  default: (props: {
    onChange?: (json: unknown, html: string) => void;
    uploadFile?: (file: File) => Promise<string>;
  }) => {
    editor.emit = (doc) => props.onChange?.(doc, "");
    editor.uploadFile = props.uploadFile;
    return <div contentEditable data-testid="editor" />;
  },
}));
// The message card uploads images (PR 8) through UploadThing.
vi.mock("@/app/vendors/uploadthing", () => ({
  useUploadThing: () => ({ startUpload, isUploading: false }),
}));
vi.mock("@/app/lib/comunicados/edit-actions", () => ({
  editComunicadoAction: mocks.edit,
}));
vi.mock("@/app/lib/comunicados/preview-actions", () => ({
  renderComunicadoPreviewAction: mocks.renderPreview,
}));

const DOC = [
  {
    type: "paragraph",
    content: [{ type: "text", text: "El armado empieza a las 9." }],
  },
];

const PROPS: ComunicadoEditorProps = {
  comunicadoId: 42,
  revision: 2,
  title: "Cambio de horario de armado",
  doc: DOC,
  actionLabel: "Ver mi reserva",
  actionPath: "/my_participations",
  essential: false,
  essentialFestivalName: null,
  sendEmail: true,
  sendPush: true,
  sending: false,
  counts: {
    people: 1240,
    queuedEmails: 8,
    maybeSentEmails: 3,
    sentEmails: 1180,
  },
};

const STALE: EditComunicadoResult = {
  success: false,
  code: "STALE",
  message: "Alguien más lo editó recién. Recargá para ver la última versión.",
};

function renderEditor(props: Partial<ComunicadoEditorProps> = {}) {
  return render(<ComunicadoEditor {...PROPS} {...props} />);
}

/** `hidden`: the dialog, while open, hides the page from the tree. */
function saveButton({ hidden = false } = {}) {
  return screen.getByRole("button", {
    name: "Guardar cambios…",
    hidden,
  }) as HTMLButtonElement;
}

/** What the editor reports, as the real one does on input. */
function emitDoc(doc: unknown) {
  act(() => editor.emit?.(doc));
}

function titleInput() {
  return screen.getByLabelText("Título") as HTMLInputElement;
}

function typeTitle(value: string) {
  fireEvent.change(titleInput(), { target: { value } });
}

function typeNote(value: string, essential = false) {
  fireEvent.change(
    screen.getByLabelText(
      essential
        ? "Nota del cambio (obligatoria en un correo esencial, solo para el equipo)"
        : "Nota del cambio (opcional, solo para el equipo)",
    ),
    { target: { value } },
  );
}

function openDialog() {
  fireEvent.click(saveButton());
  return screen.getByRole("alertdialog");
}

function confirmSave() {
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
}

/** Whether closing the tab now would ask first. */
function leavingAsks() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("ComunicadoEditor", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.renderPreview.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    cleanup();
    editor.emit = null;
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("says what an edit can change, seeded from the current revision", () => {
    renderEditor();

    expect(
      screen.getByText(
        "Estás editando un comunicado enviado. Podés cambiar el título, el texto y el botón. Los destinatarios y los canales quedan como están.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Volver al comunicado" })
        .getAttribute("href"),
    ).toBe("/dashboard/communications/42");
    expect(titleInput().value).toBe("Cambio de horario de armado");
    expect(
      (screen.getByLabelText("Texto del botón") as HTMLInputElement).value,
    ).toBe("Ver mi reserva");
    expect(
      (screen.getByLabelText("Página de Glitter") as HTMLInputElement).value,
    ).toBe("/my_participations");
    // The text counter in the server's measure, as the composer counts it.
    expect(screen.getByText("26/5.000")).toBeTruthy();
    // Its refusal speaks of a draft: never shown here.
    expect(screen.queryByText(/El resto del borrador se guardó/)).toBeNull();
  });

  it("keeps «Guardar cambios…» off until something changes", () => {
    renderEditor();
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(screen.queryByRole("alertdialog")).toBeNull();

    typeTitle("Cambio de horario de armado ");
    expect(saveButton().disabled).toBe(true);
    typeTitle("Nuevo horario de armado");
    expect(saveButton().disabled).toBe(false);
    typeTitle("Cambio de horario de armado");
    expect(saveButton().disabled).toBe(true);

    // Taking the button away is a change.
    fireEvent.click(screen.getByRole("switch", { name: "Agregar un botón" }));
    expect(saveButton().disabled).toBe(false);
  });

  it("counts the text as changed only once the admin writes in it", () => {
    renderEditor();
    // BlockNote settling the stored document is not a change.
    emitDoc([{ type: "paragraph", content: [] }]);
    expect(saveButton().disabled).toBe(true);

    fireEvent.keyDown(screen.getByTestId("editor"), { key: "a" });
    emitDoc([
      {
        type: "paragraph",
        content: [{ type: "text", text: "El armado empieza a las 10." }],
      },
    ]);
    expect(saveButton().disabled).toBe(false);
  });

  it("keeps saving off while the title or the text is missing", () => {
    renderEditor();
    typeTitle("  ");
    expect(screen.getByText("Falta un título.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("leaves the note optional on a comunicado that is not essential", () => {
    renderEditor();
    expect(
      screen.getByLabelText("Nota del cambio (opcional, solo para el equipo)"),
    ).toBeTruthy();
    expect(screen.getByText("0/300")).toBeTruthy();
    typeTitle("Nuevo horario de armado");
    expect(saveButton().disabled).toBe(false);
    expect(
      screen.queryByText(
        "Contá por qué cambia un correo esencial (lo ve solo el equipo).",
      ),
    ).toBeNull();
  });

  it("asks for the note on an essential comunicado before it saves", () => {
    renderEditor({ essential: true });
    typeTitle("Nuevo horario de armado");

    expect(
      screen.getByText(
        "Contá por qué cambia un correo esencial (lo ve solo el equipo).",
      ),
    ).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    typeNote("   ", true);
    expect(saveButton().disabled).toBe(true);

    typeNote("Cambió el horario de armado", true);
    expect(saveButton().disabled).toBe(false);
    expect(screen.getByText("27/300")).toBeTruthy();
    expect(
      screen.queryByText(
        "Contá por qué cambia un correo esencial (lo ve solo el equipo).",
      ),
    ).toBeNull();
  });

  it("says in the dialog what the edit reaches, from the report's numbers", () => {
    renderEditor({ essential: true, sending: true });
    typeTitle("Nuevo horario de armado");
    typeNote("Cambió el horario de armado", true);
    const dialog = openDialog();

    expect(screen.getByText("¿Guardar los cambios?")).toBeTruthy();
    for (const line of [
      "Se actualiza en las notificaciones de las 1.240 personas y se marca como «Editado».",
      "Correos: los 1.180 que ya salieron no cambian; los 8 que todavía no salieron se envían con el texto nuevo, salvo los que pueden haber llegado ya en un intento anterior.",
      "Las notificaciones que ya llegaron a los dispositivos no cambian.",
      "Todavía se está enviando: quienes no lo recibieron aún reciben directamente la versión nueva.",
      "Es un correo esencial: los correos que todavía no salieron llegan con el texto nuevo también a quienes se dieron de baja de los anuncios. Contá por qué en la nota.",
      "Si el cambio es importante para quienes ya lo leyeron, mejor enviá un comunicado nuevo.",
    ]) {
      expect(dialog.textContent).toContain(line);
    }
    expect(screen.getByRole("button", { name: "Volver" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("leaves out of the dialog the channels that were not ticked", () => {
    renderEditor({ sendEmail: false, sendPush: false });
    typeTitle("Nuevo horario de armado");
    const dialog = openDialog();
    expect(dialog.textContent).not.toContain("Correos:");
    expect(dialog.textContent).not.toContain("dispositivos");
    expect(dialog.textContent).not.toContain("Es un correo esencial");
    expect(dialog.textContent).not.toContain("Todavía se está enviando");
  });

  it("saves what is on screen, then goes back to the comunicado", async () => {
    let resolve!: (value: EditComunicadoResult) => void;
    mocks.edit.mockReturnValue(new Promise((r) => (resolve = r)));
    renderEditor();

    typeTitle("Nuevo horario de armado");
    fireEvent.keyDown(screen.getByTestId("editor"), { key: "a" });
    const doc = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "El armado empieza a las 10." }],
      },
    ];
    emitDoc(doc);
    typeNote("  Cambió el horario de armado \n");
    openDialog();
    confirmSave();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardando…" })).toBeTruthy(),
    );
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(mocks.edit).toHaveBeenCalledWith({
      comunicadoId: 42,
      expectedRevision: 2,
      title: "Nuevo horario de armado",
      doc,
      actionLabel: "Ver mi reserva",
      actionPath: "/my_participations",
      editNote: "Cambió el horario de armado",
    });
    expect(leavingAsks()).toBe(true);

    resolve({ success: true, revision: 3, message: "Guardamos los cambios." });
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Guardamos los cambios."),
    );
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/communications/42");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    // On its way out: nothing to save twice, and nothing to warn about.
    expect(
      (screen.getByRole("button", { name: "Guardando…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(saveButton({ hidden: true }).disabled).toBe(true);
    expect(leavingAsks()).toBe(false);
  });

  it("sends no button once the switch is off, and no note when none was written", async () => {
    mocks.edit.mockReturnValue(new Promise(() => {}));
    renderEditor();
    fireEvent.click(screen.getByRole("switch", { name: "Agregar un botón" }));
    openDialog();
    confirmSave();

    await waitFor(() => expect(mocks.edit).toHaveBeenCalledTimes(1));
    expect(mocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Cambio de horario de armado",
        doc: DOC,
        actionLabel: null,
        actionPath: null,
        editNote: null,
      }),
    );
  });

  it("keeps expecting the revision it opened on, whatever a refresh brings", async () => {
    mocks.edit.mockReturnValue(new Promise(() => {}));
    const { rerender } = renderEditor();
    typeTitle("Nuevo horario de armado");
    // Someone else saved revision 3, and the page re-rendered under us.
    rerender(
      <ComunicadoEditor {...PROPS} revision={3} title="Horario nuevo" />,
    );
    expect(titleInput().value).toBe("Nuevo horario de armado");
    openDialog();
    confirmSave();

    await waitFor(() => expect(mocks.edit).toHaveBeenCalledTimes(1));
    expect(mocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 2 }),
    );
  });

  it("shows a stale save by the button, with «Recargar», and keeps the text", async () => {
    mocks.edit.mockResolvedValue(STALE);
    renderEditor();
    typeTitle("Nuevo horario de armado");
    openDialog();
    confirmSave();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Alguien más lo editó recién. Recargá para ver la última versión.",
    );
    expect(screen.getByRole("button", { name: "Recargar" })).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(titleInput().value).toBe("Nuevo horario de armado");
    // Another try would only be refused again.
    expect(saveButton().disabled).toBe(true);
    expect(leavingAsks()).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("shows a refusal a new try may pass by the button, and lets it try again", async () => {
    mocks.edit.mockResolvedValueOnce({
      success: false,
      code: "LOCKED",
      message:
        "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
    });
    renderEditor();
    typeTitle("Nuevo horario de armado");
    openDialog();
    confirmSave();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
    );
    expect(screen.queryByRole("button", { name: "Recargar" })).toBeNull();
    expect(saveButton().disabled).toBe(false);

    // A new try starts without the old refusal.
    mocks.edit.mockReturnValue(new Promise(() => {}));
    openDialog();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the save could not be asked at all", async () => {
    mocks.edit.mockRejectedValue(new Error("offline"));
    renderEditor();
    typeTitle("Nuevo horario de armado");
    openDialog();
    confirmSave();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "No pudimos guardar los cambios. Probá de nuevo.",
    );
    expect(saveButton().disabled).toBe(false);
  });

  it("keeps saving off while an image uploads, and asks before the tab closes", async () => {
    let finish!: (value: unknown) => void;
    startUpload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderEditor();
    typeTitle("Nuevo horario de armado");
    expect(saveButton().disabled).toBe(false);

    let uploaded!: Promise<string>;
    act(() => {
      uploaded = editor.uploadFile!(
        new File(["png"], "plano.png", { type: "image/png" }),
      );
    });
    expect(saveButton().disabled).toBe(true);
    expect(
      screen.getByText("Esperá a que termine de subir la imagen."),
    ).toBeTruthy();
    expect(leavingAsks()).toBe(true);

    await act(async () => {
      finish([{ serverData: { imageUrl: "https://abc.ufs.sh/f/PLANO" } }]);
      await uploaded;
    });
    expect(saveButton().disabled).toBe(false);
    expect(
      screen.queryByText("Esperá a que termine de subir la imagen."),
    ).toBeNull();
  });

  it("asks before the tab closes only while a change is on screen", () => {
    renderEditor();
    expect(leavingAsks()).toBe(false);
    typeNote("Cambió el horario de armado");
    expect(leavingAsks()).toBe(true);
    typeNote("");
    expect(leavingAsks()).toBe(false);
    typeTitle("Nuevo horario de armado");
    expect(leavingAsks()).toBe(true);
  });
});
