import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/festivals/activation-notifications", () => ({
  previewActivationNotification: vi.fn(),
}));

import ActivationNotificationPreview from "@/app/components/festivals/invitations/activation-notification-preview";
import { previewActivationNotification } from "@/app/lib/festivals/activation-notifications";

const preview = vi.mocked(previewActivationNotification);

const READY = {
  success: true as const,
  item: {
    title: "Te invitamos a participar en Glitter Vol. 9",
    body: "Las reservas se habilitarán el 20 de noviembre de 2026 a las 10:00 AM. Hasta mientras, leé con atención los términos y condiciones.",
    actionPath: "/festivals/3/terms",
    actionLabel: "Leer términos y condiciones",
  },
  push: {
    title: "Te invitamos a participar en Glitter Vol. 9",
    body: "Las reservas se habilitarán el 20 de noviembre…",
  },
};

afterEach(cleanup);
beforeEach(() => preview.mockReset());

describe("ActivationNotificationPreview", () => {
  it("renders the inbox row and the lock screen only once asked", async () => {
    preview.mockResolvedValue(READY);
    render(<ActivationNotificationPreview festivalId={3} showPush />);
    expect(preview).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: /Ver la notificación/ }),
    );

    expect(await screen.findByText("En sus notificaciones de Glitter")).toBeTruthy();
    expect(preview).toHaveBeenCalledWith(3);
    expect(screen.getByText("Como push, en su dispositivo")).toBeTruthy();
    expect(screen.getByText(READY.push.body)).toBeTruthy();
  });

  it("leaves the lock screen out when it goes without push", async () => {
    preview.mockResolvedValue(READY);
    render(<ActivationNotificationPreview festivalId={3} showPush={false} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Ver la notificación/ }),
    );

    expect(await screen.findByText("En sus notificaciones de Glitter")).toBeTruthy();
    expect(screen.queryByText("Como push, en su dispositivo")).toBeNull();
  });

  it("offers a retry when the preview fails", async () => {
    preview.mockResolvedValue({
      success: false,
      message: "No se pudo generar la vista previa de la notificación.",
    });
    render(<ActivationNotificationPreview festivalId={3} showPush />);

    fireEvent.click(
      screen.getByRole("button", { name: /Ver la notificación/ }),
    );

    expect(
      await screen.findByText(
        "No se pudo generar la vista previa de la notificación.",
      ),
    ).toBeTruthy();
    preview.mockResolvedValue(READY);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("En sus notificaciones de Glitter")).toBeTruthy();
  });
});
