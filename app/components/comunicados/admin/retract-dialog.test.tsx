// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RetractComunicadoMenu from "@/app/components/comunicados/admin/retract-dialog";

const mocks = vi.hoisted(() => ({
  retract: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/retract-actions", () => ({
  retractComunicadoAction: mocks.retract,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const COUNTS = {
  people: 1240,
  queuedEmails: 8,
  maybeSentEmails: 3,
  sentEmails: 1180,
};

function openDialog() {
  render(
    <RetractComunicadoMenu
      comunicadoId={42}
      title="Cambio de horario de armado"
      counts={COUNTS}
    />,
  );
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Acciones del comunicado" }),
    { key: "Enter" },
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Retirar…" }));
  return screen.getByRole("alertdialog");
}

function retractButton() {
  return screen.getByRole("button", {
    name: "Retirar comunicado",
  }) as HTMLButtonElement;
}

function typeReason(value: string) {
  fireEvent.change(screen.getByLabelText("Motivo (solo para el equipo)"), {
    target: { value },
  });
}

describe("RetractComunicadoMenu", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("says what leaves and what cannot be taken back, from the report's counts", () => {
    const dialog = openDialog();

    expect(
      screen.getByText("¿Retirar «Cambio de horario de armado»?"),
    ).toBeTruthy();
    expect(dialog.textContent).toContain(
      "Desaparece de las notificaciones de las 1.240 personas, también de quienes ya lo leyeron.",
    );
    expect(dialog.textContent).toContain(
      "Los 8 correos que todavía no salieron no se envían; 3 pueden haber llegado ya.",
    );
    expect(screen.getByText("Obligatorio, hasta 300 caracteres.")).toBeTruthy();
    expect(screen.getByText("0/300")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Volver" })).toBeTruthy();
  });

  it("asks for a reason first: blank or only spaces is not one", () => {
    openDialog();
    expect(retractButton().disabled).toBe(true);
    fireEvent.click(retractButton());

    typeReason("   ");
    expect(retractButton().disabled).toBe(true);
    fireEvent.click(retractButton());
    expect(mocks.retract).not.toHaveBeenCalled();

    typeReason("Salió con el horario equivocado");
    expect(retractButton().disabled).toBe(false);
    expect(screen.getByText("31/300")).toBeTruthy();
  });

  it("sends the trimmed reason once, stays open until the answer, then closes and refreshes", async () => {
    let resolve!: (value: { success: true; message: string }) => void;
    mocks.retract.mockReturnValue(new Promise((r) => (resolve = r)));
    openDialog();

    typeReason("  Salió con el horario equivocado \n");
    fireEvent.click(retractButton());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retirando…" })).toBeTruthy(),
    );
    expect(
      (screen.getByRole("button", { name: "Retirando…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.retract).toHaveBeenCalledTimes(1);
    expect(mocks.retract).toHaveBeenCalledWith({
      comunicadoId: 42,
      reason: "Salió con el horario equivocado",
    });

    resolve({ success: true, message: "Lo retiramos de las notificaciones." });
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        "Lo retiramos de las notificaciones.",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("shows a refusal and keeps the reason for another try", async () => {
    mocks.retract.mockResolvedValue({
      success: false,
      message:
        "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
    });
    openDialog();
    typeReason("Salió con el horario equivocado");
    fireEvent.click(retractButton());

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Acciones del comunicado" }),
      { key: "Enter" },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Retirar…" }));
    expect(
      (
        screen.getByLabelText(
          "Motivo (solo para el equipo)",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Salió con el horario equivocado");
    expect(retractButton().disabled).toBe(false);
  });

  it("answers a failed request with a toast and stays open", async () => {
    mocks.retract.mockRejectedValue(new Error("network"));
    openDialog();
    typeReason("Salió con el horario equivocado");
    fireEvent.click(retractButton());

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "No pudimos retirarlo. Probá de nuevo.",
      ),
    );
    await waitFor(() => expect(retractButton().disabled).toBe(false));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
