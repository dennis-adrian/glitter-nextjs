// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import ScheduledComunicado, {
  type ScheduledComunicadoData,
} from "@/app/components/comunicados/admin/scheduled/scheduled-comunicado";
import { VERSION_CHANGED_TEXT } from "@/app/components/comunicados/admin/send-confirm-copy";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import type {
  ComunicadoSendConfirmation,
  VercelEnvironment,
} from "@/app/lib/comunicados/contracts";
import {
  CANCELLED_TOAST,
  SCHEDULE_DEVELOPMENT_REFUSAL,
  SCHEDULE_DIALOG_HINT,
  SCHEDULE_PREVIEW_NOTE,
  SCHEDULE_STALE_MESSAGE,
  SCHEDULED_FROZEN_TEXT,
} from "@/app/lib/comunicados/schedule-copy";
import { SCHEDULE_DATE_MESSAGES } from "@/app/lib/comunicados/schedule-rules";
import {
  parseStoreDateTimeLocal,
  toStoreDateTimeLocal,
} from "@/app/lib/schedule-time";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  load: vi.fn(),
  send: vi.fn(),
  reschedule: vi.fn(),
  cancel: vi.fn(),
  renderPreview: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/app/lib/comunicados/send-actions", () => ({
  loadComunicadoSendConfirmationAction: mocks.load,
  sendComunicadoNowAction: mocks.send,
}));
vi.mock("@/app/lib/comunicados/schedule-actions", () => ({
  scheduleComunicadoAction: vi.fn(),
  rescheduleComunicadoAction: mocks.reschedule,
  cancelComunicadoScheduleAction: mocks.cancel,
}));
vi.mock("@/app/lib/comunicados/preview-actions", () => ({
  renderComunicadoPreviewAction: mocks.renderPreview,
}));
vi.mock("@/app/lib/comunicados/process-actions", () => ({
  processPendingComunicadosAction: vi.fn(),
}));
// "Duplicar" is its own component, tested on its own: here, only where it
// goes and for which comunicado.
vi.mock("@/app/components/comunicados/admin/duplicate-button", () => ({
  default: ({ comunicadoId }: { comunicadoId: number }) => (
    <button type="button" data-comunicado-id={comunicadoId}>
      Duplicar
    </button>
  ),
}));
// Whether the page follows a release that may come any moment.
vi.mock("@/app/components/credit_gifts/admin/credit-gift-auto-refresh", () => ({
  default: ({ active }: { active: boolean }) => (
    <div data-testid="auto-refresh" data-active={String(active)} />
  ),
}));

const DAY_MS = 24 * 60 * 60_000;

const DOC = [
  {
    type: "paragraph",
    props: {},
    content: [
      { type: "text", text: "El armado empieza a las 8:00.", styles: {} },
    ],
    children: [],
  },
];

function comunicado(
  overrides: Partial<ScheduledComunicadoData> = {},
): ScheduledComunicadoData {
  return {
    id: 7,
    version: 3,
    title: "Cambio de horario de armado",
    doc: DOC,
    actionLabel: "Ver horarios",
    actionPath: "/festivals/12",
    sendEmail: true,
    sendPush: false,
    essential: false,
    essentialReason: null,
    essentialFestivalName: null,
    scheduledAt: "2026-10-31T13:00:00.000Z",
    scheduledByName: "Dennis",
    ...overrides,
  };
}

function setup({
  data = {},
  overdue = false,
  env = "production",
  audienceLabel = "Para: Confirmados · Glitter Navidad 2026 y 3 personas",
}: {
  data?: Partial<ScheduledComunicadoData>;
  overdue?: boolean;
  env?: VercelEnvironment;
  audienceLabel?: string | null;
} = {}) {
  return render(
    <ScheduledComunicado
      comunicado={comunicado(data)}
      audienceLabel={audienceLabel}
      overdue={overdue}
      env={env}
    />,
  );
}

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

function headerButton(name: string) {
  return screen.getAllByRole("button", { name })[0] as HTMLButtonElement;
}

/** A La Paz time two days from now, as the picker writes it. */
function inTwoDays() {
  return toStoreDateTimeLocal(new Date(Date.now() + 2 * 24 * 60 * 60_000));
}

function openReschedule() {
  fireEvent.click(headerButton("Cambiar fecha"));
  return screen.getByRole("dialog");
}

function pick(dialog: HTMLElement, value: string) {
  fireEvent.change(within(dialog).getByLabelText("Fecha y hora"), {
    target: { value },
  });
}

describe("ScheduledComunicado", () => {
  /** What the page logs of a request that failed; nothing else may log. */
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.renderPreview.mockResolvedValue({
      success: false,
      message: "Vista previa de prueba.",
    });
  });

  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("is frozen: the banner, when it goes out and who scheduled it, and nothing to edit", async () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "Cambio de horario de armado" }),
    ).toBeTruthy();
    expect(screen.getByText("Programado · sáb, 31 oct, 9:00 AM")).toBeTruthy();
    expect(screen.getByText(SCHEDULED_FROZEN_TEXT)).toBeTruthy();
    expect(
      screen.getByText(
        "Programado para el sábado, 31 de octubre, 9:00 AM (hora de Bolivia) · lo programó Dennis",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Comunicados" }).getAttribute("href"),
    ).toBe("/dashboard/communications");
    // No editor and no field: nothing here saves (G1).
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(SCHEDULE_PREVIEW_NOTE)).toBeNull();
    expect(screen.queryByText("Esencial")).toBeNull();

    // The message, rendered as the composer's preview renders it.
    await screen.findByText("Vista previa de prueba.");
    expect(mocks.renderPreview).toHaveBeenCalledWith({
      title: "Cambio de horario de armado",
      doc: DOC,
      actionLabel: "Ver horarios",
      actionPath: "/festivals/12",
      essentialFestivalName: null,
    });
  });

  it("leaves the scheduler out when nobody is on record, and names an untitled one", () => {
    setup({ data: { scheduledByName: null, title: "   " } });

    expect(
      screen.getByText(
        "Programado para el sábado, 31 de octubre, 9:00 AM (hora de Bolivia)",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sin título" })).toBeTruthy();
  });

  it("says who receives it and on which channels, with the essential reason", async () => {
    setup({
      data: {
        sendPush: true,
        sendEmail: true,
        essential: true,
        essentialReason: "El armado se adelanta por la lluvia",
        essentialFestivalName: "Glitter Navidad 2026",
      },
    });

    expect(
      screen.getByText("Para: Confirmados · Glitter Navidad 2026 y 3 personas"),
    ).toBeTruthy();
    const channels = within(screen.getByRole("list", { name: "Canales" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(channels).toEqual([
      "En la app (sí)",
      "Por correo (sí)",
      "En el dispositivo (sí)",
    ]);
    expect(
      screen.getByText(
        "Correo esencial · Confirmados · Glitter Navidad 2026 · «El armado se adelanta por la lluvia»",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Esencial")).toBeTruthy();
    // The email's essential note names the festival, as the send's will.
    await waitFor(() =>
      expect(mocks.renderPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          essentialFestivalName: "Glitter Navidad 2026",
        }),
      ),
    );
  });

  it("marks the channels left out, and an audience it cannot name", () => {
    setup({ data: { sendEmail: false }, audienceLabel: null });

    const channels = within(screen.getByRole("list", { name: "Canales" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(channels).toEqual([
      "En la app (sí)",
      "Por correo (no)",
      "En el dispositivo (no)",
    ]);
    expect(screen.getByText("Sin destinatarios")).toBeTruthy();
    expect(screen.queryByText(/Correo esencial/)).toBeNull();
  });

  it("offers its four actions", () => {
    setup();

    for (const name of [
      "Enviar ahora",
      "Cambiar fecha",
      "Cancelar programación",
      "Duplicar",
    ]) {
      expect(screen.getAllByRole("button", { name })).toHaveLength(1);
    }
    expect(
      screen
        .getByRole("button", { name: "Duplicar" })
        .getAttribute("data-comunicado-id"),
    ).toBe("7");
  });

  it("adds the preview note on a preview", () => {
    setup({ env: "preview" });
    expect(screen.getByText(SCHEDULE_PREVIEW_NOTE)).toBeTruthy();
  });

  describe("overdue (E6)", () => {
    const OVERDUE =
      "Debería haber salido el sáb, 31 oct, 9:00 AM y todavía no salió.";
    const AT = Date.parse("2026-10-31T13:00:00.000Z");

    /** The page's own clock, for the timer that waits for its time. */
    function clockAt(ms: number) {
      vi.useFakeTimers({
        now: ms,
        toFake: ["Date", "setTimeout", "clearTimeout"],
      });
    }

    function refreshing() {
      return screen.getByTestId("auto-refresh").getAttribute("data-active");
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it("says nothing, and does not refresh itself, until it is overdue", () => {
      clockAt(AT - 60 * 60_000);
      setup();
      expect(screen.queryByText(OVERDUE)).toBeNull();
      expect(
        screen.getByTestId("auto-refresh").getAttribute("data-active"),
      ).toBe("false");
    });

    it("follows the release from its time on, rendered before it", () => {
      clockAt(AT - 60_000);
      setup();
      expect(refreshing()).toBe("false");

      act(() => vi.advanceTimersByTime(59_000));
      expect(refreshing()).toBe("false");
      act(() => vi.advanceTimersByTime(1_000));
      expect(refreshing()).toBe("true");
      // The banner is the server's to judge, on the refresh that follows.
      expect(screen.queryByText(OVERDUE)).toBeNull();
    });

    it("follows it at once when its time has passed but it is not overdue yet", () => {
      clockAt(AT + 30_000);
      setup();
      expect(refreshing()).toBe("true");
    });

    it("waits for a time weeks away without a timer firing early", () => {
      // Past setTimeout's longest delay (about 24.8 days), which would fire
      // at once.
      clockAt(AT - 40 * DAY_MS);
      setup();

      act(() => vi.advanceTimersByTime(30 * DAY_MS));
      expect(refreshing()).toBe("false");
      act(() => vi.advanceTimersByTime(10 * DAY_MS));
      expect(refreshing()).toBe("true");
    });

    it("says it should have gone out, offers Enviar ahora, and follows the release", () => {
      setup({ overdue: true });

      const banner = screen.getByText(OVERDUE).closest("div.border")!;
      expect(
        within(banner as HTMLElement).getByRole("button", {
          name: "Enviar ahora",
        }),
      ).toBeTruthy();
      expect(
        within(banner as HTMLElement).queryByRole("button", {
          name: "Procesar envíos pendientes",
        }),
      ).toBeNull();
      expect(
        screen.getByTestId("auto-refresh").getAttribute("data-active"),
      ).toBe("true");
    });

    it("also offers Procesar envíos pendientes on a preview, where no cron runs", () => {
      setup({ overdue: true, env: "preview" });

      const banner = screen.getByText(OVERDUE).closest("div.border")!;
      expect(
        within(banner as HTMLElement).getByRole("button", {
          name: "Procesar envíos pendientes",
        }),
      ).toBeTruthy();
    });
  });

  describe("Enviar ahora", () => {
    it("sends what is stored at the version the page read, then refreshes", async () => {
      mocks.load.mockResolvedValue({
        success: true,
        confirmation: confirmation(3),
      });
      mocks.send.mockResolvedValue({
        success: true,
        alreadySent: false,
        message: "Lo estamos enviando.",
      });
      setup();

      fireEvent.click(headerButton("Enviar ahora"));
      const dialog = await screen.findByRole("alertdialog");
      expect(mocks.load).toHaveBeenCalledWith(7);
      const send = within(dialog).getByRole("button", {
        name: "Enviar ahora",
      }) as HTMLButtonElement;
      await waitFor(() => expect(send.disabled).toBe(false));
      fireEvent.click(send);

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      expect(mocks.send).toHaveBeenCalledWith({
        comunicadoId: 7,
        expectedVersion: 3,
        typedCount: null,
      });
      expect(mocks.success).toHaveBeenCalledWith("Lo estamos enviando.");
    });

    it("does not send numbers for another version than the page shows", async () => {
      mocks.load.mockResolvedValue({
        success: true,
        confirmation: confirmation(4),
      });
      setup();

      fireEvent.click(headerButton("Enviar ahora"));
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
    });
  });

  describe("Cambiar fecha", () => {
    it("starts from the current time, with the E5 copy", () => {
      setup({ env: "preview" });
      const dialog = openReschedule();

      expect(
        within(dialog).getByRole("heading", { name: "Cambiar fecha" }),
      ).toBeTruthy();
      expect(within(dialog).getByText(SCHEDULE_DIALOG_HINT)).toBeTruthy();
      expect(within(dialog).getByText(SCHEDULE_PREVIEW_NOTE)).toBeTruthy();
      expect(
        (within(dialog).getByLabelText("Fecha y hora") as HTMLInputElement)
          .value,
      ).toBe("2026-10-31T09:00");
      expect(
        within(dialog).getByRole("button", { name: "Guardar fecha" }),
      ).toBeTruthy();
    });

    it("moves it at the version the page read, then closes and refreshes", async () => {
      mocks.reschedule.mockResolvedValue({
        success: true,
        message: "Ahora sale el lun, 2 nov, 10:30 AM.",
      });
      setup();
      const dialog = openReschedule();
      const value = inTwoDays();
      pick(dialog, value);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Guardar fecha" }),
      );

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      expect(mocks.reschedule).toHaveBeenCalledWith({
        comunicadoId: 7,
        expectedVersion: 3,
        scheduledAt: parseStoreDateTimeLocal(value)!.toISOString(),
      });
      expect(mocks.success).toHaveBeenCalledWith(
        "Ahora sale el lun, 2 nov, 10:30 AM.",
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("refuses a time too soon before asking the server", () => {
      setup();
      const dialog = openReschedule();
      pick(dialog, toStoreDateTimeLocal(new Date(Date.now() + 60_000)));

      expect(
        within(dialog).getByText(SCHEDULE_DATE_MESSAGES.tooSoon),
      ).toBeTruthy();
      expect(
        (
          within(dialog).getByRole("button", {
            name: "Guardar fecha",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(mocks.reschedule).not.toHaveBeenCalled();
    });

    it("keeps a refusal about the time in the dialog", async () => {
      mocks.reschedule.mockResolvedValue({
        success: false,
        code: "INVALID_DATE",
        message: SCHEDULE_DATE_MESSAGES.tooSoon,
      });
      setup();
      const dialog = openReschedule();
      pick(dialog, inTwoDays());
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Guardar fecha" }),
      );

      await within(dialog).findByText(SCHEDULE_DATE_MESSAGES.tooSoon);
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.error).not.toHaveBeenCalled();
    });

    it("shows the comunicado as it is now when the page was out of date", async () => {
      mocks.reschedule.mockResolvedValue({
        success: false,
        code: "STALE",
        message: SCHEDULE_STALE_MESSAGE,
      });
      setup();
      const dialog = openReschedule();
      pick(dialog, inTwoDays());
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Guardar fecha" }),
      );

      await waitFor(() =>
        expect(mocks.error).toHaveBeenCalledWith(SCHEDULE_STALE_MESSAGE),
      );
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("cannot be used in development, and says why", () => {
      setup({ env: "development" });

      const button = headerButton("Cambiar fecha");
      expect(button.disabled).toBe(true);
      const note = screen.getByText(SCHEDULE_DEVELOPMENT_REFUSAL);
      expect(button.getAttribute("aria-describedby")).toBe(note.id);
      // Cancelling is a stop: it still works there (§J's notes).
      expect(headerButton("Cancelar programación").disabled).toBe(false);
    });
  });

  describe("Cancelar programación", () => {
    function openCancel() {
      fireEvent.click(headerButton("Cancelar programación"));
      return screen.getByRole("alertdialog");
    }

    it("asks first, then cancels, says so and refreshes into the draft", async () => {
      let resolve!: (value: { success: true; message: string }) => void;
      mocks.cancel.mockReturnValue(new Promise((r) => (resolve = r)));
      setup();
      const dialog = openCancel();

      expect(
        within(dialog).getByText("¿Cancelar la programación?"),
      ).toBeTruthy();
      expect(
        within(dialog).getByText(
          "Vuelve a ser un borrador y no se envía. Podés programarlo de nuevo.",
        ),
      ).toBeTruthy();
      expect(
        within(dialog).getByRole("button", { name: "Volver" }),
      ).toBeTruthy();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Cancelar programación" }),
      );

      await within(dialog).findByRole("button", { name: "Cancelando…" });
      expect(mocks.cancel).toHaveBeenCalledTimes(1);
      expect(mocks.cancel).toHaveBeenCalledWith({ comunicadoId: 7 });

      resolve({ success: true, message: CANCELLED_TOAST });
      await waitFor(() =>
        expect(mocks.success).toHaveBeenCalledWith(CANCELLED_TOAST),
      );
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    });

    it("says why when it already started sending, and refreshes into the report", async () => {
      const message =
        "Ya se empezó a enviar. Si no querés que llegue, retiralo.";
      mocks.cancel.mockResolvedValue({
        success: false,
        code: "NOT_SCHEDULED",
        message,
      });
      setup();
      const dialog = openCancel();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Cancelar programación" }),
      );

      await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(message));
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      expect(mocks.success).not.toHaveBeenCalled();
    });

    it("stays open to try again when the request itself failed", async () => {
      mocks.cancel.mockRejectedValue(new Error("network"));
      setup();
      const dialog = openCancel();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Cancelar programación" }),
      );

      await waitFor(() =>
        expect(mocks.error).toHaveBeenCalledWith(
          "No pudimos cancelar la programación. Probá de nuevo.",
        ),
      );
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "Error cancelling a comunicado's schedule",
        expect.any(Error),
      );
      consoleError.mockClear();
    });
  });
});
