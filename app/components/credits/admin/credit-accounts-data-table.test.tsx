// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
// The account picker reaches a "use server" module.
vi.mock("@/app/lib/credits/actions", () => ({
  searchParticipantsForCreditsAction: vi.fn(),
}));

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
  usePathname: () => "/dashboard/credits/accounts",
  useSearchParams: () => searchParams,
}));

import CreditAccountsDataTable from "@/app/components/credits/admin/credit-accounts-data-table";

function renderTable() {
  return render(
    <CreditAccountsDataTable rows={[]} rowCount={0} balanceTotal={0} />,
  );
}

function stateTrigger() {
  return screen.getByRole("button", { name: /^Estado/ });
}

/** Ticks a state in the Estado popover. */
function pick(label: string) {
  fireEvent.click(stateTrigger());
  fireEvent.click(screen.getByRole("option", { name: new RegExp(label) }));
}

describe("CreditAccountsDataTable status filter", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    // cmdk scrolls the highlighted option into view and measures its list.
    Element.prototype.scrollIntoView ??= vi.fn();
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  beforeEach(() => {
    push.mockClear();
    searchParams = new URLSearchParams();
    consoleError = vi.spyOn(console, "error");
  });
  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    cleanup();
  });

  it("shows the accounts holding credits until told otherwise", () => {
    renderTable();

    expect(stateTrigger().textContent).toBe("Estado:Con saldo");
    expect(
      screen.getByRole("button", { name: "Quitar Estado: Con saldo" }),
    ).toBeTruthy();
  });

  /** Dropping the parameter instead would bring the default straight back. */
  it("asks for every account when the default is cleared", () => {
    renderTable();

    fireEvent.click(
      screen.getByRole("button", { name: "Quitar Estado: Con saldo" }),
    );

    expect(push).toHaveBeenCalledWith("/dashboard/credits/accounts?filter=", {
      scroll: false,
    });
  });

  it("reads an empty filter as no state at all", () => {
    searchParams = new URLSearchParams("filter=");
    renderTable();

    expect(stateTrigger().textContent).toBe("Estado");
    expect(screen.queryByRole("button", { name: /^Quitar Estado/ })).toBeNull();
  });

  it("ignores a state it does not offer, as the server does", () => {
    searchParams = new URLSearchParams("filter=bogus");
    renderTable();

    expect(stateTrigger().textContent).toBe("Estado");
    expect(screen.queryByRole("button", { name: /^Quitar Estado/ })).toBeNull();
  });

  it("adds a second state instead of replacing the first", () => {
    renderTable();

    pick("En negativo");

    expect(push).toHaveBeenCalledWith(
      "/dashboard/credits/accounts?filter=positive&filter=debt",
      { scroll: false },
    );
  });

  it("names every chosen state as its own chip", () => {
    searchParams = new URLSearchParams("filter=positive&filter=drift");
    renderTable();

    expect(stateTrigger().textContent).toBe("Estado:2 seleccionados");
    const chips = screen.getAllByRole("button", { name: /^Quitar Estado/ });
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Quitar Estado: Con saldo",
      "Quitar Estado: Con descuadre",
    ]);
  });

  it("drops the parameter when the choice is back to the default", () => {
    searchParams = new URLSearchParams("filter=");
    renderTable();

    pick("Con saldo");

    expect(push).toHaveBeenCalledWith("/dashboard/credits/accounts", {
      scroll: false,
    });
  });
});
