import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { announceMock } = vi.hoisted(() => ({ announceMock: vi.fn() }));
vi.mock("@/app/components/impersonation/view-state", () => ({
  announceViewChange: announceMock,
}));

import EnterAsButton from "@/app/components/impersonation/enter-as-button";

const ANA = {
  id: 2,
  name: "Ana Pérez",
  email: "ana@example.com",
  statusLabel: "Verificado",
};
const fetchMock = vi.fn();
const assignMock = vi.fn();

function respond(body: unknown) {
  return Promise.resolve({ json: async () => body } as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignMock },
  });
  fetchMock.mockReset();
  assignMock.mockReset();
  announceMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function open() {
  render(<EnterAsButton person={ANA} returnTo="/dashboard/users/2" />);
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  return screen.getByRole("alertdialog");
}

describe("EnterAsButton", () => {
  it("asks first, saying who, that it is read-only, and for how long", () => {
    const dialog = open();
    expect(dialog.textContent).toContain("Entrar como Ana Pérez");
    expect(dialog.textContent).toContain("ana@example.com · Verificado");
    expect(dialog.textContent).toContain(
      "Solo lectura: no se guarda nada, no se envían correos ni avisos.",
    );
    expect(dialog.textContent).toContain("a los 60 minutos");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts the view and loads the participant's app as a new document", async () => {
    fetchMock.mockReturnValue(
      respond({ success: true, redirectTo: "/portal" }),
    );
    const dialog = open();
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.textContent === "Entrar",
      )!,
    );
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/portal"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/impersonation/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ subjectId: 2, returnTo: "/dashboard/users/2" }),
      }),
    );
    // The browser's other tabs are told before this one leaves.
    expect(announceMock).toHaveBeenCalled();
  });

  it("shows the server's refusal and stays", async () => {
    fetchMock.mockReturnValue(
      respond({ success: false, message: "Esta cuenta se está eliminando." }),
    );
    const dialog = open();
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.textContent === "Entrar",
      )!,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Esta cuenta se está eliminando.",
      ),
    );
    expect(assignMock).not.toHaveBeenCalled();
    expect(announceMock).not.toHaveBeenCalled();
  });

  it("says so when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const dialog = open();
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.textContent === "Entrar",
      )!,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No se pudo entrar. Intentá de nuevo.",
      ),
    );
  });

  it("does nothing on Cancelar", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
