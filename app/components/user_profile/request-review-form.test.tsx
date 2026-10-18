// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The form reaches a "use server" module that imports `server-only`, which
// throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/actions", () => ({
  requestProfileReview: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RequestReviewForm from "@/app/components/user_profile/request-review-form";
import { requestProfileReview } from "@/app/lib/users/actions";
import { toast } from "sonner";

const action = vi.mocked(requestProfileReview);

function clickRequest() {
  fireEvent.click(
    screen.getByRole("button", { name: "Pedir una nueva revisión" }),
  );
}

describe("RequestReviewForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("asks for a new review of this profile and confirms it", async () => {
    action.mockResolvedValue({
      success: true,
      message: "Tu perfil volvió a quedar en revisión.",
    });
    render(<RequestReviewForm profileId={7} />);
    clickRequest();

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Solicitud enviada", {
        description: "Tu perfil volvió a quedar en revisión.",
      }),
    );
    expect(action).toHaveBeenCalledWith(7);
  });

  it("reports the server's own refusal rather than a success", async () => {
    action.mockResolvedValue({
      success: false,
      message: "Tu perfil ya está en revisión.",
    });
    render(<RequestReviewForm profileId={7} />);
    clickRequest();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Tu perfil ya está en revisión.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a call that never reached an answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    action.mockRejectedValue(new Error("network"));
    render(<RequestReviewForm profileId={7} />);
    clickRequest();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos pedir la nueva revisión. Intentá de nuevo en unos minutos.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("stays visible but inert with a stated reason", async () => {
    render(
      <RequestReviewForm
        profileId={7}
        disabledReason="Completá tu perfil para pedir una nueva revisión."
      />,
    );

    const button = screen.getByRole("button", {
      name: "Pedir una nueva revisión",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("Completá tu perfil para pedir una nueva revisión."),
    ).toBeTruthy();

    fireEvent.click(button);
    // The submit handler is async; give it the chance to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(action).not.toHaveBeenCalled();
  });
});
