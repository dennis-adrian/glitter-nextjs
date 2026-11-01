// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RetryFailedButton from "@/app/components/comunicados/admin/report/retry-failed-dialog";

const mocks = vi.hoisted(() => ({
  retry: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/retry-actions", () => ({
  retryFailedComunicadoAction: mocks.retry,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const COUNTS = { emails: 6, people: 2, maybeSentEmails: 3 };

function openDialog() {
  render(<RetryFailedButton comunicadoId={42} counts={COUNTS} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar fallidos (8)" }),
  );
  return screen.getByRole("alertdialog");
}

function retryButton() {
  return screen.getByRole("button", {
    name: "Reintentar",
  }) as HTMLButtonElement;
}

describe("RetryFailedButton", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("shows nothing when nothing can be retried", () => {
    const { container } = render(
      <RetryFailedButton
        comunicadoId={42}
        counts={{ emails: 0, people: 0, maybeSentEmails: 3 }}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("says what it retries and what it does not, from the report's counts", () => {
    const dialog = openDialog();

    expect(screen.getByText("¿Reintentar los fallidos?")).toBeTruthy();
    expect(dialog.textContent).toContain(
      "Reintentamos 6 correos y 2 personas que no llegaron a recibirlo, con el texto actual. No reintentamos los 3 correos que pueden haber llegado.",
    );
    expect(screen.getByRole("button", { name: "Volver" })).toBeTruthy();
    expect(retryButton().disabled).toBe(false);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("retries once, stays open until the answer, then closes and refreshes", async () => {
    let resolve!: (value: { success: true; message: string }) => void;
    mocks.retry.mockReturnValue(new Promise((r) => (resolve = r)));
    openDialog();

    fireEvent.click(retryButton());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reintentando…" }),
      ).toBeTruthy(),
    );
    const pending = screen.getByRole("button", {
      name: "Reintentando…",
    }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);
    fireEvent.click(pending);
    expect(
      (screen.getByRole("button", { name: "Volver" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(mocks.retry).toHaveBeenCalledWith(42);

    resolve({ success: true, message: "Los estamos reintentando." });
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith("Los estamos reintentando."),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("keeps a refusal in the open dialog, and refreshes once it is closed", async () => {
    mocks.retry.mockResolvedValue({
      success: false,
      message: "Ya se reintentó hace poco. Probá de nuevo en unos minutos.",
    });
    openDialog();

    fireEvent.click(retryButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Ya se reintentó hace poco. Probá de nuevo en unos minutos.",
      ),
    );
    await waitFor(() => expect(retryButton().disabled).toBe(false));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    // Opened again, it starts clean.
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar fallidos (8)" }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("answers a failed request in the dialog, and can be tried again", async () => {
    let resolve!: (value: { success: true; message: string }) => void;
    mocks.retry.mockRejectedValueOnce(new Error("network"));
    mocks.retry.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    openDialog();

    fireEvent.click(retryButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No pudimos reintentarlo. Probá de nuevo.",
      ),
    );
    await waitFor(() => expect(retryButton().disabled).toBe(false));
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    fireEvent.click(retryButton());
    // The old answer goes as soon as it is asked again.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reintentando…" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();

    resolve({ success: true, message: "Los estamos reintentando." });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.retry).toHaveBeenCalledTimes(2);
    expect(mocks.success).toHaveBeenCalledWith("Los estamos reintentando.");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("closes without asking anything when nothing was tried", async () => {
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
