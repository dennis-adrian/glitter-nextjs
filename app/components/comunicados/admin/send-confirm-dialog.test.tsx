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
  SendComunicadoNowResult,
} from "@/app/lib/comunicados/contracts";
import { COMUNICADO_SKIP_REASONS } from "@/app/lib/comunicados/skip-reasons";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  send: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/send-actions", () => ({
  loadComunicadoSendConfirmationAction: mocks.load,
  sendComunicadoNowAction: mocks.send,
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
        preview: preview({
          eligible: 1_240,
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
        preview: preview({ eligible: 1_240, narrowed: true, stagingAdmins: 4 }),
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
});
