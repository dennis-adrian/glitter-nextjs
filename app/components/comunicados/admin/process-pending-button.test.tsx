// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProcessPendingButton from "@/app/components/comunicados/admin/process-pending-button";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/process-actions", () => ({
  processPendingComunicadosAction: mocks.process,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

function button(name = "Procesar envíos pendientes") {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("ProcessPendingButton", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("asks once, staying disabled until the server answers, then refreshes", async () => {
    let resolve!: (value: { success: true; message: string }) => void;
    mocks.process.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ProcessPendingButton />);

    fireEvent.click(button());
    await waitFor(() => expect(button("Procesando…").disabled).toBe(true));
    fireEvent.click(button("Procesando…"));
    expect(mocks.process).toHaveBeenCalledTimes(1);

    resolve({
      success: true,
      message: "Procesando los envíos pendientes. En un minuto deberían verse.",
    });
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        "Procesando los envíos pendientes. En un minuto deberían verse.",
      ),
    );
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal", async () => {
    mocks.process.mockResolvedValue({
      success: false,
      message:
        "Ya se están procesando. Esperá unos segundos y volvé a intentarlo.",
    });
    render(<ProcessPendingButton size="sm" />);

    fireEvent.click(button());
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Ya se están procesando. Esperá unos segundos y volvé a intentarlo.",
      ),
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("answers a failed request with a toast, and can be tried again", async () => {
    mocks.process.mockRejectedValue(new Error("network"));
    render(<ProcessPendingButton />);

    fireEvent.click(button());
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "No pudimos procesar los envíos. Intentá de nuevo en unos minutos.",
      ),
    );
    await waitFor(() => expect(button().disabled).toBe(false));
  });
});
