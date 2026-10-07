import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureClientEventMock = vi.hoisted(() => vi.fn());
const claimTicketMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/lib/posthog-capture", () => ({
  captureClientEvent: captureClientEventMock,
}));
vi.mock("@/app/lib/visitors/registration-actions", () => ({
  claimTicket: claimTicketMock,
}));

import AddTicketForm from "@/app/components/events/registration/add-ticket-form";
import type { FestivalDate } from "@/app/lib/festivals/definitions";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

beforeEach(() => {
  // The day picker is a Radix radio group, which measures itself.
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
  vi.unstubAllGlobals();
  cleanup();
  captureClientEventMock.mockReset();
  claimTicketMock.mockReset();
});

const day = {
  id: 1,
  festivalId: 9,
  startDate: new Date("2026-11-14T14:00:00.000Z"),
  endDate: new Date("2026-11-15T00:00:00.000Z"),
} as FestivalDate;

async function claim() {
  const onSuccess = vi.fn();
  render(
    <AddTicketForm
      festivalId={9}
      festivalName="Glitter"
      festivalDates={[day]}
      onSuccess={onSuccess}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Adquirir entrada" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
}

describe("AddTicketForm analytics", () => {
  it("counts a newly issued ticket as the conversion", async () => {
    claimTicketMock.mockResolvedValue({
      success: true,
      message: "¡Listo!",
      view: {},
      issued: true,
    });

    await claim();

    expect(captureClientEventMock).toHaveBeenCalledWith(
      POSTHOG_EVENTS.VISITOR_TICKET_CLAIMED,
      { festival_id: 9, festival_date: "2026-11-14T14:00:00.000Z" },
    );
  });

  it("does not count a day the visitor already held", async () => {
    claimTicketMock.mockResolvedValue({
      success: true,
      message: "Ya tenías una entrada para este día",
      view: {},
      issued: false,
    });

    await claim();

    expect(captureClientEventMock).not.toHaveBeenCalled();
  });
});
