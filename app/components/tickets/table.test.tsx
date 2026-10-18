// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/festivals/5/tickets/list",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/data/tickets/actions", () => ({ updateTicket: vi.fn() }));
vi.mock("@/app/lib/tickets/resend-actions", () => ({
  resendTicketEmail: vi.fn(),
}));

import TicketsTable from "@/app/components/tickets/table";

const date = new Date("2026-10-09T15:00:00.000Z");

function openResendFor(
  festivalStatus: string,
  ticketNumber: number | null,
): HTMLElement {
  render(
    <TicketsTable
      festival={
        {
          id: 5,
          status: festivalStatus,
          festivalDates: [{ startDate: date }],
        } as never
      }
      tickets={[
        {
          id: 7,
          date,
          status: "pending",
          visitorId: 3,
          isEventDayCreation: false,
          festivalId: 5,
          numberOfVisitors: 1,
          ticketNumber,
          checkedInAt: null,
          updatedAt: date,
          createdAt: date,
          visitor: { id: 3, firstName: "Ana", lastName: "Pérez" } as never,
        },
      ]}
    />,
  );

  const row = screen.getByRole("row", { name: /Ana Pérez/ });
  fireEvent.keyDown(within(row).getByRole("button", { name: "Acciones" }), {
    key: "Enter",
  });
  return screen.getByRole("menuitem", {
    name: /Reenviar entrada por correo/,
  });
}

describe("TicketsTable resend action", () => {
  beforeAll(() => {
    // The check-in switch measures itself; jsdom ships no ResizeObserver.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(cleanup);

  it("is disabled with the reason for a festival that is not active", () => {
    const item = openResendFor("archived", 2);

    expect(item.hasAttribute("data-disabled")).toBe(true);
    expect(
      within(item).getByText(
        "Solo se pueden reenviar entradas del festival activo.",
      ),
    ).toBeTruthy();
  });

  it("is disabled with the reason for a ticket without a number", () => {
    const item = openResendFor("active", null);

    expect(item.hasAttribute("data-disabled")).toBe(true);
    expect(
      within(item).getByText("Esta entrada no tiene código QR para reenviar."),
    ).toBeTruthy();
  });

  it("is offered for a numbered ticket of the active festival", () => {
    const item = openResendFor("active", 2);

    expect(item.hasAttribute("data-disabled")).toBe(false);
  });
});
