import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchInvitationAudience: vi.fn(),
  previewInvitationEmail: vi.fn(),
  fetchActivationNotificationAudience: vi.fn(),
  previewActivationNotification: vi.fn(),
  sendActivationNotifications: vi.fn(),
  start: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/app/lib/festivals/invitations", () => ({
  fetchInvitationAudience: mocks.fetchInvitationAudience,
  previewInvitationEmail: mocks.previewInvitationEmail,
}));
vi.mock("@/app/lib/festivals/activation-notifications", () => ({
  fetchActivationNotificationAudience:
    mocks.fetchActivationNotificationAudience,
  previewActivationNotification: mocks.previewActivationNotification,
  sendActivationNotifications: mocks.sendActivationNotifications,
}));
vi.mock(
  "@/app/components/festivals/invitations/use-invitation-sender",
  () => ({
    useInvitationSender: () => ({
      state: { status: "idle" },
      start: mocks.start,
      retryFailures: vi.fn(),
      reset: vi.fn(),
    }),
  }),
);

import FestivalSettingDialog, {
  notificationSentMessage,
} from "@/app/components/festivals/modals/festival-setting-dialog";

const onConfirm = vi.fn();
const onOpenChange = vi.fn();

function renderDialog() {
  return render(
    <FestivalSettingDialog
      open
      onOpenChange={onOpenChange}
      title="Activar festival"
      description="Glitter pasará a estar activo."
      confirmLabel="Activar festival"
      onConfirm={onConfirm}
      invitation={{
        festivalId: 7,
        kind: "participant_activation",
        optionLabel: (audience) =>
          `Invitar por correo a ${audience.recipients} participantes verificados de las categorías del festival`,
      }}
      notification={{ festivalId: 7 }}
    />,
  );
}

function audience(recipients: number, withPush: number) {
  mocks.fetchActivationNotificationAudience.mockResolvedValue({
    success: true,
    audience: { recipients, withPush },
  });
}

const confirm = () =>
  fireEvent.click(screen.getByRole("button", { name: "Activar festival" }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchInvitationAudience.mockResolvedValue({
    success: true,
    audience: {
      recipients: 611,
      alreadyRegistered: 0,
      invalidEmails: 0,
      bounced: 0,
      optedOut: 0,
    },
  });
  onConfirm.mockResolvedValue({ success: true, message: "Festival activado" });
  mocks.sendActivationNotifications.mockResolvedValue({
    success: true,
    notified: 640,
    alreadyNotified: 0,
    pushes: 120,
  });
});
afterEach(cleanup);

describe("FestivalSettingDialog with a Glitter notification", () => {
  it("offers email, Glitter and push, each counted, all ticked", async () => {
    audience(640, 95);
    renderDialog();

    const inApp = await screen.findByRole("checkbox", {
      name: /Notificar en Glitter a 640 participantes verificados/,
    });
    const push = screen.getByRole("checkbox", { name: "También como push" });
    const email = screen.getByRole("checkbox", {
      name: /Invitar por correo a 611/,
    });
    for (const box of [email, inApp, push]) {
      expect(box.getAttribute("data-state")).toBe("checked");
    }
    expect(
      screen.getByText(
        "A 95 participantes con los avisos activados en su dispositivo.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Ver la notificación/ }),
    ).toBeTruthy();
  });

  it("activates, then notifies with push, then mails", async () => {
    audience(640, 95);
    renderDialog();
    await screen.findByRole("checkbox", { name: /Notificar en Glitter/ });

    confirm();

    await waitFor(() => expect(mocks.start).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalled();
    expect(mocks.sendActivationNotifications).toHaveBeenCalledWith({
      festivalId: 7,
      push: true,
    });
    expect(
      onConfirm.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.sendActivationNotifications.mock.invocationCallOrder[0]);
    expect(
      mocks.sendActivationNotifications.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.start.mock.invocationCallOrder[0]);
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Notificamos en Glitter a 640 participantes, con push a 120 dispositivos.",
    );
  });

  it("sends the Glitter notice without push when push is unticked", async () => {
    audience(640, 95);
    renderDialog();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "También como push" }),
    );

    confirm();

    await waitFor(() =>
      expect(mocks.sendActivationNotifications).toHaveBeenCalledWith({
        festivalId: 7,
        push: false,
      }),
    );
  });

  it("sends no notice, and turns push off, when Glitter is unticked", async () => {
    audience(640, 95);
    renderDialog();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Notificar en Glitter/ }),
    );

    const push = screen.getByRole("checkbox", { name: "También como push" });
    expect((push as HTMLButtonElement).disabled).toBe(true);
    expect(push.getAttribute("data-state")).toBe("unchecked");

    confirm();

    await waitFor(() => expect(mocks.start).toHaveBeenCalled());
    expect(mocks.sendActivationNotifications).not.toHaveBeenCalled();
  });

  it("cannot push when nobody has a device", async () => {
    audience(640, 0);
    renderDialog();

    const push = await screen.findByRole("checkbox", {
      name: "También como push",
    });
    expect((push as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Ninguno de ellos activó los avisos en su dispositivo."),
    ).toBeTruthy();

    confirm();

    await waitFor(() =>
      expect(mocks.sendActivationNotifications).toHaveBeenCalledWith({
        festivalId: 7,
        push: false,
      }),
    );
  });

  it("sends nothing when the activation fails", async () => {
    audience(640, 95);
    onConfirm.mockResolvedValue({ success: false, message: "No autorizado" });
    renderDialog();
    await screen.findByRole("checkbox", { name: /Notificar en Glitter/ });

    confirm();

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("No autorizado"),
    );
    expect(mocks.sendActivationNotifications).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("still mails when the notice fails, and says so", async () => {
    audience(640, 95);
    mocks.sendActivationNotifications.mockResolvedValue({
      success: false,
      message: "No se pudieron enviar las notificaciones. Inténtalo nuevamente.",
    });
    renderDialog();
    await screen.findByRole("checkbox", { name: /Notificar en Glitter/ });

    confirm();

    await waitFor(() => expect(mocks.start).toHaveBeenCalled());
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "No se pudieron enviar las notificaciones. Inténtalo nuevamente.",
    );
  });
});

describe("notificationSentMessage", () => {
  it("counts people and devices, singular at one", () => {
    expect(
      notificationSentMessage({
        success: true,
        notified: 1,
        alreadyNotified: 0,
        pushes: 1,
      }),
    ).toBe("Notificamos en Glitter a 1 participante, con push a 1 dispositivo.");
    expect(
      notificationSentMessage({
        success: true,
        notified: 3,
        alreadyNotified: 0,
        pushes: 0,
      }),
    ).toBe("Notificamos en Glitter a 3 participantes.");
  });

  it("says when everyone already had it", () => {
    expect(
      notificationSentMessage({
        success: true,
        notified: 0,
        alreadyNotified: 5,
        pushes: 0,
      }),
    ).toBe("Los participantes ya habían recibido la notificación en Glitter.");
  });
});
