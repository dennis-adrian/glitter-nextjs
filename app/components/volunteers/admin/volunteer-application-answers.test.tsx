// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { DateTime } from "luxon";
import { afterEach, describe, expect, it } from "vitest";

import VolunteerApplicationAnswers from "@/app/components/volunteers/admin/volunteer-application-answers";
import VolunteerApplicationContact, {
  formatVolunteerAge,
} from "@/app/components/volunteers/admin/volunteer-application-contact";
import type { VolunteerApplicationDetail } from "@/app/lib/volunteers/admin-definitions";

afterEach(cleanup);

const roles = [
  { id: 1, name: "Fotografía", description: "", sortOrder: 0, isActive: true },
  { id: 2, name: "Prensa", description: "", sortOrder: 1, isActive: false },
];
const shifts = [
  {
    id: 10,
    label: "Montaje",
    // Vie 18 dic, 15:00–19:00 in La Paz (UTC-4).
    startsAt: new Date("2026-12-18T19:00:00Z"),
    endsAt: new Date("2026-12-18T23:00:00Z"),
    neededHeadcount: 4,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: 11,
    label: "Puerta",
    startsAt: new Date("2026-12-19T14:00:00Z"),
    endsAt: new Date("2026-12-19T18:00:00Z"),
    neededHeadcount: 2,
    sortOrder: 0,
    isActive: true,
  },
];

function application(
  overrides: Partial<VolunteerApplicationDetail> = {},
): VolunteerApplicationDetail {
  return {
    id: 42,
    festivalId: 619,
    fullName: "María Fernanda Quispe Mamani de la Cruz",
    birthdate: "2002-05-03",
    phone: "+591 7123-4567",
    email: "maria.fernanda.quispe.mamani.delacruz@example.com",
    zone: "Sopocachi",
    firstChoiceRoleId: 1,
    secondChoiceRoleId: 2,
    experience: ["events", "own_camera"],
    experienceNotes: "Fotografié dos ferias.",
    portfolio: "https://example.com/portafolio-de-maria-fernanda",
    motivation: "Primera línea\nSegunda línea",
    emergencyContactName: "Rosa Mamani",
    emergencyContactPhone: "71112222",
    referralSource: "instagram",
    consentedAt: new Date("2026-11-02T15:00:00Z"),
    privacyNoticeVersion: "2026-11-v2",
    imageConsent: true,
    status: "pending",
    assignedRoleId: null,
    adminNotes: null,
    availableShiftIds: [11],
    assignedShiftIds: [],
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date("2026-11-02T15:00:00Z"),
    updatedAt: new Date("2026-11-02T15:00:00Z"),
    ...overrides,
  };
}

describe("VolunteerApplicationAnswers", () => {
  it("names the roles, shifts, experience and referral", () => {
    render(
      <VolunteerApplicationAnswers
        application={application()}
        roles={roles}
        shifts={shifts}
      />,
    );
    expect(screen.getByText("Fotografía")).toBeTruthy();
    expect(screen.getByText("Prensa (inactivo)")).toBeTruthy();
    expect(screen.getByText(/Sáb 19 dic · 10:00–14:00/)).toBeTruthy();
    expect(screen.queryByText(/Montaje/)).toBeNull();
    expect(screen.getByText("Eventos")).toBeTruthy();
    expect(screen.getByText("Tiene cámara propia o iPhone")).toBeTruthy();
    expect(screen.getByText("Instagram")).toBeTruthy();
    expect(screen.getByText("Autorizó el uso de su imagen")).toBeTruthy();
    expect(screen.getByText(/aviso de privacidad 2026-11-v2/)).toBeTruthy();
    const motivation = screen.getByText(/Primera línea/);
    expect(motivation.className).toContain("whitespace-pre-line");
    expect(motivation.className).toContain("break-words");
  });

  it("links the portfolio in a new tab", () => {
    render(
      <VolunteerApplicationAnswers
        application={application()}
        roles={roles}
        shifts={shifts}
      />,
    );
    expect(
      screen.getByText("Portafolio, CV o enlace a su trabajo"),
    ).toBeTruthy();
    const link = screen.getByRole("link", {
      name: "https://example.com/portafolio-de-maria-fernanda",
    });
    expect(link.getAttribute("href")).toBe(
      "https://example.com/portafolio-de-maria-fernanda",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.className).toContain("wrap-anywhere");
  });

  it("says when something was left empty", () => {
    render(
      <VolunteerApplicationAnswers
        application={application({
          portfolio: null,
          experience: [],
          experienceNotes: null,
          availableShiftIds: [],
          imageConsent: false,
        })}
        roles={roles}
        shifts={shifts}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("No compartió ninguno")).toBeTruthy();
    expect(screen.getByText("No marcó ninguna")).toBeTruthy();
    expect(screen.getByText("No marcó turnos")).toBeTruthy();
    expect(screen.getByText("No autorizó el uso de su imagen")).toBeTruthy();
  });
});

describe("VolunteerApplicationContact", () => {
  it("links WhatsApp, calls and email for the applicant and the emergency contact", () => {
    render(<VolunteerApplicationContact application={application()} />);
    expect(
      screen
        .getByRole("link", {
          name: "Escribir por WhatsApp a María Fernanda Quispe Mamani de la Cruz",
        })
        .getAttribute("href"),
    ).toBe("https://wa.me/59171234567");
    expect(
      screen
        .getByRole("link", {
          name: "Llamar a María Fernanda Quispe Mamani de la Cruz",
        })
        .getAttribute("href"),
    ).toBe("tel:+59171234567");
    expect(
      screen
        .getByRole("link", { name: "Escribir por WhatsApp a Rosa Mamani" })
        .getAttribute("href"),
    ).toBe("https://wa.me/71112222");
    const email = screen.getByRole("link", {
      name: "maria.fernanda.quispe.mamani.delacruz@example.com",
    });
    expect(email.getAttribute("href")).toBe(
      "mailto:maria.fernanda.quispe.mamani.delacruz@example.com",
    );
    expect(email.className).toContain("wrap-anywhere");
    expect(screen.getByText("Sopocachi")).toBeTruthy();
  });

  it("formats the age on La Paz's calendar", () => {
    const today = DateTime.fromISO("2026-05-02", { zone: "America/La_Paz" });
    expect(formatVolunteerAge("2002-05-03", today)).toBe(
      "23 años · 3 de mayo de 2002",
    );
    expect(formatVolunteerAge("2002-05-03", today.plus({ days: 1 }))).toBe(
      "24 años · 3 de mayo de 2002",
    );
  });
});
