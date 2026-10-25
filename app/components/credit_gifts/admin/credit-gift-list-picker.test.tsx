// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CreditGiftListPicker, {
  type CreditGiftListOptions,
} from "@/app/components/credit_gifts/admin/credit-gift-list-picker";
import type { CreditGiftRecipientOption } from "@/app/lib/credit_gifts/definitions";

const mocks = vi.hoisted(() => ({
  expand: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/credit_gifts/actions", () => ({
  expandListForCreditGiftAction: mocks.expand,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

function person(id: number): CreditGiftRecipientOption {
  return {
    id,
    name: `Persona ${id}`,
    greetingName: `Persona ${id}`,
    email: `p${id}@example.com`,
    imageUrl: null,
    status: "verified",
    skipReason: null,
  };
}

const LISTS: CreditGiftListOptions = {
  availability: "enabled",
  festivals: [
    {
      festivalId: 7,
      festivalName: "Glitter Navidad 2026",
      festivalStatus: "published",
      startDate: null,
      count: { eligible: 340, skipped: 12 },
    },
  ],
  saved: [
    {
      id: 3,
      name: "Ilustración Cochabamba",
      description: null,
      kind: "filter",
      count: { eligible: 42, skipped: 0 },
      updatedAt: new Date(),
    },
    {
      id: 4,
      name: "Filtro roto",
      description: null,
      kind: "filter",
      count: null,
      updatedAt: new Date(),
    },
  ],
};

function renderPicker(
  overrides: Partial<{
    lists: CreditGiftListOptions;
    recipients: CreditGiftRecipientOption[];
  }> = {},
) {
  const onAddMany = vi.fn();
  render(
    <CreditGiftListPicker
      lists={overrides.lists ?? LISTS}
      recipients={overrides.recipients ?? []}
      onAddMany={onAddMany}
    />,
  );
  return onAddMany;
}

function openAndPick(text: string) {
  fireEvent.click(screen.getByRole("button", { name: /Agregar una lista/ }));
  fireEvent.click(screen.getByText(text));
}

describe("CreditGiftListPicker", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("is absent for anyone who cannot see the lists", () => {
    renderPicker({ lists: { ...LISTS, availability: "hidden" } });
    expect(screen.queryByRole("button", { name: /Agregar una lista/ })).toBe(
      null,
    );
  });

  it("is disabled outside production, saying why", () => {
    renderPicker({ lists: { ...LISTS, availability: "staging" } });
    expect(
      (
        screen.getByRole("button", {
          name: /Agregar una lista/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText(
        "En el entorno de prueba no se pueden agregar listas a un regalo: agregá a las personas por nombre.",
      ),
    ).toBeTruthy();
  });

  it("shows each list with today's count, and a broken filter disabled", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Agregar una lista/ }));
    expect(screen.getByText("Confirmados · Glitter Navidad 2026")).toBeTruthy();
    expect(
      screen.getByText("Pueden recibirlo hoy: 340 · 12 no lo reciben"),
    ).toBeTruthy();
    expect(screen.getByText("Pueden recibirlo hoy: 42")).toBeTruthy();
    const broken = screen
      .getByText("Filtro roto")
      .closest("[cmdk-item]") as HTMLElement;
    expect(broken.getAttribute("aria-disabled")).toBe("true");
  });

  it("sends who is already chosen and adds only the new people", async () => {
    mocks.expand.mockResolvedValue({
      success: true,
      recipients: [person(2), person(5)],
      message:
        "Agregamos 2 personas de «Ilustración Cochabamba» (1 ya estaba). 3 no pueden recibir regalos.",
    });
    const onAddMany = renderPicker({ recipients: [person(1), person(5)] });
    openAndPick("Ilustración Cochabamba");

    await waitFor(() => expect(onAddMany).toHaveBeenCalled());
    expect(mocks.expand).toHaveBeenCalledWith({
      source: { kind: "list", listId: 3 },
      chosenIds: [1, 5],
    });
    // Person 5 was already there: it is not added twice.
    expect(onAddMany).toHaveBeenCalledWith([person(2)]);
    expect(mocks.success).toHaveBeenCalledWith(
      "Agregamos 2 personas de «Ilustración Cochabamba» (1 ya estaba). 3 no pueden recibir regalos.",
    );
  });

  it("adds nobody when the server refuses the list", async () => {
    const refusal =
      "Con «Confirmados · Glitter Navidad 2026» serían 340 personas y un regalo llega a 100 como máximo. Elegí una lista más chica o agregá personas una por una.";
    mocks.expand.mockResolvedValue({ success: false, message: refusal });
    const onAddMany = renderPicker();
    openAndPick("Confirmados · Glitter Navidad 2026");

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(refusal));
    expect(mocks.expand).toHaveBeenCalledWith({
      source: { kind: "festival", festivalId: 7 },
      chosenIds: [],
    });
    expect(onAddMany).not.toHaveBeenCalled();
  });

  it("refuses on the client too if the gift would pass 100", async () => {
    const chosen = Array.from({ length: 99 }, (_, i) => person(i + 1));
    mocks.expand.mockResolvedValue({
      success: true,
      recipients: [person(500), person(501)],
      message: "Agregamos 2 personas de «Ilustración Cochabamba».",
    });
    const onAddMany = renderPicker({ recipients: chosen });
    openAndPick("Ilustración Cochabamba");

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(onAddMany).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
