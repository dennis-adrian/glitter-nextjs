import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const captureClientEventMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));
vi.mock("@/app/lib/posthog-capture", () => ({
  captureClientEvent: captureClientEventMock,
}));
vi.mock("@/app/lib/programs/checkout-actions", () => ({
  startPaidCheckout: vi.fn(),
}));
vi.mock("@/app/lib/programs/promo-code-actions", () => ({
  previewProgramPromoCode: vi.fn(),
}));

import PaidRegistrationForm from "@/app/components/programs/paid-registration-form";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { PROMO_CODE_ERROR_MESSAGES } from "@/app/lib/programs/promo-codes";

function openForm({
  programSlug,
  acceptsPromoCodes,
}: {
  programSlug: string | null;
  acceptsPromoCodes: boolean;
}) {
  render(
    <PaidRegistrationForm
      occurrenceId={7}
      programSlug={programSlug}
      sessionSlug="risografia"
      sessionTitle="Risografía"
      scheduleLabel="1 oct 2026, 10:00 a 12:00"
      isSignedIn
      price={120}
      seatsRemaining={4}
      acceptsPromoCodes={acceptsPromoCodes}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /reservar por/i }));
}

afterEach(() => {
  cleanup();
  captureClientEventMock.mockReset();
});

describe("PaidRegistrationForm promo codes", () => {
  it("keeps the code field for a standalone session, disabled with the reason", () => {
    openForm({ programSlug: null, acceptsPromoCodes: false });

    const field = screen.getByLabelText("Código promocional");
    expect((field as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Aplicar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText(PROMO_CODE_ERROR_MESSAGES.standaloneSession),
    ).toBeTruthy();
    expect(field.getAttribute("aria-describedby")).toBe(
      screen.getByText(PROMO_CODE_ERROR_MESSAGES.standaloneSession).id,
    );
  });

  it("lets a program session apply a code", () => {
    openForm({ programSlug: "semana", acceptsPromoCodes: true });

    const field = screen.getByLabelText("Código promocional");
    expect((field as HTMLInputElement).disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Aplicar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      screen.queryByText(PROMO_CODE_ERROR_MESSAGES.standaloneSession),
    ).toBeNull();
  });
});

describe("PaidRegistrationForm analytics", () => {
  it("marks a standalone session's funnel as standalone", () => {
    openForm({ programSlug: null, acceptsPromoCodes: false });

    expect(captureClientEventMock).toHaveBeenCalledWith(
      POSTHOG_EVENTS.PROGRAM_REGISTRATION_STARTED,
      expect.objectContaining({ program_slug: null, is_standalone: true }),
    );
  });

  it("marks a program session's funnel as not standalone", () => {
    openForm({ programSlug: "semana", acceptsPromoCodes: true });

    expect(captureClientEventMock).toHaveBeenCalledWith(
      POSTHOG_EVENTS.PROGRAM_REGISTRATION_STARTED,
      expect.objectContaining({ program_slug: "semana", is_standalone: false }),
    );
  });
});
