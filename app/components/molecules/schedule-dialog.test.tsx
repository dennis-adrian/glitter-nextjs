// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Settings } from "luxon";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import ScheduleDialog, {
  type ScheduleDialogProps,
  type ScheduleDialogResult,
} from "@/app/components/molecules/schedule-dialog";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: vi.fn() },
}));

/** Monday 26 October, 10:12 in La Paz. */
const NOW = new Date("2026-10-26T14:12:00.000Z");
const DONE: ScheduleDialogResult = {
  success: true,
  message: "Ahora sale el sáb, 31 oct, 9:00 AM.",
};
const ORIGINAL_ZONE = Settings.defaultZone;

function setup(props: Partial<ScheduleDialogProps> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onConfirm: vi.fn<(at: Date) => Promise<ScheduleDialogResult>>(
      async () => DONE,
    ),
  };
  const all: ScheduleDialogProps = {
    open: true,
    title: "Cambiar fecha",
    description: "Se envía dentro del minuto siguiente a la hora elegida.",
    ...handlers,
    ...props,
  };
  const view = render(<ScheduleDialog {...all} />);
  return {
    ...view,
    ...handlers,
    rerender: (next: Partial<ScheduleDialogProps>) =>
      view.rerender(<ScheduleDialog {...all} {...next} />),
  };
}

function picker() {
  return screen.getByLabelText("Fecha y hora") as HTMLInputElement;
}

function pick(value: string) {
  fireEvent.change(picker(), { target: { value } });
}

function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("ScheduleDialog", () => {
  /** What the dialog logs of a confirmation that failed; nothing else may log. */
  const LOGGED = ["Error confirming a schedule"];
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
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
    vi.useRealTimers();
    vi.unstubAllEnvs();
    Settings.defaultZone = ORIGINAL_ZONE;
    vi.clearAllMocks();
    vi.restoreAllMocks();
    expect(unexpected).toEqual([]);
  });

  it("says what the time is for, with its hint under the picker", () => {
    setup({
      title: "Programar publicación",
      description:
        "El artículo se publicará solo en la fecha y hora que elijas.",
      hint: "La revisión del cron corre cada 15 minutos.",
    });
    expect(screen.getByText("Programar publicación")).toBeTruthy();
    expect(
      screen.getByText(
        "El artículo se publicará solo en la fecha y hora que elijas.",
      ),
    ).toBeTruthy();
    expect(picker().getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(picker().getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("La revisión del cron corre cada 15 minutos.");
    expect(button("Cancelar").disabled).toBe(false);
    expect(button("Programar").disabled).toBe(false);
  });

  it("seeds the next full hour plus one anew on each opening", () => {
    const { rerender } = setup();
    expect(picker().value).toBe("2026-10-26T12:00");
    pick("2026-10-31T09:00");

    rerender({ open: false });
    // 13:40 in La Paz: the default moves on, and the edit is gone.
    vi.setSystemTime(new Date("2026-10-26T17:40:00.000Z"));
    rerender({ open: true });
    expect(picker().value).toBe("2026-10-26T15:00");
  });

  it("seeds the time already set, on La Paz's clock, and keeps an edit while open", () => {
    const { rerender } = setup({
      currentScheduledAt: new Date("2026-11-02T15:30:00.000Z"),
    });
    expect(picker().value).toBe("2026-11-02T11:30");
    pick("2026-11-03T09:00");

    // The page refreshed under the open dialog: what was typed stays.
    rerender({ currentScheduledAt: new Date("2026-11-02T15:30:00.000Z") });
    expect(picker().value).toBe("2026-11-03T09:00");

    rerender({ open: false });
    rerender({ open: true });
    expect(picker().value).toBe("2026-11-02T11:30");
  });

  it("confirms the instant picked, read as La Paz's time whatever the browser's zone", async () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    Settings.defaultZone = "Asia/Tokyo";
    const { onConfirm } = setup();
    pick("2026-10-31T09:00");
    fireEvent.click(button("Programar"));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0]![0].toISOString()).toBe(
      "2026-10-31T13:00:00.000Z",
    );
  });

  it("says what it did, closes and reads the page again when it went through", async () => {
    const { onOpenChange } = setup();
    fireEvent.click(button("Programar"));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.success).toHaveBeenCalledWith(DONE.message);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an unfinished time as not one, and confirms nothing", () => {
    const { onConfirm } = setup();
    // What an unfinished datetime-local field reads.
    pick("");
    expect(screen.getByRole("alert").textContent).toBe(
      "Elegí una fecha y hora válidas.",
    );
    expect(picker().getAttribute("aria-invalid")).toBe("true");
    expect(button("Programar").disabled).toBe(true);
    fireEvent.click(button("Programar"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps the button off while validate objects to the time", () => {
    const validate = vi.fn((at: Date) =>
      at.getTime() < Date.parse("2026-10-27T00:00:00.000Z")
        ? "Elegí una hora al menos 5 minutos más adelante."
        : null,
    );
    const { onConfirm } = setup({ validate });
    pick("2026-10-26T15:00");
    expect(validate).toHaveBeenLastCalledWith(
      new Date("2026-10-26T19:00:00.000Z"),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Elegí una hora al menos 5 minutos más adelante.",
    );
    expect(button("Programar").disabled).toBe(true);
    fireEvent.click(button("Programar"));
    expect(onConfirm).not.toHaveBeenCalled();

    pick("2026-10-31T09:00");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(button("Programar").disabled).toBe(false);
  });

  it("checks the time on confirming too: a seeded one, or one the clock caught up with", () => {
    // A schedule already overdue, moved: its own time no longer does.
    const validate = (at: Date) =>
      at.getTime() < Date.now() + 5 * 60_000 ? "Muy pronto." : null;
    const { onConfirm } = setup({
      validate,
      currentScheduledAt: new Date("2026-10-26T13:00:00.000Z"),
    });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(button("Programar"));
    expect(screen.getByRole("alert").textContent).toBe("Muy pronto.");
    expect(onConfirm).not.toHaveBeenCalled();

    pick("2026-10-26T10:20");
    expect(button("Programar").disabled).toBe(false);
    // 10:17: 10:20 is 3 minutes away now.
    vi.setSystemTime(new Date("2026-10-26T14:17:00.000Z"));
    fireEvent.click(button("Programar"));
    expect(screen.getByRole("alert").textContent).toBe("Muy pronto.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays open with the refusal, until the time is picked again", async () => {
    const message = "Ya se empezó a enviar.";
    const onConfirm = vi.fn(
      async (): Promise<ScheduleDialogResult> => ({ success: false, message }),
    );
    const { onOpenChange } = setup({ onConfirm });
    fireEvent.click(button("Programar"));

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    await waitFor(() => expect(button("Programar").disabled).toBe(false));

    pick("2026-10-31T09:00");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says a confirmation that never answered failed", async () => {
    const onConfirm = vi.fn(async (): Promise<ScheduleDialogResult> => {
      throw new TypeError("Failed to fetch");
    });
    const { onOpenChange } = setup({ onConfirm });
    fireEvent.click(button("Programar"));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No pudimos programarlo. Intentá de nuevo en unos minutos.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("names its button as told, and stays busy until the answer", async () => {
    let answer: (result: ScheduleDialogResult) => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<ScheduleDialogResult>((resolve) => {
          answer = resolve;
        }),
    );
    const { onOpenChange } = setup({
      onConfirm,
      confirmLabel: "Guardar fecha",
      pendingLabel: "Guardando…",
    });
    fireEvent.click(button("Guardar fecha"));

    await screen.findByRole("button", { name: "Guardando…" });
    expect(button("Guardando…").disabled).toBe(true);
    expect(button("Cancelar").disabled).toBe(true);
    expect(picker().disabled).toBe(true);
    // Escape cannot close it under the answer.
    fireEvent.keyDown(picker(), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => answer(DONE));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
