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

import ComunicadoComposer, {
  type ComunicadoComposerProps,
} from "@/app/components/comunicados/admin/composer/composer";
import type { ComposerDraft } from "@/app/components/comunicados/admin/composer/types";
import type { ComunicadoSendConfirmation } from "@/app/lib/comunicados/contracts";
import { SCHEDULE_DEVELOPMENT_REFUSAL } from "@/app/lib/comunicados/schedule-copy";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
  previewAudience: vi.fn(),
  renderPreview: vi.fn(),
  loadConfirmation: vi.fn(),
  sendNow: vi.fn(),
  schedule: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
// BlockNote does not run in jsdom.
vi.mock("@/app/components/organisms/rich-text-editor", () => ({
  default: () => <div data-testid="editor" />,
}));
// The message card uploads images (PR 8); nothing here uploads.
vi.mock("@/app/vendors/uploadthing", () => ({
  useUploadThing: () => ({ startUpload: vi.fn(), isUploading: false }),
}));
vi.mock("@/app/lib/comunicados/actions", () => ({
  saveComunicadoDraftAction: mocks.save,
  previewComunicadoAudienceAction: mocks.previewAudience,
  discardComunicadoDraftAction: vi.fn(),
  previewSkippedPeopleAction: vi.fn(),
  searchComunicadoPeopleAction: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/preview-actions", () => ({
  renderComunicadoPreviewAction: mocks.renderPreview,
}));
vi.mock("@/app/lib/comunicados/test-send", () => ({
  sendComunicadoTestAction: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/send-actions", () => ({
  loadComunicadoSendConfirmationAction: mocks.loadConfirmation,
  sendComunicadoNowAction: mocks.sendNow,
}));
vi.mock("@/app/lib/comunicados/schedule-actions", () => ({
  scheduleComunicadoAction: mocks.schedule,
}));

const DRAFT: ComposerDraft = {
  id: 7,
  version: 3,
  title: "",
  doc: [],
  actionLabel: null,
  actionPath: null,
  sendEmail: true,
  sendPush: false,
  audience: { festivals: [], lists: [], people: [] },
  audienceUnreadable: false,
  essential: false,
  essentialReason: null,
  scheduleMissedDetail: null,
  scheduleMissed: false,
};

/** Everything a send needs: a title, a text and someone to send it to. */
const READY: ComposerDraft = {
  ...DRAFT,
  title: "Cambio de horario",
  doc: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }],
  audience: { festivals: [1], lists: [], people: [] },
};

function confirmation(version: number): ComunicadoSendConfirmation {
  return {
    comunicadoId: 7,
    version,
    title: "Cambio de horario de armado",
    sendEmail: true,
    sendPush: false,
    essential: false,
    essentialReason: null,
    essentialFestivalName: null,
    preview: {
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
    },
    pickedReceiving: { count: 0, names: [] },
    typedRequired: false,
    env: "production",
    notificationsLaunched: true,
    problem: null,
  };
}

function sendButton() {
  return screen.getByRole("button", { name: "Enviar…" }) as HTMLButtonElement;
}

function scheduleButton() {
  return screen.getByRole("button", {
    name: /^Programar…/,
  }) as HTMLButtonElement;
}

function renderComposer(
  draft: ComposerDraft = DRAFT,
  props: Partial<ComunicadoComposerProps> = {},
) {
  return render(
    <ComunicadoComposer
      draft={draft}
      festivals={[]}
      lists={[]}
      names={{
        festivals: { 1: "Glitter Navidad 2026" },
        lists: {},
        people: {},
      }}
      notificationsLaunched
      pushLaunched
      env="production"
      {...props}
    />,
  );
}

describe("ComunicadoComposer", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.renderPreview.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("refreshes the router on leaving after a save, so Back and the list read it again", async () => {
    mocks.save.mockResolvedValue({
      success: true,
      version: 4,
      savedAt: new Date().toISOString(),
      contentError: null,
    });
    const { unmount } = renderComposer();

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Cambio de horario" },
    });
    // Leaving the field saves at once.
    fireEvent.blur(screen.getByLabelText("Título"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    await screen.findByText("Guardado");
    expect(mocks.refresh).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("leaves the router alone when nothing was saved", async () => {
    const { unmount } = renderComposer();
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("offers to count the recipients again when the count failed", async () => {
    mocks.previewAudience
      .mockResolvedValueOnce({
        success: false,
        message: "No pudimos contar los destinatarios. Probá de nuevo.",
      })
      .mockReturnValueOnce(new Promise(() => {}));
    renderComposer({
      ...DRAFT,
      audience: { festivals: [1], lists: [], people: [] },
    });

    await screen.findByText(
      "No pudimos contar los destinatarios. Probá de nuevo.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(mocks.previewAudience).toHaveBeenCalledTimes(2));
    expect(mocks.previewAudience).toHaveBeenLastCalledWith({
      audience: { festivals: [1], lists: [], people: [] },
      essential: false,
      sendEmail: true,
    });
  });

  it("keeps «Enviar…» and «Programar…» off while something a send needs is missing", () => {
    renderComposer();
    expect(
      screen.getByText(
        /^Falta un título, el texto, al menos un destinatario\.$/,
      ),
    ).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    expect(scheduleButton().disabled).toBe(true);
    fireEvent.click(sendButton());
    fireEvent.click(scheduleButton());
    expect(mocks.loadConfirmation).not.toHaveBeenCalled();
  });

  it("keeps «Enviar…» off until the title is there too", () => {
    mocks.previewAudience.mockReturnValue(new Promise(() => {}));
    // Leaving saves the title typed.
    mocks.save.mockReturnValue(new Promise(() => {}));
    renderComposer({ ...READY, title: "" });
    expect(sendButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Cambio de horario" },
    });
    expect(sendButton().disabled).toBe(false);
  });

  it("saves what is on screen, confirms the version stored, and stops saving once sent", async () => {
    mocks.previewAudience.mockReturnValue(new Promise(() => {}));
    mocks.save.mockResolvedValue({
      success: true,
      version: 4,
      savedAt: new Date().toISOString(),
      contentError: null,
      replayed: false,
    });
    mocks.loadConfirmation.mockResolvedValue({
      success: true,
      confirmation: confirmation(4),
    });
    mocks.sendNow.mockResolvedValue({
      success: true,
      alreadySent: false,
      message: "Lo estamos enviando.",
    });
    const { unmount } = renderComposer(READY);

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Cambio de horario de armado" },
    });
    fireEvent.click(sendButton());
    // The dialog counts the stored draft: the edit goes first.
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({
      expectedVersion: 3,
      title: "Cambio de horario de armado",
    });
    await screen.findByText("¿Enviar «Cambio de horario de armado»?");
    expect(mocks.loadConfirmation).toHaveBeenCalledWith(7);

    fireEvent.click(screen.getByRole("button", { name: "Enviar ahora" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.sendNow).toHaveBeenCalledWith({
      comunicadoId: 7,
      expectedVersion: 4,
      typedCount: null,
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Lo estamos enviando.");
    // Nothing changes while the page turns into the report.
    expect((screen.getByLabelText("Título") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(sendButton().disabled).toBe(true);

    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("opens no dialog when what is on screen could not be saved", async () => {
    mocks.previewAudience.mockReturnValue(new Promise(() => {}));
    mocks.save.mockResolvedValue({
      success: false,
      code: "FAILED",
      message: "No se pudo guardar el borrador.",
    });
    renderComposer(READY);

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Cambio de horario de armado" },
    });
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "No se pudo guardar el borrador. Probá de nuevo en unos segundos.",
      ),
    );
    expect(mocks.loadConfirmation).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("saves what is on screen, then «Programar…» schedules the version stored", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Monday 26 October, 10:12 in La Paz.
    vi.setSystemTime(new Date("2026-10-26T14:12:00.000Z"));
    mocks.previewAudience.mockReturnValue(new Promise(() => {}));
    mocks.save.mockResolvedValue({
      success: true,
      version: 4,
      savedAt: new Date().toISOString(),
      contentError: null,
      replayed: false,
    });
    mocks.loadConfirmation.mockResolvedValue({
      success: true,
      confirmation: confirmation(4),
    });
    mocks.schedule.mockResolvedValue({
      success: true,
      message: "Quedó programado para el sáb, 31 oct, 9:00 AM.",
    });
    renderComposer(READY);

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Cambio de horario de armado" },
    });
    expect(scheduleButton().disabled).toBe(false);
    fireEvent.click(scheduleButton());
    // The dialog counts the stored draft: the edit goes first.
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({
      expectedVersion: 3,
      title: "Cambio de horario de armado",
    });
    await screen.findByText("¿Programar «Cambio de horario de armado»?");
    expect(mocks.loadConfirmation).toHaveBeenCalledWith(7);
    // One dialog at a time (behind it, so hidden while it is open).
    expect(
      (
        screen.getByRole("button", {
          name: "Enviar…",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Fecha y hora") as HTMLInputElement).value,
    ).toBe("2026-10-26T12:00");

    fireEvent.change(screen.getByLabelText("Fecha y hora"), {
      target: { value: "2026-10-31T09:00" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Programar para sáb, 31 oct, 9:00 AM",
      }),
    );

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.schedule).toHaveBeenCalledWith({
      comunicadoId: 7,
      expectedVersion: 4,
      scheduledAt: "2026-10-31T13:00:00.000Z",
      typedCount: null,
    });
    expect(mocks.sendNow).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Quedó programado para el sáb, 31 oct, 9:00 AM.",
    );
    // Scheduled: nothing changes while the page turns into its scheduled view.
    expect((screen.getByLabelText("Título") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(scheduleButton().disabled).toBe(true);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("keeps «Programar…» off in development, and says why", () => {
    mocks.previewAudience.mockReturnValue(new Promise(() => {}));
    renderComposer(READY, { env: "development" });
    expect(scheduleButton().disabled).toBe(true);
    expect(screen.getByText(SCHEDULE_DEVELOPMENT_REFUSAL)).toBeTruthy();
    expect(scheduleButton().getAttribute("aria-describedby")).toBe(
      screen.getByText(SCHEDULE_DEVELOPMENT_REFUSAL).id,
    );
    fireEvent.click(scheduleButton());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.loadConfirmation).not.toHaveBeenCalled();
    // A send still goes, in the app only.
    expect(sendButton().disabled).toBe(false);
  });

  it("says a duplicated draft is a copy, and of what", () => {
    const { unmount } = renderComposer(DRAFT, {
      copiedFromTitle: "Cambio de horario de armado",
    });
    expect(
      screen.getByText(
        "Copia de «Cambio de horario de armado». Revisá los destinatarios antes de enviar.",
      ),
    ).toBeTruthy();
    unmount();

    renderComposer();
    expect(screen.queryByText(/^Copia de/)).toBeNull();
    expect(screen.queryByText(SCHEDULE_DEVELOPMENT_REFUSAL)).toBeNull();
  });
});
