import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureClientEventMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/lib/posthog-capture", () => ({
  captureClientEvent: captureClientEventMock,
}));
vi.mock("@/app/lib/volunteers/actions", () => ({
  submitVolunteerApplication: submitMock,
}));

import VolunteerApplicationForm from "@/app/components/volunteers/volunteer-application-form";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

/**
 * A smoke test of the placeholder form: it renders the festival's rows and
 * wires analytics and validation. The markup itself is expected to change.
 */

function renderForm() {
  render(
    <VolunteerApplicationForm
      festivalId={9}
      roles={[
        { id: 1, name: "Orientación al público", description: "" },
        { id: 2, name: "Redes y foto", description: "" },
      ]}
      shifts={[
        {
          id: 5,
          label: "Montaje",
          startsAt: new Date("2026-12-18T19:00:00Z"),
          endsAt: new Date("2026-12-18T23:00:00Z"),
        },
      ]}
      ageCutoffDate="2026-12-18"
      applicationsCloseAt={new Date("2099-01-01T00:00:00Z")}
    />,
  );
}

beforeEach(() => {
  // Radix's checkbox measures itself; jsdom has no ResizeObserver.
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
  vi.unstubAllGlobals();
  captureClientEventMock.mockReset();
  submitMock.mockReset();
});

describe("VolunteerApplicationForm", () => {
  it("lists the shifts it is given, on La Paz's clock", () => {
    renderForm();
    expect(screen.getByText("Vie 18 dic, 15:00–19:00 — Montaje")).toBeTruthy();
  });

  it("reports the form as started once, without what was typed", () => {
    renderForm();
    const name = screen.getByLabelText(/Nombre completo/);
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "Camila Rojas" } });
    fireEvent.focus(screen.getByLabelText(/^Email/));

    const started = captureClientEventMock.mock.calls.filter(
      ([event]) => event === POSTHOG_EVENTS.VOLUNTEER_FORM_STARTED,
    );
    expect(started).toEqual([
      [
        POSTHOG_EVENTS.VOLUNTEER_FORM_STARTED,
        { festival_id: 9, first_field: "fullName" },
      ],
    ]);
  });

  it("does not submit an empty form", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar postulación" }));
    await waitFor(() =>
      expect(screen.getByText("Elige al menos un turno")).toBeTruthy(),
    );
    expect(submitMock).not.toHaveBeenCalled();
  });
});
