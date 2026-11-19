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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/lib/posthog-capture", () => ({
  captureClientEvent: captureClientEventMock,
}));
vi.mock("@/app/lib/volunteers/actions", () => ({
  submitVolunteerApplication: submitMock,
}));

import VolunteerApplicationWizard from "@/app/components/volunteers/volunteer-application-wizard";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { volunteerDraftKey } from "@/app/lib/volunteers/draft";

const FESTIVAL_ID = 9;

const props = {
  festivalId: FESTIVAL_ID,
  festivalName: "Glitter v11",
  roles: [
    { id: 1, name: "Orientación al público", description: "" },
    { id: 2, name: "Fotografía y redes sociales", description: "" },
  ],
  shifts: [
    {
      id: 5,
      label: "Montaje",
      startsAt: new Date("2026-12-18T19:00:00Z"),
      endsAt: new Date("2026-12-18T23:00:00Z"),
    },
    {
      id: 6,
      label: "Festival (turno A)",
      startsAt: new Date("2026-12-19T17:30:00Z"),
      endsAt: new Date("2026-12-19T21:30:00Z"),
    },
  ],
  ageCutoffDate: "2026-12-18",
  applicationsCloseAt: new Date("2099-01-01T00:00:00Z"),
  closesLabel: "lunes 30 de noviembre a las 23:59",
  closesOn: "30 de noviembre",
  induction: "sábado 5 de diciembre",
};

function storeDraft(step: number, values: Record<string, unknown>) {
  window.sessionStorage.setItem(
    volunteerDraftKey(FESTIVAL_ID),
    JSON.stringify({ version: 1, step, values }),
  );
}

const validPersonal = {
  fullName: "Camila Rojas",
  birthdate: "2000-05-10",
  phone: "+59171234567",
  email: "camila@example.test",
};

/** The phone layout and the desktop card both render in jsdom; either works. */
function clickPrimary(name: string) {
  fireEvent.click(screen.getAllByRole("button", { name })[0]!);
}

function stepTitle() {
  return document.getElementById("volunteer-step-title")?.textContent;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.scrollTo = vi.fn() as never;
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

describe("VolunteerApplicationWizard", () => {
  it("stays on a step until its own fields pass", async () => {
    render(<VolunteerApplicationWizard {...props} />);
    expect(stepTitle()).toBe("Tus datos");

    clickPrimary("Continuar");

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Revisá los campos marcados antes de enviar.",
      ),
    );
    expect(stepTitle()).toBe("Tus datos");
    expect(screen.getByText("Escribí tu nombre completo")).toBeTruthy();
    expect(
      screen.getByText("Ingresá un número de celular válido."),
    ).toBeTruthy();
    // Later steps are not judged yet.
    expect(screen.queryByText("Elegí al menos un turno.")).toBeNull();
  });

  it("moves on once the step is valid, and reports each step once", async () => {
    storeDraft(0, validPersonal);
    render(<VolunteerApplicationWizard {...props} />);
    expect(
      (screen.getByLabelText(/Nombre completo/) as HTMLInputElement).value,
    ).toBe("Camila Rojas");

    clickPrimary("Continuar");

    await waitFor(() => expect(stepTitle()).toBe("Turnos y roles"));
    const viewed = captureClientEventMock.mock.calls
      .filter(([event]) => event === POSTHOG_EVENTS.VOLUNTEER_FORM_STEP_VIEWED)
      .map(([, properties]) => properties);
    expect(viewed).toEqual([
      { festival_id: FESTIVAL_ID, step_number: 1, step_name: "personal" },
      { festival_id: FESTIVAL_ID, step_number: 2, step_name: "shiftsAndRoles" },
    ]);
  });

  it("checks the two roles differ before leaving step 2", async () => {
    storeDraft(1, {
      ...validPersonal,
      shiftIds: [5],
      firstChoiceRoleId: "1",
      secondChoiceRoleId: "1",
    });
    render(<VolunteerApplicationWizard {...props} />);
    expect(stepTitle()).toBe("Turnos y roles");

    clickPrimary("Continuar");

    await waitFor(() =>
      expect(
        screen.getByText("Elegí un rol distinto al de tu 1ª opción."),
      ).toBeTruthy(),
    );
    expect(stepTitle()).toBe("Turnos y roles");
  });

  it("clears the shift error as soon as a shift is picked", async () => {
    storeDraft(1, validPersonal);
    render(<VolunteerApplicationWizard {...props} />);
    expect(stepTitle()).toBe("Turnos y roles");

    clickPrimary("Continuar");
    await waitFor(() =>
      expect(screen.getByText("Elegí al menos un turno.")).toBeTruthy(),
    );

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);

    await waitFor(() =>
      expect(screen.queryByText("Elegí al menos un turno.")).toBeNull(),
    );
  });

  it("announces the two commitments as required, not image consent", () => {
    storeDraft(3, validPersonal);
    render(<VolunteerApplicationWizard {...props} />);

    const required = screen
      .getAllByRole("checkbox")
      .map((box) => box.getAttribute("aria-required"));
    expect(required).toEqual(["true", "true", null]);
  });

  it("sends a failed final check back to the earliest step at fault", async () => {
    // A draft on the last step whose "Sobre vos" answers are missing.
    storeDraft(3, {
      ...validPersonal,
      shiftIds: [5],
      firstChoiceRoleId: "1",
      secondChoiceRoleId: "2",
    });
    render(<VolunteerApplicationWizard {...props} />);
    expect(stepTitle()).toBe("Último paso");

    clickPrimary("Enviar postulación");

    await waitFor(() => expect(stepTitle()).toBe("Sobre vos"));
  });

  it("keeps the answers when going back, and in sessionStorage", async () => {
    storeDraft(1, validPersonal);
    render(<VolunteerApplicationWizard {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Volver al paso 1" }));
    await waitFor(() => expect(stepTitle()).toBe("Tus datos"));
    expect((screen.getByLabelText(/^Correo/) as HTMLInputElement).value).toBe(
      "camila@example.test",
    );

    fireEvent.change(screen.getByLabelText(/Zona donde vivís/), {
      target: { value: "Equipetrol" },
    });
    await waitFor(() => {
      const stored = JSON.parse(
        window.sessionStorage.getItem(volunteerDraftKey(FESTIVAL_ID)) ?? "{}",
      );
      expect(stored.step).toBe(0);
      expect(stored.values.zone).toBe("Equipetrol");
      expect(stored.values.fullName).toBe("Camila Rojas");
      expect(stored.values).not.toHaveProperty("website");
    });
  });
});
