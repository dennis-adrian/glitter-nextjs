import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import type { UserRequest } from "@/app/api/user_requests/definitions";
import ReviewRequestForm from "@/app/components/user_requests/review-request-form";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

function choose(option: "Aprobado" | "Rechazado") {
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Estado de la solicitud" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(screen.getByRole("option", { name: option }));
}

function reasonField() {
  return screen.queryByRole("textbox", { name: "Motivo (opcional)" });
}

function typeReason(value: string) {
  fireEvent.change(reasonField()!, { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
}

describe("ReviewRequestForm", () => {
  it("asks for an optional reason only once the admin picks a rejection", async () => {
    render(<ReviewRequestForm request={makeRequest()} />);
    expect(reasonField()).toBeNull();

    choose("Rechazado");
    expect(reasonField()).not.toBeNull();
    expect(
      screen.getByText("Lo va a ver el participante en el correo."),
    ).toBeTruthy();

    typeReason("  El cupo está completo.  ");
    save();

    await waitFor(() =>
      expect(reviewFestivalParticipationRequest).toHaveBeenCalledWith({
        requestId: 21,
        status: "rejected",
        reason: "El cupo está completo.",
      }),
    );
  });

  it("sends no reason when the field is left blank", async () => {
    render(<ReviewRequestForm request={makeRequest()} />);
    choose("Rechazado");
    typeReason("   ");
    save();

    await waitFor(() =>
      expect(reviewFestivalParticipationRequest).toHaveBeenCalled(),
    );
    const [input] = reviewFestivalParticipationRequest.mock.calls[0];
    expect(input).toEqual({ requestId: 21, status: "rejected" });
    expect(input).not.toHaveProperty("reason");
  });

  it("drops a typed reason when the admin switches to an approval", async () => {
    render(<ReviewRequestForm request={makeRequest()} />);
    choose("Rechazado");
    typeReason("Cupo completo");
    choose("Aprobado");
    expect(reasonField()).toBeNull();
    save();

    await waitFor(() =>
      expect(reviewFestivalParticipationRequest).toHaveBeenCalled(),
    );
    const [input] = reviewFestivalParticipationRequest.mock.calls[0];
    expect(input).toEqual({ requestId: 21, status: "accepted" });
    expect(input).not.toHaveProperty("reason");
  });

  it("offers no reason for a become_artist request", async () => {
    render(
      <ReviewRequestForm request={makeRequest({ type: "become_artist" })} />,
    );
    choose("Rechazado");
    expect(reasonField()).toBeNull();
    save();

    await waitFor(() =>
      expect(reviewBecomeArtistRequest).toHaveBeenCalledWith({
        requestId: 21,
        status: "rejected",
      }),
    );
    expect(reviewFestivalParticipationRequest).not.toHaveBeenCalled();
  });

  it("disables the reason on a request that was already rejected, and says why", () => {
    render(<ReviewRequestForm request={makeRequest({ status: "rejected" })} />);

    const field = reasonField() as HTMLTextAreaElement;
    expect(field.disabled).toBe(true);
    expect(
      screen.getByText(
        "Esta solicitud ya fue revisada. El motivo solo se envía al rechazar una solicitud pendiente.",
      ),
    ).toBeTruthy();
  });

  it("prompts in voseo", () => {
    render(<ReviewRequestForm request={makeRequest()} />);

    expect(screen.getByText("Elegí una opción")).toBeTruthy();
  });
});
