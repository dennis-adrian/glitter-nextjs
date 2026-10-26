// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

import { VERSION_CHANGED_TEXT } from "@/app/components/comunicados/admin/send-confirm-copy";
import SendConfirmDialog from "@/app/components/comunicados/admin/send-confirm-dialog";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import type {
  ComunicadoSendConfirmation,
  LoadSendConfirmationResult,
  ScheduleActionResult,
  SendComunicadoNowResult,
} from "@/app/lib/comunicados/contracts";
import {
  SCHEDULE_DEVELOPMENT_REFUSAL,
  SCHEDULE_DIALOG_HINT,
  SCHEDULE_PREVIEW_NOTE,
  SCHEDULE_STALE_MESSAGE,
} from "@/app/lib/comunicados/schedule-copy";
import { COMUNICADO_SKIP_REASONS } from "@/app/lib/comunicados/skip-reasons";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  send: vi.fn(),
  schedule: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/send-actions", () => ({
  loadComunicadoSendConfirmationAction: mocks.load,
  sendComunicadoNowAction: mocks.send,
}));
vi.mock("@/app/lib/comunicados/schedule-actions", () => ({
  scheduleComunicadoAction: mocks.schedule,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const TITLE = "¿Enviar «Cambio de horario de armado»?";
// A send never left unanswered: React entangles every async transition
// still pending, so one would keep the next tests' "Enviando…" on.
const SENDING: SendComunicadoNowResult = {
  success: true,
  alreadySent: false,
  message: "Lo estamos enviando.",
};

function preview(
  overrides: Partial<ComunicadoAudiencePreview> = {},
): ComunicadoAudiencePreview {
  return {
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
    ...overrides,
  };
}

/** The counts as the loader reads them; `typedRequired` follows B8's rule. */
function confirmation(
  overrides: Partial<ComunicadoSendConfirmation> = {},
): ComunicadoSendConfirmation {
  const base: ComunicadoSendConfirmation = {
    comunicadoId: 7,
    version: 3,
    title: "Cambio de horario de armado",
    sendEmail: true,
    sendPush: false,
    essential: false,
    essentialReason: null,
    essentialFestivalName: null,
    preview: preview(),
    pickedReceiving: { count: 0, names: [] },
    typedRequired: false,
    env: "production",
    notificationsLaunched: true,
    problem: null,
    ...overrides,
  };
  return {
    ...base,
    typedRequired: base.preview.eligible >= 300 || base.essential,
  };
}

function loaded(
  overrides: Partial<ComunicadoSendConfirmation> = {},
): LoadSendConfirmationResult {
  return { success: true, confirmation: confirmation(overrides) };
}

function withEligible(eligible: number) {
  return {
    preview: preview({
      matched: eligible,
      eligible,
      willReceive: eligible,
      email: { ...preview().email, sendTo: eligible },
    }),
  };
}

function setup(props: Partial<Parameters<typeof SendConfirmDialog>[0]> = {}) {
  const resume = vi.fn();
  const handlers = {
    onOpenChange: vi.fn(),
    onBeforeSend: vi.fn(async () => resume),
    onSent: vi.fn(),
  };
  const all = {
    comunicadoId: 7,
    open: true,
    knownVersion: 3,
    ...handlers,
    ...props,
  };
  const view = render(<SendConfirmDialog {...all} />);
  return {
    ...view,
    ...handlers,
    resume,
    rerender: (next: Partial<typeof all>) =>
      view.rerender(<SendConfirmDialog {...all} {...next} />),
  };
}

function sendButton() {
  return screen.getByRole("button", {
    name: "Enviar ahora",
  }) as HTMLButtonElement;
}

function typeCount(value: string, eligible: number) {
  fireEvent.change(
    screen.getByLabelText(
      `Para confirmar, escribí la cantidad de personas: ${eligible}`,
    ),
    { target: { value } },
  );
}

describe("SendConfirmDialog", () => {
  /** What the dialog logs of a request that failed; nothing else may log. */
  const LOGGED = [
    "Error counting a comunicado's recipients",
    "Error sending a comunicado",
    "Error scheduling a comunicado",
  ];
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    // React's and Radix's warnings included.
    const unexpected = [
      ...consoleError.mock.calls.filter(
        ([first]) => !LOGGED.includes(String(first)),
      ),
      ...consoleWarn.mock.calls,
    ];
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    expect(unexpected).toEqual([]);
  });

  it("counts the stored draft's recipients when it opens, then restates them", async () => {
    let answer: (result: LoadSendConfirmationResult) => void = () => {};
    mocks.load.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    setup();
    expect(mocks.load).toHaveBeenCalledWith(7);
    expect(screen.getByText("Contando destinatarios…")).toBeTruthy();
    expect(sendButton().disabled).toBe(true);

    await act(async () => answer(loaded()));
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.queryByText("Contando destinatarios…")).toBeNull();
    expect(screen.getByText("Pueden recibirlo hoy")).toBeTruthy();
    expect(screen.getByText("12 personas")).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
  });

  it("asks for no typed count at 299", async () => {
    mocks.load.mockResolvedValue(loaded(withEligible(299)));
    setup();
    await screen.findByText(TITLE);
    expect(screen.queryByLabelText(/Para confirmar/)).toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  it("asks for the count at 300, and sends only once it matches", async () => {
    mocks.load.mockResolvedValue(loaded(withEligible(300)));
    mocks.send.mockResolvedValue(SENDING);
    const { onBeforeSend } = setup();
    await screen.findByText(TITLE);

    expect(sendButton().disabled).toBe(true);
    typeCount("30", 300);
    expect(sendButton().disabled).toBe(true);
    fireEvent.click(sendButton());
    expect(onBeforeSend).not.toHaveBeenCalled();

    typeCount("300", 300);
    expect(sendButton().disabled).toBe(false);
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    expect(mocks.send).toHaveBeenCalledWith({
      comunicadoId: 7,
      expectedVersion: 3,
      typedCount: 300,
    });
  });

  it("asks for the count of an essential send, however small", async () => {
    mocks.load.mockResolvedValue(
      loaded({
        essential: true,
        essentialReason: "El armado se adelanta a las 7:00 por la lluvia",
      }),
    );
    mocks.send.mockResolvedValue(SENDING);
    setup();
    await screen.findByText(TITLE);

    expect(sendButton().disabled).toBe(true);
    expect(
      screen.getByText(
        /^Es un correo esencial:.*Queda registrado a tu nombre\.$/,
      ),
    ).toBeTruthy();
    typeCount("1 2", 12);
    expect(sendButton().disabled).toBe(false);
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({ typedCount: 12 }),
      ),
    );
  });

  it("sends what it showed, pausing the autosave first, and hands over on success", async () => {
    mocks.load.mockResolvedValue(loaded());
    let paused: () => void = () => {};
    const resume = vi.fn();
    const onBeforeSend = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          paused = () => resolve(resume);
        }),
    );
    mocks.send.mockResolvedValue(SENDING);
    const { onSent, onOpenChange } = setup({ onBeforeSend });
    await screen.findByText(TITLE);

    fireEvent.click(sendButton());
    await waitFor(() => expect(onBeforeSend).toHaveBeenCalledTimes(1));
    // The draft is not sent while a save may still reach it.
    expect(mocks.send).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Volver" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => paused());
    expect(mocks.send).toHaveBeenCalledWith({
      comunicadoId: 7,
      expectedVersion: 3,
      typedCount: null,
    });
    expect(onSent).toHaveBeenCalledWith({ alreadySent: false });
    expect(mocks.success).toHaveBeenCalledWith("Lo estamos enviando.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Sent: the autosave stays stopped.
    expect(resume).not.toHaveBeenCalled();
  });

  it("takes a send already under way as done", async () => {
    mocks.load.mockResolvedValue(loaded());
    mocks.send.mockResolvedValue({
      success: true,
      alreadySent: true,
      message: "Este comunicado ya se está enviando.",
    } satisfies SendComunicadoNowResult);
    const { onSent } = setup();
    await screen.findByText(TITLE);
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith({ alreadySent: true }),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Este comunicado ya se está enviando.",
    );
  });

  it("reloads the numbers when the audience changed, and asks for the new count", async () => {
    mocks.load
      .mockResolvedValueOnce(loaded(withEligible(1_240)))
      .mockResolvedValueOnce(loaded(withEligible(1_251)));
    const message =
      "La audiencia cambió: ahora son 1.251 personas. Revisá y confirmá de nuevo.";
    mocks.send.mockResolvedValue({
      success: false,
      code: "AUDIENCE_CHANGED",
      message,
    } satisfies SendComunicadoNowResult);
    const { onSent, onOpenChange, resume } = setup();
    await screen.findByText("1.240 personas");

    typeCount("1240", 1_240);
    fireEvent.click(sendButton());

    await screen.findByText("1.251 personas");
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toBe(message);
    // The new count is typed anew.
    const input = screen.getByLabelText(
      "Para confirmar, escribí la cantidad de personas: 1251",
    ) as HTMLInputElement;
    expect(input.value).toBe("");
    await screen.findByRole("button", { name: "Enviar ahora" });
    expect(sendButton().disabled).toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(onSent).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("refuses to send numbers for another version than this tab stored", async () => {
    mocks.load.mockResolvedValue(loaded({ version: 4 }));
    const { onBeforeSend } = setup({ knownVersion: 3 });
    await screen.findByText(VERSION_CHANGED_TEXT);
    expect(sendButton().disabled).toBe(true);
    fireEvent.click(sendButton());
    expect(onBeforeSend).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("skips the version check when there is no known version", async () => {
    mocks.load.mockResolvedValue(loaded({ version: 4 }));
    setup({ knownVersion: null });
    await screen.findByText(TITLE);
    expect(screen.queryByText(VERSION_CHANGED_TEXT)).toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  it("shows what the send would refuse, and does not send", async () => {
    mocks.load.mockResolvedValue(
      loaded({
        ...withEligible(0),
        problem: "Nadie de esta audiencia puede recibirlo.",
      }),
    );
    setup();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nadie de esta audiencia puede recibirlo.",
    );
    expect(sendButton().disabled).toBe(true);
  });

  it("renders who really receives it on a preview", async () => {
    mocks.load.mockResolvedValue(
      loaded({
        env: "preview",
        // The two picked by name count among who can receive it.
        preview: preview({
          eligible: 1_242,
          narrowed: true,
          stagingAdmins: 4,
          willReceive: 6,
          skipped: [{ reason: COMUNICADO_SKIP_REASONS.staging, count: 1_236 }],
          skippedTotal: 1_236,
        }),
        pickedReceiving: { count: 2, names: ["Ana Pérez", "Luis Rojas"] },
        notificationsLaunched: false,
      }),
    );
    setup();
    await screen.findByText(
      "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores. Las 2 personas elegidas por nombre sí lo reciben, con un correo real marcado como prueba: Ana Pérez, Luis Rojas.",
    );
    expect(
      screen.getByText(
        "Los participantes todavía no ven la campana: les llega solo el correo.",
      ),
    ).toBeTruthy();
  });

  it("renders who really receives it in development", async () => {
    mocks.load.mockResolvedValue(
      loaded({
        env: "development",
        sendPush: true,
        preview: preview({ eligible: 1_242, narrowed: true, stagingAdmins: 4 }),
        pickedReceiving: { count: 2, names: ["Ana Pérez", "Luis Rojas"] },
      }),
    );
    setup();
    await screen.findByText(
      "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores. Las 2 personas elegidas por nombre lo reciben en la app (en desarrollo no se envían correos).",
    );
    expect(
      screen.getByText(
        "La notificación en el dispositivo no se puede borrar una vez que llega, aunque después edites o retires el comunicado.",
      ),
    ).toBeTruthy();
  });

  it("offers to count again when the count failed", async () => {
    mocks.load
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(loaded());
    setup();
    await screen.findByText(
      "No pudimos contar los destinatarios. Probá de nuevo.",
    );
    expect(sendButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText(TITLE);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(sendButton().disabled).toBe(false);
  });

  it("shows the loader's own refusal", async () => {
    mocks.load.mockResolvedValue({
      success: false,
      message: "Este comunicado ya se envió.",
    } satisfies LoadSendConfirmationResult);
    setup();
    await screen.findByText("Este comunicado ya se envió.");
    expect(sendButton().disabled).toBe(true);
  });

  it("closes and reads the page again when the draft changed since it opened", async () => {
    mocks.load.mockResolvedValue(loaded());
    const message =
      "El borrador cambió desde que abriste la confirmación. Revisalo y confirmá de nuevo.";
    mocks.send.mockResolvedValue({
      success: false,
      code: "STALE",
      message,
    } satisfies SendComunicadoNowResult);
    const { onOpenChange, onSent, resume } = setup();
    await screen.findByText(TITLE);
    fireEvent.click(sendButton());

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.error).toHaveBeenCalledWith(message);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(onSent).not.toHaveBeenCalled();
  });

  it("keeps any other refusal in the dialog, and lets the autosave go on", async () => {
    mocks.load.mockResolvedValue(loaded());
    const message =
      "Por ahora un comunicado llega a 3.000 personas como máximo. Achicá la audiencia con una lista más precisa.";
    mocks.send.mockResolvedValue({
      success: false,
      code: "AUDIENCE_TOO_LARGE",
      message,
    } satisfies SendComunicadoNowResult);
    const { onOpenChange, resume } = setup();
    await screen.findByText(TITLE);
    fireEvent.click(sendButton());

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    // Free to try again once the answer is in.
    await screen.findByRole("button", { name: "Enviar ahora" });
    expect(sendButton().disabled).toBe(false);
  });

  it("says a send that never answered failed, and lets the autosave go on", async () => {
    mocks.load.mockResolvedValue(loaded());
    mocks.send.mockRejectedValue(new TypeError("Failed to fetch"));
    const { resume } = setup();
    await screen.findByText(TITLE);
    fireEvent.click(sendButton());

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No pudimos enviarlo. Intentá de nuevo en unos minutos.",
    );
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("starts over each time it opens", async () => {
    mocks.load
      .mockResolvedValueOnce(loaded(withEligible(1_240)))
      .mockResolvedValueOnce(loaded(withEligible(1_240)));
    const { rerender } = setup();
    await screen.findByText("1.240 personas");
    typeCount("1240", 1_240);
    expect(sendButton().disabled).toBe(false);

    rerender({ open: false });
    rerender({ open: true });
    expect(screen.getByText("Contando destinatarios…")).toBeTruthy();
    await screen.findByText("1.240 personas");
    expect(mocks.load).toHaveBeenCalledTimes(2);
    const input = screen.getByLabelText(
      "Para confirmar, escribí la cantidad de personas: 1240",
    ) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(sendButton().disabled).toBe(true);
  });

  it("picks no time when it sends", async () => {
    mocks.load.mockResolvedValue(loaded());
    setup();
    await screen.findByText(TITLE);
    expect(screen.queryByLabelText("Fecha y hora")).toBeNull();
    expect(screen.queryByText(SCHEDULE_DIALOG_HINT)).toBeNull();
    expect(screen.queryByText(/^La audiencia se calcula/)).toBeNull();
  });

  describe("«Programar…»", () => {
    const SCHEDULE_TITLE = "¿Programar «Cambio de horario de armado»?";
    /** Monday 26 October, 10:12 in La Paz. */
    const NOW = new Date("2026-10-26T14:12:00.000Z");
    const SCHEDULED: ScheduleActionResult = {
      success: true,
      message: "Quedó programado para el sáb, 31 oct, 9:00 AM.",
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function setupSchedule(
      props: Partial<Parameters<typeof SendConfirmDialog>[0]> = {},
    ) {
      return setup({ mode: "schedule", ...props });
    }

    function picker() {
      return screen.getByLabelText("Fecha y hora") as HTMLInputElement;
    }

    function pick(value: string) {
      fireEvent.change(picker(), { target: { value } });
    }

    function scheduleButton() {
      return screen.getByRole("button", {
        name: /^Programar( para |$)/,
      }) as HTMLButtonElement;
    }

    it("picks the time on top, the next full hour plus one, and counts today's audience", async () => {
      let answer: (result: LoadSendConfirmationResult) => void = () => {};
      mocks.load.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      setupSchedule();
      // The time is picked while the numbers load.
      expect(screen.getByText("¿Programar este comunicado?")).toBeTruthy();
      expect(picker().value).toBe("2026-10-26T12:00");
      expect(screen.getByText(SCHEDULE_DIALOG_HINT)).toBeTruthy();
      expect(scheduleButton().disabled).toBe(true);

      await act(async () => answer(loaded()));
      expect(screen.getByText(SCHEDULE_TITLE)).toBeTruthy();
      expect(screen.getByText("12 personas")).toBeTruthy();
      expect(
        screen.getByText(
          "La audiencia se calcula al momento del envío: hoy serían 12 personas.",
        ),
      ).toBeTruthy();
      expect(screen.queryByText(SCHEDULE_PREVIEW_NOTE)).toBeNull();
      expect(scheduleButton().textContent).toBe(
        "Programar para lun, 26 oct, 12:00 PM",
      );
      expect(scheduleButton().disabled).toBe(false);
      expect(screen.queryByRole("button", { name: "Enviar ahora" })).toBeNull();
    });

    it("says on a preview that nothing releases it by itself", async () => {
      mocks.load.mockResolvedValue(loaded({ env: "preview" }));
      setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      expect(screen.getByText(SCHEDULE_PREVIEW_NOTE)).toBeTruthy();
    });

    it("cannot schedule in development", async () => {
      mocks.load.mockResolvedValue(loaded({ env: "development" }));
      const { onBeforeSend } = setupSchedule();
      expect((await screen.findByRole("alert")).textContent).toBe(
        SCHEDULE_DEVELOPMENT_REFUSAL,
      );
      expect(scheduleButton().disabled).toBe(true);
      fireEvent.click(scheduleButton());
      expect(onBeforeSend).not.toHaveBeenCalled();
      expect(mocks.schedule).not.toHaveBeenCalled();
    });

    it("names the time picked on its button", async () => {
      mocks.load.mockResolvedValue(loaded());
      setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      pick("2026-10-31T09:00");
      expect(scheduleButton().textContent).toBe(
        "Programar para sáb, 31 oct, 9:00 AM",
      );
      expect(scheduleButton().disabled).toBe(false);
    });

    it("refuses a time too soon, too far or unfinished, under the picker", async () => {
      mocks.load.mockResolvedValue(loaded());
      const { onBeforeSend } = setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);

      // 3 minutes from now.
      pick("2026-10-26T10:15");
      expect(screen.getByRole("alert").textContent).toBe(
        "Elegí una hora al menos 5 minutos más adelante.",
      );
      expect(scheduleButton().disabled).toBe(true);
      fireEvent.click(scheduleButton());
      expect(onBeforeSend).not.toHaveBeenCalled();

      pick("2027-01-01T09:00");
      expect(screen.getByRole("alert").textContent).toBe(
        "Elegí una fecha dentro de los próximos 60 días.",
      );
      expect(scheduleButton().disabled).toBe(true);

      // What an unfinished field reads.
      pick("");
      expect(screen.getByRole("alert").textContent).toBe(
        "Elegí una fecha y hora válidas.",
      );
      expect(scheduleButton().textContent).toBe("Programar");
      expect(scheduleButton().disabled).toBe(true);

      pick("2026-10-26T10:17");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(scheduleButton().disabled).toBe(false);
      expect(mocks.schedule).not.toHaveBeenCalled();
    });

    it("checks the time again on confirming, by the clock then", async () => {
      mocks.load.mockResolvedValue(loaded());
      const { onBeforeSend } = setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      pick("2026-10-26T10:20");
      expect(scheduleButton().disabled).toBe(false);

      // The dialog sat open: 10:20 is now 3 minutes away.
      vi.setSystemTime(new Date("2026-10-26T14:17:00.000Z"));
      fireEvent.click(scheduleButton());
      expect(screen.getByRole("alert").textContent).toBe(
        "Elegí una hora al menos 5 minutos más adelante.",
      );
      expect(onBeforeSend).not.toHaveBeenCalled();
      expect(mocks.schedule).not.toHaveBeenCalled();
    });

    it("schedules what it showed for the instant picked, with the count typed, and hands over", async () => {
      mocks.load.mockResolvedValue(loaded(withEligible(300)));
      mocks.schedule.mockResolvedValue(SCHEDULED);
      const { onBeforeSend, onSent, onOpenChange, resume } = setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);

      pick("2026-10-31T09:00");
      expect(scheduleButton().disabled).toBe(true);
      typeCount("300", 300);
      fireEvent.click(scheduleButton());

      await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
      expect(onBeforeSend).toHaveBeenCalledTimes(1);
      // 9:00 in La Paz.
      expect(mocks.schedule).toHaveBeenCalledWith({
        comunicadoId: 7,
        expectedVersion: 3,
        scheduledAt: "2026-10-31T13:00:00.000Z",
        typedCount: 300,
      });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(onSent).toHaveBeenCalledWith({ alreadySent: false });
      expect(mocks.success).toHaveBeenCalledWith(SCHEDULED.message);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      // Scheduled: the autosave stays stopped.
      expect(resume).not.toHaveBeenCalled();
    });

    it("stays busy while the schedule is under way", async () => {
      mocks.load.mockResolvedValue(loaded());
      let answer: (result: ScheduleActionResult) => void = () => {};
      mocks.schedule.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      fireEvent.click(scheduleButton());

      await screen.findByRole("button", { name: "Programando…" });
      expect(picker().disabled).toBe(true);
      expect(
        (screen.getByRole("button", { name: "Volver" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      await act(async () => answer(SCHEDULED));
    });

    it("reloads the numbers when the audience changed, and keeps the time picked", async () => {
      mocks.load
        .mockResolvedValueOnce(loaded(withEligible(1_240)))
        .mockResolvedValueOnce(loaded(withEligible(1_251)));
      const message =
        "La audiencia cambió: ahora son 1.251 personas. Revisá y confirmá de nuevo.";
      mocks.schedule.mockResolvedValue({
        success: false,
        code: "AUDIENCE_CHANGED",
        message,
      } satisfies ScheduleActionResult);
      const { onSent, onOpenChange, resume } = setupSchedule();
      await screen.findByText("1.240 personas");

      pick("2026-10-31T09:00");
      typeCount("1240", 1_240);
      fireEvent.click(scheduleButton());

      await screen.findByText("1.251 personas");
      expect(mocks.load).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("alert").textContent).toBe(message);
      expect(
        screen.getByText(
          "La audiencia se calcula al momento del envío: hoy serían 1.251 personas.",
        ),
      ).toBeTruthy();
      expect(picker().value).toBe("2026-10-31T09:00");
      expect(resume).toHaveBeenCalledTimes(1);
      expect(onSent).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("closes and reads the page again when the draft changed since it opened", async () => {
      mocks.load.mockResolvedValue(loaded());
      mocks.schedule.mockResolvedValue({
        success: false,
        code: "STALE",
        message: SCHEDULE_STALE_MESSAGE,
      } satisfies ScheduleActionResult);
      const { onOpenChange, onSent, resume } = setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      fireEvent.click(scheduleButton());

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      expect(mocks.error).toHaveBeenCalledWith(SCHEDULE_STALE_MESSAGE);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(resume).toHaveBeenCalledTimes(1);
      expect(onSent).not.toHaveBeenCalled();
    });

    it("keeps the server's refusal of the time under the picker until another time is picked, and lets the autosave go on", async () => {
      mocks.load.mockResolvedValue(loaded());
      const message = "Elegí una hora al menos 5 minutos más adelante.";
      mocks.schedule.mockResolvedValue({
        success: false,
        code: "INVALID_DATE",
        message,
      } satisfies ScheduleActionResult);
      const { onOpenChange, resume } = setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      fireEvent.click(scheduleButton());

      // The browser's clock let it through; the server's did not.
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(message);
      expect(picker().getAttribute("aria-describedby")).toContain(alert.id);
      expect(resume).toHaveBeenCalledTimes(1);
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      await waitFor(() => expect(scheduleButton().disabled).toBe(true));

      // A later time: nothing left to contradict it.
      pick("2026-10-31T09:00");
      expect(screen.queryByText(message)).toBeNull();
      expect(scheduleButton().disabled).toBe(false);
    });

    it("says a schedule that never answered failed, and lets the autosave go on", async () => {
      mocks.load.mockResolvedValue(loaded());
      mocks.schedule.mockRejectedValue(new TypeError("Failed to fetch"));
      const { resume } = setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      fireEvent.click(scheduleButton());

      expect((await screen.findByRole("alert")).textContent).toBe(
        "No pudimos programarlo. Intentá de nuevo en unos minutos.",
      );
      expect(resume).toHaveBeenCalledTimes(1);
    });

    it("picks the default time anew on each opening", async () => {
      mocks.load.mockResolvedValue(loaded());
      const { rerender } = setupSchedule();
      await screen.findByText(SCHEDULE_TITLE);
      pick("2026-10-31T09:00");

      rerender({ open: false });
      // 13:40 in La Paz.
      vi.setSystemTime(new Date("2026-10-26T17:40:00.000Z"));
      rerender({ open: true });
      expect(picker().value).toBe("2026-10-26T15:00");
      await screen.findByText(SCHEDULE_TITLE);
    });
  });
});
