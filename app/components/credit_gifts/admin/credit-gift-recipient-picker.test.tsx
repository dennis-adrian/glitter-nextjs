// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CreditGiftRecipientPicker from "@/app/components/credit_gifts/admin/credit-gift-recipient-picker";
import type { CreditGiftListOptions } from "@/app/components/credit_gifts/admin/credit-gift-list-picker";
import type { CreditGiftRecipientOption } from "@/app/lib/credit_gifts/definitions";

const mocks = vi.hoisted(() => ({ expand: vi.fn() }));
vi.mock("@/app/lib/credit_gifts/actions", () => ({
  expandListForCreditGiftAction: mocks.expand,
  searchCreditGiftRecipientsAction: vi.fn(async () => []),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ANA: CreditGiftRecipientOption = {
  id: 1,
  name: "Ana",
  greetingName: "Ana",
  email: "ana@example.com",
  imageUrl: null,
  status: "verified",
  skipReason: null,
};

const LISTS: CreditGiftListOptions = {
  availability: "enabled",
  festivals: [],
  saved: [
    {
      id: 3,
      name: "Voluntarios",
      description: null,
      kind: "fixed",
      count: { eligible: 4, skipped: 0 },
      updatedAt: new Date(),
    },
  ],
};

describe("CreditGiftRecipientPicker", () => {
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

  it("holds who is chosen still while a list is being added", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.expand.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onRemove = vi.fn();
    render(
      <CreditGiftRecipientPicker
        recipients={[ANA]}
        onAdd={vi.fn()}
        onAddMany={vi.fn()}
        onRemove={onRemove}
        lists={LISTS}
      />,
    );
    const remove = () =>
      screen.getByRole("button", { name: "Quitar a Ana" }) as HTMLButtonElement;
    expect(remove().disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Agregar una lista/ }));
    fireEvent.click(screen.getByText("Voluntarios"));

    // The server is counting Ana as chosen: she cannot leave meanwhile.
    await waitFor(() => expect(remove().disabled).toBe(true));
    expect(mocks.expand).toHaveBeenCalledWith({
      source: { kind: "list", listId: 3 },
      chosenIds: [1],
    });

    finish({ success: true, recipients: [], message: "Listo." });
    await waitFor(() => expect(remove().disabled).toBe(false));
  });
});
