import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ReviewAction = (
  input: unknown,
) => Promise<{ success: boolean; message: string }>;

const { reviewBecomeArtistRequest, reviewFestivalParticipationRequest } =
  vi.hoisted(() => ({
    reviewBecomeArtistRequest: vi.fn<ReviewAction>(async () => ({
      success: true,
      message: "",
    })),
    reviewFestivalParticipationRequest: vi.fn<ReviewAction>(async () => ({
      success: true,
      message: "",
    })),
  }));
vi.mock("@/app/api/user_requests/actions", () => ({
  reviewBecomeArtistRequest,
  reviewFestivalParticipationRequest,
}));
const { toast } = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));
vi.mock("sonner", () => ({ toast }));

import type { UserRequest } from "@/app/api/user_requests/definitions";
import { ActionsCell } from "@/app/components/user_requests/cells/actions";

beforeEach(() => {
  // jsdom ships none of these; Radix's dropdown measures and positions the
  // portalled content.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function makeRequest(overrides: Partial<UserRequest> = {}): UserRequest {
  return {
    id: 21,
    userId: 8,
    festivalId: 10,
    type: "festival_participation",
    status: "pending",
    user: { id: 8, displayName: "Ana", email: "ana@example.com" },
    festival: { id: 10, name: "Glitter 10" },
    ...overrides,
  } as UserRequest;
}

function openMenu(request = makeRequest()) {
  render(<ActionsCell request={request} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Open menu" }), {
    key: "Enter",
  });
}

function item(name: "Aprobar" | "Rechazar") {
  return screen.getByRole("menuitem", { name: new RegExp(`^${name}`) });
}

function openRejectDialog(request = makeRequest()) {
  openMenu(request);
  fireEvent.click(item("Rechazar"));
  return screen.getByRole("dialog", { name: "Rechazar solicitud" });
}

function confirm(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Rechazar solicitud" }),
  );
}

describe("ActionsCell", () => {
  it("asks before rejecting, with an optional reason", () => {
    const dialog = openRejectDialog();

    expect(reviewFestivalParticipationRequest).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("textbox", { name: "Motivo (opcional)" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Lo va a ver el participante en el correo."),
    ).toBeTruthy();
    expect(dialog.textContent).toContain("Ana");
    expect(dialog.textContent).toContain("Glitter 10");
  });

  it("sends the trimmed reason and closes once the rejection goes through", async () => {
    const dialog = openRejectDialog();
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Motivo (opcional)" }),
      { target: { value: "  Cupo completo  " } },
    );
    confirm(dialog);

    await waitFor(() =>
      expect(reviewFestivalParticipationRequest).toHaveBeenCalledWith({
        requestId: 21,
        status: "rejected",
        reason: "Cupo completo",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.warning).toHaveBeenCalled();
  });

  it("sends no reason when the field is left empty", async () => {
    confirm(openRejectDialog());

    await waitFor(() =>
      expect(reviewFestivalParticipationRequest).toHaveBeenCalled(),
    );
    const [input] = reviewFestivalParticipationRequest.mock.calls[0];
    expect(input).toEqual({ requestId: 21, status: "rejected" });
    expect(input).not.toHaveProperty("reason");
  });

  it("stays open with the typed reason when the rejection fails", async () => {
    reviewFestivalParticipationRequest.mockResolvedValueOnce({
      success: false,
      message: "La solicitud ya no admite este cambio.",
    });
    const dialog = openRejectDialog();
    const field = within(dialog).getByRole("textbox", {
      name: "Motivo (opcional)",
    }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Cupo completo" } });
    confirm(dialog);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "La solicitud ya no admite este cambio.",
        expect.anything(),
      ),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(field.value).toBe("Cupo completo");
  });

  it("stays open with the typed reason when the action throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    reviewFestivalParticipationRequest.mockRejectedValueOnce(
      new Error("Failed to fetch"),
    );
    const dialog = openRejectDialog();
    const field = within(dialog).getByRole("textbox", {
      name: "Motivo (opcional)",
    }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Cupo completo" } });
    confirm(dialog);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos guardar la revisión. Intentá de nuevo en unos minutos.",
      ),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Error reviewing the request",
      expect.any(Error),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(field.value).toBe("Cupo completo");
    errorSpy.mockRestore();
  });

  it("approves straight from the menu", async () => {
    openMenu();
    fireEvent.click(item("Aprobar"));

    await waitFor(() =>
      expect(reviewFestivalParticipationRequest).toHaveBeenCalled(),
    );
    const [input] = reviewFestivalParticipationRequest.mock.calls[0];
    expect(input).toEqual({ requestId: 21, status: "accepted" });
    expect(input).not.toHaveProperty("reason");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps both entries visible but disabled on a reviewed request, and says why", () => {
    openMenu(makeRequest({ status: "accepted" }));

    for (const name of ["Aprobar", "Rechazar"] as const) {
      expect(item(name).getAttribute("aria-disabled")).toBe("true");
    }
    expect(screen.getAllByText("La solicitud ya fue revisada.")).toHaveLength(
      2,
    );
  });

  it("confirms a become_artist rejection without a reason field", async () => {
    const dialog = openRejectDialog(makeRequest({ type: "become_artist" }));

    expect(
      within(dialog).queryByRole("textbox", { name: "Motivo (opcional)" }),
    ).toBeNull();
    confirm(dialog);

    await waitFor(() =>
      expect(reviewBecomeArtistRequest).toHaveBeenCalledWith({
        requestId: 21,
        status: "rejected",
      }),
    );
    expect(reviewFestivalParticipationRequest).not.toHaveBeenCalled();
  });
});
