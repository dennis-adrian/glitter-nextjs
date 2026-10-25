// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NewComunicadoButton from "@/app/components/comunicados/admin/new-comunicado-button";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  push: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/actions", () => ({
  createComunicadoDraftAction: mocks.create,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

function button() {
  return screen.getByRole("button", {
    name: "Nuevo comunicado",
  }) as HTMLButtonElement;
}

describe("NewComunicadoButton", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("creates one draft and opens it, staying disabled until it does", async () => {
    let resolve!: (value: { success: true; comunicadoId: number }) => void;
    mocks.create.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<NewComunicadoButton />);

    fireEvent.click(button());
    await waitFor(() => expect(button().disabled).toBe(true));
    fireEvent.click(button());
    expect(mocks.create).toHaveBeenCalledTimes(1);

    resolve({ success: true, comunicadoId: 42 });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/communications/42"),
    );
    // The composer replaces the page; until then it does not offer a second.
    expect(button().disabled).toBe(true);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("says why it could not, and can be tried again", async () => {
    mocks.create.mockResolvedValue({
      success: false,
      message: "No se pudo crear el borrador.",
    });
    render(<NewComunicadoButton />);

    fireEvent.click(button());
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("No se pudo crear el borrador."),
    );
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("answers a failed request with a toast", async () => {
    mocks.create.mockRejectedValue(new Error("network"));
    render(<NewComunicadoButton />);

    fireEvent.click(button());
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "No se pudo crear el borrador. Intentá de nuevo.",
      ),
    );
    await waitFor(() => expect(button().disabled).toBe(false));
  });
});
