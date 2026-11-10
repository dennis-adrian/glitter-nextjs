// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  fetchStandsAvailableAudience,
  sendStandsAvailableReminder,
  refresh,
  toast,
} = vi.hoisted(() => ({
  fetchStandsAvailableAudience: vi.fn(),
  sendStandsAvailableReminder: vi.fn(),
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/app/lib/festivals/stands-available-actions", () => ({
  fetchStandsAvailableAudience,
  sendStandsAvailableReminder,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));

import FestivalStandsAvailableReminder from "@/app/components/festivals/festival-stands-available-reminder";
import type { StandsAvailableReminderSummary } from "@/app/lib/festivals/stands-available-reminders";

const ALL = { email: true, inApp: true, push: true };

const reminder: StandsAvailableReminderSummary = {
  campaignId: 4,
  audience: "terms_accepted",
  createdAt: new Date("2026-11-22T15:00:00Z"),
  sentByName: "Ana Admin",
  channels: ALL,
  recipients: 35,
  emails: 35,
  emailsSent: 30,
  pushes: 12,
  pushesSent: 12,
};

function renderReminder(
  props: Partial<Parameters<typeof FestivalStandsAvailableReminder>[0]> = {},
) {
  return render(
    <FestivalStandsAvailableReminder
      festivalId={3}
      active
      archived={false}
      reservationsOpen
      availableStands={{ illustration: 12, gastronomy: 3 }}
      defaultChannels={ALL}
      reminders={[]}
      {...props}
    />,
  );
}

function sendButton() {
  return screen.getByRole("button", {
    name: /Enviar recordatorio/,
  }) as HTMLButtonElement;
}

describe("FestivalStandsAvailableReminder", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("says what is left, by category, and can be sent", () => {
    renderReminder();
    expect(
      screen.getByText("Quedan 12 espacios de Ilustración y 3 de Gastronomía."),
    ).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
  });

  it("cannot be sent with nothing left", () => {
    renderReminder({ availableStands: {} });
    expect(screen.getByText(/No quedan espacios disponibles/)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
  });

  it("cannot be sent before reservations open", () => {
    renderReminder({ reservationsOpen: false });
    expect(sendButton().disabled).toBe(true);
  });

  it("lists what was sent, to whom and how", () => {
    renderReminder({ reminders: [reminder] });
    expect(screen.getByText(/Enviado por Ana Admin/)).toBeTruthy();
    expect(
      screen.getByText(
        "Quienes aceptaron los términos · 35 participantes por correo, Glitter y push · 30/35 correos · 12/12 push",
      ),
    ).toBeTruthy();
  });

  it("sends to who accepted the terms by default, or to everyone eligible", async () => {
    fetchStandsAvailableAudience.mockResolvedValue({
      success: true,
      audiences: {
        terms_accepted: { recipients: 35, withPush: 12 },
        all_eligible: { recipients: 80, withPush: 20 },
      },
    });
    sendStandsAvailableReminder.mockResolvedValue({
      success: true,
      alreadySent: false,
      recipients: 80,
      emails: 80,
      pushes: 20,
    });
    renderReminder();

    fireEvent.click(sendButton());
    expect(await screen.findByText(/35 personas/)).toBeTruthy();
    expect(screen.getByText(/80 personas/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("radio", {
        name: /Todos los participantes verificados/,
      }),
    );
    expect(screen.getByText(/20 de ellos tienen/)).toBeTruthy();

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Enviar recordatorio" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sendStandsAvailableReminder).toHaveBeenCalledOnce();
    const [input] = sendStandsAvailableReminder.mock.calls[0]!;
    expect(input).toMatchObject({
      festivalId: 3,
      audience: "all_eligible",
      channels: ALL,
    });
    expect(input.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("says so when the counts fail, instead of loading forever", async () => {
    fetchStandsAvailableAudience.mockRejectedValue(new Error("network"));
    renderReminder();

    fireEvent.click(sendButton());
    expect(
      await screen.findByText(
        "No se pudo calcular a quiénes se enviará el recordatorio.",
      ),
    ).toBeTruthy();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).queryByLabelText("Calculando")).toBeNull();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Enviar recordatorio",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("ignores counts that arrive for a dialog opened before", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    fetchStandsAvailableAudience
      .mockImplementationOnce(
        () => new Promise((resolve) => (answerFirst = resolve)),
      )
      .mockResolvedValueOnce({
        success: true,
        audiences: {
          terms_accepted: { recipients: 35, withPush: 12 },
          all_eligible: { recipients: 80, withPush: 20 },
        },
      });
    renderReminder();

    fireEvent.click(sendButton());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(sendButton());
    expect(await screen.findByText(/35 personas/)).toBeTruthy();

    // The first dialog's answer, late.
    answerFirst({
      success: true,
      audiences: {
        terms_accepted: { recipients: 2, withPush: 0 },
        all_eligible: { recipients: 4, withPush: 0 },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(/35 personas/)).toBeTruthy();
    expect(screen.queryByText(/2 personas/)).toBeNull();
  });

  it("says so when the send fails, and lets the admin try again", async () => {
    fetchStandsAvailableAudience.mockResolvedValue({
      success: true,
      audiences: {
        terms_accepted: { recipients: 35, withPush: 12 },
        all_eligible: { recipients: 80, withPush: 20 },
      },
    });
    sendStandsAvailableReminder.mockRejectedValue(new Error("network"));
    renderReminder();

    fireEvent.click(sendButton());
    await screen.findByText(/35 personas/);
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Enviar recordatorio",
    }) as HTMLButtonElement;
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo enviar el recordatorio. Inténtalo nuevamente.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(confirm.disabled).toBe(false));
  });
});
