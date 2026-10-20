// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The menu reaches a "use server" module that imports `server-only`, which
// throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/tickets/resend-actions", () => ({
  resendTicketEmail: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import TicketRowActions from "@/app/components/tickets/cells/row-actions";
import { resendTicketEmail } from "@/app/lib/tickets/resend-actions";
import { toast } from "sonner";

const action = vi.mocked(resendTicketEmail);

function resendItem() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Acciones" }), {
    key: "Enter",
  });
  return screen.getByRole("menuitem", {
    name: /Reenviar entrada por correo/,
  });
}

describe("TicketRowActions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("resends the row's ticket and reports where it went", async () => {
    action.mockResolvedValue({
      success: true,
      message: "Enviamos la entrada a v@example.com.",
    });
    render(<TicketRowActions ticketId={42} />);
    fireEvent.click(resendItem());

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Entrada reenviada", {
        description: "Enviamos la entrada a v@example.com.",
      }),
    );
    expect(action).toHaveBeenCalledWith(42);
  });

  it("reports the server's own refusal rather than a success", async () => {
    action.mockResolvedValue({
      success: false,
      message: "Ya reenviamos esta entrada hace poco.",
    });
    render(<TicketRowActions ticketId={42} />);
    fireEvent.click(resendItem());

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Ya reenviamos esta entrada hace poco.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a call that never reached an answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    action.mockRejectedValue(new Error("network"));
    render(<TicketRowActions ticketId={42} />);
    fireEvent.click(resendItem());

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos reenviar la entrada. Intentá de nuevo en unos minutos.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  /** A vanished action reads as a broken feature; this one says why. */
  it("stays listed but inert with a stated reason", async () => {
    render(
      <TicketRowActions
        ticketId={42}
        resendDisabledReason="Solo se pueden reenviar entradas del festival activo."
      />,
    );

    const item = resendItem();
    expect(item.hasAttribute("data-disabled")).toBe(true);
    expect(
      screen.getByText("Solo se pueden reenviar entradas del festival activo."),
    ).toBeTruthy();

    fireEvent.click(item);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(action).not.toHaveBeenCalled();
  });
});
