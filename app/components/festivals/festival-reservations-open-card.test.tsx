// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  fetchReservationsOpenAudience,
  resendReservationsOpenNotice,
  updateReservationsOpenNoticeSettings,
  refresh,
  toast,
} = vi.hoisted(() => ({
  fetchReservationsOpenAudience: vi.fn(),
  resendReservationsOpenNotice: vi.fn(),
  updateReservationsOpenNoticeSettings: vi.fn(),
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/app/lib/festivals/reservations-open-actions", () => ({
  fetchReservationsOpenAudience,
  resendReservationsOpenNotice,
  updateReservationsOpenNoticeSettings,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));

import FestivalReservationsOpenCard from "@/app/components/festivals/festival-reservations-open-card";
import type { ReservationsOpenNoticeSummary } from "@/app/lib/festivals/reservations-open-notices";

const OPENING = new Date("2026-11-20T14:00:00Z");
const ALL = { email: true, inApp: true, push: true };

const notice: ReservationsOpenNoticeSummary = {
  campaignId: 9,
  trigger: "automatic",
  createdAt: new Date("2026-11-20T14:02:00Z"),
  reservationsStartDate: OPENING,
  sentByName: null,
  channels: ALL,
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
      reservationsStartDate={OPENING}
      reservationsOpen
      withinAutomaticWindow={false}
      settings={{ auto: true, channels: ALL }}
      notices={[]}
      {...props}
    />,
  );
}

function button(name: RegExp | string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function checkbox(name: RegExp) {
  return screen.getByRole("checkbox", { name });
}

describe("FestivalReservationsOpenCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("says when it will go out on its own, and through which channels", () => {
    renderCard({ reservationsOpen: false });
    expect(
      screen.getByText(
        /Se enviará automáticamente por correo, Glitter y push cuando abran las reservas/,
      ),
    ).toBeTruthy();
    expect(button(/Enviar ahora/).disabled).toBe(true);
  });

  it("says it is off when the switch is off", () => {
    renderCard({ settings: { auto: false, channels: ALL } });
    expect(
      screen.getByText(/El aviso automático está desactivado/),
    ).toBeTruthy();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("says it is about to go out right after the opening", () => {
    renderCard({ withinAutomaticWindow: true });
    expect(screen.getByText(/en los próximos minutos/)).toBeTruthy();
  });

  it("says plainly when an opening was missed, and offers to send it", () => {
    renderCard();
    expect(screen.getByText(/el aviso automático no se envió/)).toBeTruthy();
    expect(button(/Enviar ahora/).disabled).toBe(false);
  });

  it("lists what was sent, and through which channels", () => {
    renderCard({
      notices: [
        {
          ...notice,
          campaignId: 10,
          trigger: "manual",
          sentByName: "Ana Admin",
          channels: { email: true, inApp: false, push: false },
          pushes: 0,
          pushesSent: 0,
        },
        notice,
      ],
    });
    expect(screen.getByText(/ya se envió/)).toBeTruthy();
    expect(screen.getByText(/Enviado a mano por Ana Admin/)).toBeTruthy();
    expect(screen.getByText(/Envío automático/)).toBeTruthy();
    expect(
      screen.getByText("120 participantes por correo · 100/118 correos"),
    ).toBeTruthy();
    expect(
      screen.getByText(/por correo, Glitter y push · 100\/118 correos/),
    ).toBeTruthy();
    expect(button(/Volver a enviar/).disabled).toBe(false);
  });

  it("saves the switch", async () => {
    updateReservationsOpenNoticeSettings.mockResolvedValue({ success: true });
    renderCard();

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(updateReservationsOpenNoticeSettings).toHaveBeenCalledWith({
      festivalId: 3,
      auto: false,
      channels: ALL,
    });
  });

  it("turns the push off with the in-app item, which it opens", async () => {
    updateReservationsOpenNoticeSettings.mockResolvedValue({ success: true });
    renderCard();

    fireEvent.click(checkbox(/Notificación en Glitter/));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(updateReservationsOpenNoticeSettings).toHaveBeenCalledWith({
      festivalId: 3,
      auto: true,
      channels: { email: true, inApp: false, push: false },
    });
    expect((checkbox(/Notificación push/) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("never saves a festival with no channel", () => {
    renderCard({
      settings: {
        auto: true,
        channels: { email: true, inApp: false, push: false },
      },
    });

    fireEvent.click(checkbox(/Correo electrónico/));
    expect(updateReservationsOpenNoticeSettings).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("puts the saved switch back when saving fails", async () => {
    updateReservationsOpenNoticeSettings.mockResolvedValue({
      success: false,
      message: "No autorizado",
    });
    renderCard();

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No autorizado"),
    );
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("confirms with the audience and the channels, then resends once", async () => {
    fetchReservationsOpenAudience.mockResolvedValue({
      success: true,
      audience: { recipients: 80, withPush: 25 },
    });
    resendReservationsOpenNotice.mockResolvedValue({
      success: true,
      alreadySent: false,
      recipients: 80,
      emails: 79,
      pushes: 0,
    });
    renderCard({ notices: [notice] });

    fireEvent.click(button(/Volver a enviar/));
    expect(
      await screen.findByText(/80 participantes verificados/),
    ).toBeTruthy();
    expect(screen.getByText(/lo recibirán de nuevo/)).toBeTruthy();

    // In the dialog, this send only: the festival's settings stay.
    const dialog = screen.getByRole("alertdialog");
    const push = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]'),
    )[2]!;
    fireEvent.click(push);

    fireEvent.click(button("Enviar aviso"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(resendReservationsOpenNotice).toHaveBeenCalledOnce();
    const [input] = resendReservationsOpenNotice.mock.calls[0]!;
    expect(input).toMatchObject({
      festivalId: 3,
      channels: { email: true, inApp: true, push: false },
    });
    expect(input.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(updateReservationsOpenNoticeSettings).not.toHaveBeenCalled();
  });

  it("says so when the send fails, and lets the admin try again", async () => {
    fetchReservationsOpenAudience.mockResolvedValue({
      success: true,
      audience: { recipients: 80, withPush: 25 },
    });
    resendReservationsOpenNotice.mockRejectedValue(new Error("network"));
    renderCard({ notices: [notice] });

    fireEvent.click(button(/Volver a enviar/));
    await screen.findByText(/80 participantes verificados/);
    fireEvent.click(button("Enviar aviso"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo enviar el aviso. Inténtalo nuevamente.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
    // Still open, and the button works again.
    await waitFor(() => expect(button("Enviar aviso").disabled).toBe(false));
  });

  it("says so when the count fails, instead of loading forever", async () => {
    fetchReservationsOpenAudience.mockRejectedValue(new Error("network"));
    renderCard({ notices: [notice] });

    fireEvent.click(button(/Volver a enviar/));
    expect(
      await screen.findByText(
        "No se pudo calcular a quiénes se enviará el aviso.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Calculando destinatarios/)).toBeNull();
    expect(button("Enviar aviso").disabled).toBe(true);
  });

  it("ignores a count that arrives for a dialog opened before", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    fetchReservationsOpenAudience
      .mockImplementationOnce(
        () => new Promise((resolve) => (answerFirst = resolve)),
      )
      .mockResolvedValueOnce({
        success: true,
        audience: { recipients: 80, withPush: 25 },
      });
    renderCard({ notices: [notice] });

    fireEvent.click(button(/Volver a enviar/));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(button(/Volver a enviar/));
    expect(
      await screen.findByText(/80 participantes verificados/),
    ).toBeTruthy();

    // The first dialog's answer, late.
    answerFirst({
      success: true,
      audience: { recipients: 3, withPush: 0 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(/80 participantes verificados/)).toBeTruthy();
    expect(screen.queryByText(/3 participantes verificados/)).toBeNull();
  });
});
