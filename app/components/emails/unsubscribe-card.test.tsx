// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  confirmUnsubscribe: vi.fn(async () => ({
    success: true,
    message: "Listo, te diste de baja.",
  })),
  undoUnsubscribe: vi.fn(async () => ({
    success: true,
    message: "Listo, volviste a suscribirte.",
  })),
}));
vi.mock("@/app/lib/emails/unsubscribe-actions", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import UnsubscribeCard from "@/app/components/emails/unsubscribe-card";

const DEFAULT_COPY =
  "Seguirás recibiendo los correos que vos pidas, como tus entradas o reservas.";
const ANNOUNCEMENTS_COPY =
  "Seguirás recibiendo los correos que vos pidas, como tus entradas o reservas, y los correos esenciales sobre los festivales donde tenés un espacio confirmado, como un cambio en el horario de armado. Los anuncios seguirán apareciendo en tus notificaciones de Glitter.";

function renderCard(
  overrides: Partial<ComponentProps<typeof UnsubscribeCard>> = {},
) {
  return render(
    <UnsubscribeCard
      token="token"
      maskedEmail="d•••@gmail.com"
      topic="announcements"
      topicLabel="los anuncios de Productora Glitter"
      allTopicsLabel="todos nuestros correos masivos"
      unsubscribed={false}
      unsubscribedFromAll={false}
      blocked={false}
      {...overrides}
    />,
  );
}

/** What the card says still arrives, or null. */
function reassurance() {
  return screen.queryByText(/^Seguirás recibiendo/)?.textContent ?? null;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UnsubscribeCard", () => {
  it("tells someone leaving Anuncios that essential mail still comes", () => {
    renderCard();

    expect(screen.getByText("¿Darte de baja?")).toBeTruthy();
    expect(
      screen.getByText(
        "Dejarás de recibir los anuncios de Productora Glitter en d•••@gmail.com.",
      ),
    ).toBeTruthy();
    expect(reassurance()).toBe(ANNOUNCEMENTS_COPY);
  });

  it("keeps saying so after they unsubscribe", async () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Darme de baja" }));
    await screen.findByText("Te diste de baja");
    expect(actions.confirmUnsubscribe).toHaveBeenCalledWith("token");
    expect(reassurance()).toBe(ANNOUNCEMENTS_COPY);
  });

  it("keeps it on an Anuncios link visited already unsubscribed", () => {
    renderCard({ unsubscribed: true });

    expect(screen.getByText("Te diste de baja")).toBeTruthy();
    expect(reassurance()).toBe(ANNOUNCEMENTS_COPY);
  });

  it("keeps today's copy for another topic", () => {
    renderCard({
      topic: "participant_invitations",
      topicLabel: "los avisos de festivales abiertos para participantes",
    });

    expect(reassurance()).toBe(DEFAULT_COPY);
  });

  it("keeps today's copy for an all-mail opt-out, which essential mail never overrides", async () => {
    renderCard({ unsubscribedFromAll: true });

    expect(
      screen.getByText(
        "Ya no enviaremos todos nuestros correos masivos a d•••@gmail.com.",
      ),
    ).toBeTruthy();
    expect(reassurance()).toBe(DEFAULT_COPY);

    // Undoing lifts the all-mail opt-out: the link's topic speaks again.
    fireEvent.click(
      screen.getByRole("button", { name: "Volver a suscribirme" }),
    );
    await screen.findByText("¿Darte de baja?");
    await waitFor(() => expect(reassurance()).toBe(ANNOUNCEMENTS_COPY));
  });

  it("shows only the blocked warning when nothing can be delivered", () => {
    renderCard({ blocked: true });

    expect(reassurance()).toBeNull();
    expect(
      screen.getByText(/Por ahora no podemos enviarte ningún correo/),
    ).toBeTruthy();
  });
});
