// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChannelsCard, {
  essentialSwitchState,
} from "@/app/components/comunicados/admin/composer/channels-card";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";

const NOT_ALLOWED =
  "Solo un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo, puede ser esencial.";
const RULE_LINE =
  "Correo esencial: solo para un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo.";

function preview(
  overrides: Partial<ComunicadoAudiencePreview> = {},
): ComunicadoAudiencePreview {
  return {
    sources: [],
    matched: 1_254,
    eligible: 1_240,
    overlap: 0,
    skipped: [],
    skippedTotal: 0,
    willReceive: 1_240,
    email: {
      sendTo: 1_194,
      unsubscribedAnnouncements: 30,
      unsubscribedAll: 4,
      suppressed: 12,
      invalid: 0,
      essentialOverride: 0,
    },
    pushDevices: 352,
    pushSubscriptions: 410,
    tooLarge: false,
    narrowed: false,
    stagingAdmins: 0,
    essentialAllowed: {
      ok: true,
      reason: null,
      festival: { id: 1, name: "Glitter Navidad 2026" },
    },
    ...overrides,
  };
}

const notAllowed = {
  essentialAllowed: { ok: false, reason: NOT_ALLOWED, festival: null },
};

function renderCard(props: Partial<Parameters<typeof ChannelsCard>[0]> = {}) {
  const onEssentialChange = vi.fn();
  render(
    <ChannelsCard
      sendEmail
      onSendEmailChange={() => {}}
      sendPush={false}
      onSendPushChange={() => {}}
      essential={false}
      onEssentialChange={onEssentialChange}
      essentialReason=""
      onEssentialReasonChange={() => {}}
      preview={preview()}
      pushLaunched
      {...props}
    />,
  );
  return { onEssentialChange };
}

function essentialSwitch() {
  return screen.getByRole("switch", { name: "Correo esencial" });
}

describe("essentialSwitchState", () => {
  it("allows it for the audience B7 allows, with email on", () => {
    expect(
      essentialSwitchState({
        essential: false,
        sendEmail: true,
        preview: preview(),
      }),
    ).toEqual({ allowed: true, canToggle: true, notAllowedReason: null });
  });

  it("does not allow it without email, whatever a stale count says", () => {
    expect(
      essentialSwitchState({
        essential: false,
        sendEmail: false,
        preview: preview(),
      }).canToggle,
    ).toBe(false);
  });

  it("does not allow it before there is a count", () => {
    expect(
      essentialSwitchState({ essential: false, sendEmail: true, preview: null })
        .canToggle,
    ).toBe(false);
  });

  it("keeps it on, and says why, once the audience no longer allows it", () => {
    expect(
      essentialSwitchState({
        essential: true,
        sendEmail: true,
        preview: preview(notAllowed),
      }),
    ).toEqual({
      allowed: false,
      canToggle: true,
      notAllowedReason: NOT_ALLOWED,
    });
  });
});

describe("ChannelsCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("enables essential with today's numbers and the festival", () => {
    const { onEssentialChange } = renderCard();
    expect(essentialSwitch().hasAttribute("disabled")).toBe(false);
    expect(
      screen.getByText(
        "El correo les llega también a quienes se dieron de baja de los anuncios (30 personas). No les llega a quienes pidieron no recibir ningún correo masivo (4) ni a los correos bloqueados (12): ellos lo ven en la app. Usalo solo para algo que cambia su participación en Glitter Navidad 2026, como el horario de armado. Queda registrado quién lo marcó y por qué.",
      ),
    ).toBeTruthy();
    fireEvent.click(essentialSwitch());
    expect(onEssentialChange).toHaveBeenCalledWith(true);
  });

  it("disables essential, with the rule, for any other audience", () => {
    renderCard({ preview: preview(notAllowed) });
    expect(essentialSwitch().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(RULE_LINE)).toBeTruthy();
    expect(screen.queryByLabelText("¿Por qué es esencial?")).toBeNull();
  });

  it("disables essential when email is unticked", () => {
    renderCard({ sendEmail: false });
    expect(essentialSwitch().hasAttribute("disabled")).toBe(true);
  });

  it("leaves a saved essential on, and lets it be turned off, when no longer allowed", () => {
    const { onEssentialChange } = renderCard({
      essential: true,
      essentialReason: "El armado se adelanta",
      preview: preview(notAllowed),
    });
    expect(essentialSwitch().getAttribute("aria-checked")).toBe("true");
    expect(essentialSwitch().hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(new RegExp(`^${NOT_ALLOWED}`))).toBeTruthy();
    expect(screen.getByLabelText("¿Por qué es esencial?")).toBeTruthy();
    fireEvent.click(essentialSwitch());
    expect(onEssentialChange).toHaveBeenCalledWith(false);
  });

  it("says push is not open to participants yet", () => {
    renderCard({ pushLaunched: false });
    expect(
      screen.getByText(
        "Todavía no está abierta a participantes: hoy solo les llegaría a quienes ya la tienen habilitada.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Solo para algo urgente. Llega a los dispositivos de 352 personas que las activaron. Una vez que llega no se puede borrar.",
      ),
    ).toBeTruthy();
  });
});
