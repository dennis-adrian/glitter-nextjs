// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchReservationsOpenAudience, resendReservationsOpenNotice, refresh } =
  vi.hoisted(() => ({
    fetchReservationsOpenAudience: vi.fn(),
    resendReservationsOpenNotice: vi.fn(),
    refresh: vi.fn(),
  }));

vi.mock("@/app/lib/festivals/reservations-open-actions", () => ({
  fetchReservationsOpenAudience,
  resendReservationsOpenNotice,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import FestivalReservationsOpenCard from "@/app/components/festivals/festival-reservations-open-card";
import type { ReservationsOpenNoticeSummary } from "@/app/lib/festivals/reservations-open-notices";

const notice: ReservationsOpenNoticeSummary = {
  campaignId: 9,
  trigger: "automatic",
  createdAt: new Date("2026-11-20T14:02:00Z"),
  sentByName: null,
  recipients: 120,
  emails: 118,
  emailsSent: 100,
  pushes: 40,
  pushesSent: 38,
};

function renderCard(
  props: Partial<Parameters<typeof FestivalReservationsOpenCard>[0]> = {},
) {
  return render(
    <FestivalReservationsOpenCard
      festivalId={3}
      active
      archived={false}
      reservationsStartDate={new Date("2026-11-20T14:00:00Z")}
      reservationsOpen
      notices={[]}
      {...props}
    />,
  );
}

describe("FestivalReservationsOpenCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("says it goes out on its own before reservations open, and cannot be sent yet", () => {
    renderCard({ reservationsOpen: false });
    expect(
      screen.getByText(/Se enviará automáticamente cuando abran las reservas/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Enviar ahora/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("waits for the festival to be active", () => {
    renderCard({ active: false });
    expect(screen.getByText(/cuando el festival esté activo/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Enviar ahora/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("lists what was sent and offers a resend", () => {
    renderCard({ notices: [notice] });
    expect(screen.getByText(/Envío automático/)).toBeTruthy();
    expect(screen.getByText(/120 participantes/)).toBeTruthy();
    expect(screen.getByText(/100\/118 correos/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Volver a enviar/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("confirms with the audience, then resends once with the dialog's id", async () => {
    fetchReservationsOpenAudience.mockResolvedValue({
      success: true,
      audience: { recipients: 80, withPush: 25 },
    });
    resendReservationsOpenNotice.mockResolvedValue({
      success: true,
      alreadySent: false,
      recipients: 80,
      emails: 79,
      pushes: 30,
    });
    renderCard({ notices: [notice] });

    fireEvent.click(screen.getByRole("button", { name: /Volver a enviar/ }));
    expect(
      await screen.findByText(/80 participantes verificados/),
    ).toBeTruthy();
    expect(screen.getByText(/lo recibirán de nuevo/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enviar aviso" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(resendReservationsOpenNotice).toHaveBeenCalledOnce();
    const [input] = resendReservationsOpenNotice.mock.calls[0]!;
    expect(input.festivalId).toBe(3);
    expect(input.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
