// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DuplicateComunicadoButton from "@/app/components/comunicados/admin/duplicate-button";

const mocks = vi.hoisted(() => ({
  duplicate: vi.fn(),
  push: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/duplicate-actions", () => ({
  duplicateComunicadoAction: mocks.duplicate,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

function button() {
  return screen.getByRole("button", {
    name: /^Duplica/,
  }) as HTMLButtonElement;
}

describe("DuplicateComunicadoButton", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("makes one copy and opens it with its source, staying busy until it does", async () => {
    let resolve!: (value: { success: true; comunicadoId: number }) => void;
    mocks.duplicate.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<DuplicateComunicadoButton comunicadoId={7} />);
    expect(button().textContent).toBe("Duplicar");

    fireEvent.click(button());
    await waitFor(() => expect(button().textContent).toBe("Duplicando…"));
    expect(button().disabled).toBe(true);
    fireEvent.click(button());
    expect(mocks.duplicate).toHaveBeenCalledTimes(1);
    expect(mocks.duplicate).toHaveBeenCalledWith(7);

    resolve({ success: true, comunicadoId: 42 });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/communications/42?copia=7",
      ),
    );
    // The composer replaces the page; until then it does not offer a second.
    expect(button().disabled).toBe(true);
    expect(button().textContent).toBe("Duplicando…");
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("says why it could not, and can be tried again", async () => {
    mocks.duplicate.mockResolvedValue({
      success: false,
      message: "No encontramos este comunicado.",
    });
    render(<DuplicateComunicadoButton comunicadoId={7} />);

    fireEvent.click(button());
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "No encontramos este comunicado.",
      ),
    );
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(button().textContent).toBe("Duplicar");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("answers a failed request with a toast", async () => {
    mocks.duplicate.mockRejectedValue(new Error("network"));
    render(<DuplicateComunicadoButton comunicadoId={7} />);

    fireEvent.click(button());
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "No pudimos duplicarlo. Probá de nuevo.",
      ),
    );
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("takes the look its page asks for", () => {
    render(
      <DuplicateComunicadoButton
        comunicadoId={7}
        variant="ghost"
        size="sm"
        className="w-full"
      />,
    );

    expect(button().className).toContain("h-8");
    expect(button().className).toContain("w-full");
    expect(button().className).not.toContain("border-primary");
  });
});
