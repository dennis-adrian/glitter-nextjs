// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  updateVolunteerCallSettings: mocks.save,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import VolunteerCallSettingsForm, {
  volunteerCallSettingsDefaults,
} from "@/app/components/volunteers/admin/volunteer-call-settings-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settings = {
  // 23:59 on 30 November in La Paz (UTC-4).
  applicationsCloseAt: new Date("2026-12-01T03:59:00Z"),
  inductionDate: "2026-12-05",
  inductionTime: "18:00:00",
};

describe("volunteerCallSettingsDefaults", () => {
  it("shows the close on La Paz's clock and the time without seconds", () => {
    expect(volunteerCallSettingsDefaults(9, settings)).toEqual({
      festivalId: 9,
      applicationsCloseAt: "2026-11-30T23:59",
      inductionDate: "2026-12-05",
      inductionTime: "18:00",
    });
  });

  it("starts empty without a call", () => {
    expect(volunteerCallSettingsDefaults(9, null)).toEqual({
      festivalId: 9,
      applicationsCloseAt: "",
      inductionDate: "",
      inductionTime: "",
    });
  });
});

describe("VolunteerCallSettingsForm", () => {
  it("fills the inputs from the saved settings", () => {
    render(<VolunteerCallSettingsForm festivalId={9} settings={settings} />);

    expect(screen.getByLabelText(/Cierre de postulaciones/)).toHaveProperty(
      "value",
      "2026-11-30T23:59",
    );
    expect(screen.getByLabelText(/Hora de la inducción/)).toHaveProperty(
      "value",
      "18:00",
    );
    expect(screen.getByRole("button", { name: "Guardar fechas" })).toBeTruthy();
  });

  it("asks for the induction date when only its time is set", async () => {
    render(
      <VolunteerCallSettingsForm
        festivalId={9}
        settings={{ ...settings, inductionDate: null, inductionTime: null }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Hora de la inducción/), {
      target: { value: "18:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar fechas" }));

    expect(
      await screen.findByText("Indicá la fecha de la inducción."),
    ).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("opens the call with the raw La Paz values", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Listo." });
    render(<VolunteerCallSettingsForm festivalId={9} settings={null} />);

    fireEvent.change(screen.getByLabelText(/Cierre de postulaciones/), {
      target: { value: "2026-11-30T23:59" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Abrir convocatoria" }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        festivalId: 9,
        applicationsCloseAt: "2026-11-30T23:59",
        inductionDate: "",
        inductionTime: "",
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith("Listo.");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("asks for the close when it is missing", async () => {
    render(<VolunteerCallSettingsForm festivalId={9} settings={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir convocatoria" }));

    expect(
      await screen.findByText("Indicá la fecha y la hora de cierre."),
    ).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
