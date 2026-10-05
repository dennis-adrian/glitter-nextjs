// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The form reaches a "use server" module that imports `server-only`, which
// throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/tickets/resend-actions", () => ({
  resendTicketEmail: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SendEmailForm from "@/app/components/tickets/send-pending-email-form";
import { resendTicketEmail } from "@/app/lib/tickets/resend-actions";
import { toast } from "sonner";

const action = vi.mocked(resendTicketEmail);

function clickResend() {
  fireEvent.click(
    screen.getByRole("button", { name: "Reenviar entrada por correo" }),
  );
}

describe("SendEmailForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("resends the card's ticket and reports where it went", async () => {
    action.mockResolvedValue({
      success: true,
      message: "Enviamos la entrada a v@example.com.",
    });
    render(<SendEmailForm ticketId={42} />);
    clickResend();

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
    render(<SendEmailForm ticketId={42} />);
    clickResend();

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
    render(<SendEmailForm ticketId={42} />);
    clickResend();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos reenviar la entrada. Intentá de nuevo en unos minutos.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  /**
   * The page is public: a visitor sees the control exists but is restricted,
   * rather than a button that silently does nothing.
   */
  it("stays visible but inert with a stated reason", async () => {
    render(
      <SendEmailForm
        ticketId={42}
        disabledReason="Solo un administrador puede reenviar entradas."
      />,
    );

    const button = screen.getByRole("button", {
      name: "Reenviar entrada por correo",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("Solo un administrador puede reenviar entradas."),
    ).toBeTruthy();

    fireEvent.click(button);
    // The submit handler is async; give it the chance to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(action).not.toHaveBeenCalled();
  });
});
