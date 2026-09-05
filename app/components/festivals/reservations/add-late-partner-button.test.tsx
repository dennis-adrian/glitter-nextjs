// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const addPartnerMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/reservations/late-partner-actions", () => ({
  addLatePartnerAction: addPartnerMock,
  createLatePartnerCreditTopUpAction: vi.fn(),
}));
vi.mock("@/app/lib/reservations/participant-actions", () => ({
  searchPotentialPartners: searchMock,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import AddLatePartnerButton from "@/app/components/festivals/reservations/add-late-partner-button";

function renderButton(overrides: Record<string, unknown> = {}) {
  return render(
    <AddLatePartnerButton
      reservationId={42}
      festivalId={7}
      sharedPriceDifference={30}
      featurePrice={25}
      totalCredits={55}
      shortfall={0}
      deadlineLabel="15/10/2026"
      {...overrides}
    />,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Agregar compañero" }));
}

describe("AddLatePartnerButton", () => {
  beforeEach(() => {
    searchMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * PRD §8.3 asks for the two components separately. A single total invites
   * "why that much?", which is the question the breakdown answers.
   */
  it("shows the difference and the fee separately, not just a total", () => {
    renderButton();
    openDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("30 créditos");
    expect(dialog.textContent).toContain("25 créditos");
    expect(dialog.textContent).toContain("55 créditos");
  });

  /** §8.4: the original invoice is not reopened, and saying so avoids alarm. */
  it("says the original invoice does not change", () => {
    renderButton();
    openDialog();

    expect(screen.getByRole("dialog").textContent).toContain(
      "factura original no cambia",
    );
  });

  it("names the deadline inside the dialog too", () => {
    renderButton();
    openDialog();

    expect(screen.getByRole("dialog").textContent).toContain("15/10/2026");
  });

  it("will not confirm until somebody is chosen", () => {
    renderButton();
    openDialog();

    const confirm = screen.getByRole("button", {
      name: "Elegí a alguien primero",
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(confirm);
    expect(addPartnerMock).not.toHaveBeenCalled();
  });

  it("sends the chosen partner and a fresh key", async () => {
    searchMock.mockResolvedValue([{ id: 9, displayName: "Carla Dibuja" }]);
    addPartnerMock.mockResolvedValue({ success: true, message: "Listo." });
    crypto.randomUUID = () =>
      "00000000-0000-4000-8000-000000000000" as ReturnType<
        typeof crypto.randomUUID
      >;

    renderButton();
    openDialog();
    fireEvent.change(screen.getByLabelText(/Buscá a tu compañero/), {
      target: { value: "Carla" },
    });
    await vi.waitFor(() => expect(searchMock).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Carla Dibuja" })).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Carla Dibuja" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Agregar a Carla Dibuja" }),
    );

    await vi.waitFor(() =>
      expect(addPartnerMock).toHaveBeenCalledWith({
        reservationId: 42,
        partnerUserId: 9,
        idempotencyKey: "00000000-0000-4000-8000-000000000000",
      }),
    );
  });

  /**
   * Credits are the only way to fund this, so an inert confirm button beside
   * a price would leave somebody hunting for the way forward.
   */
  it("sells the shortfall instead of offering a confirm they cannot use", () => {
    renderButton({ shortfall: 20 });
    openDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Te faltan");
    expect(dialog.textContent).toContain("20 créditos");
    expect(screen.queryByRole("button", { name: /^Agregar a / })).toBeNull();
  });
});
