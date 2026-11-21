// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import VolunteerApplicationAnswers from "@/app/components/volunteers/admin/volunteer-application-answers";
import VolunteerApplicationContact, {
  formatVolunteerBirthdate,
} from "@/app/components/volunteers/admin/volunteer-application-contact";
import type { VolunteerApplicationDetail } from "@/app/lib/volunteers/admin-definitions";

afterEach(cleanup);

const roles = [
  {
    id: 1,
    name: "Fotografía",
    description: "",
    sortOrder: 0,
    isActive: true,
    choiceCount: 1,
  },
  {
    id: 2,
    name: "Prensa",
    description: "",
    sortOrder: 1,
    isActive: false,
    choiceCount: 1,
  },
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
  it("shows the roles, marked shifts, experience and motivation", () => {
    render(
      <VolunteerApplicationAnswers
        application={application()}
        roles={roles}
        shifts={shifts}
      />,
    );
    expect(screen.getByText("1ª Fotografía")).toBeTruthy();
    expect(screen.getByText("2ª Prensa (inactivo)")).toBeTruthy();
    expect(screen.getByText("Turnos disponibles (1 de 2)")).toBeTruthy();
    expect(screen.getByText("Sáb 19 dic · 10:00–14:00")).toBeTruthy();
    expect(screen.queryByText(/Montaje/)).toBeNull();
    expect(screen.getByText("Eventos")).toBeTruthy();
    expect(screen.getByText("Tiene cámara propia o iPhone")).toBeTruthy();
    expect(screen.getByText("Fotografié dos ferias.")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "¿Por qué quiere ser voluntario/a?",
      }),
    ).toBeTruthy();
    const motivation = screen.getByText(/Primera línea/);
    expect(motivation.className).toContain("whitespace-pre-line");
    expect(motivation.className).toContain("break-words");
  });

  it("says when something was left empty", () => {
    render(
      <VolunteerApplicationAnswers
        application={application({
          experience: [],
          experienceNotes: null,
          availableShiftIds: [],
        })}
        roles={roles}
        shifts={shifts}
      />,
    );
    expect(screen.getByText("Turnos disponibles (0 de 2)")).toBeTruthy();
    expect(screen.getByText("No marcó ninguna.")).toBeTruthy();
    expect(screen.getByText("No marcó turnos.")).toBeTruthy();
  });

  it("counts only active shifts, but still lists a deactivated one", () => {
    render(
      <VolunteerApplicationAnswers
        application={application({ availableShiftIds: [10, 11] })}
        roles={roles}
        shifts={[shifts[0]!, { ...shifts[1]!, isActive: false }]}
      />,
    );
    expect(screen.getByText("Turnos disponibles (1 de 1)")).toBeTruthy();
    expect(screen.getByText(/Montaje/)).toBeTruthy();
    expect(screen.getByText(/Puerta/).textContent).toContain("(inactivo)");
  });
});

describe("VolunteerApplicationContact", () => {
  const today = new Date("2026-11-21T16:00:00Z");

  it("links WhatsApp, calls and email for the applicant and the emergency contact", () => {
    render(
      <VolunteerApplicationContact application={application()} today={today} />,
    );
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
    expect(screen.getByText("03/05/2002 · 24 años")).toBeTruthy();
    expect(screen.getByText("Autorizó")).toBeTruthy();
    expect(screen.getByText(/aviso de privacidad 2026-11-v2/)).toBeTruthy();
  });

  it("links the portfolio in a new tab", () => {
    render(
      <VolunteerApplicationContact application={application()} today={today} />,
    );
    expect(
      screen.getByText("Portafolio, CV o enlace a su trabajo"),
    ).toBeTruthy();
    const link = screen.getByRole("link", {
      name: "https://example.com/portafolio-de-maria-fernanda",
    });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.className).toContain("wrap-anywhere");
  });

  it("shows a dash without a portfolio, and a refused image consent", () => {
    render(
      <VolunteerApplicationContact
        application={application({ portfolio: null, imageConsent: false })}
        today={today}
      />,
    );
    expect(screen.queryByRole("link", { name: /portafolio/ })).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("No autorizó")).toBeTruthy();
  });

  it("counts the age on La Paz's calendar", () => {
    // La Paz is UTC-4: 03:59Z is still 2 May there, 04:30Z is 3 May.
    expect(
      formatVolunteerBirthdate("2002-05-03", new Date("2026-05-03T03:59:00Z")),
    ).toBe("03/05/2002 · 23 años");
    expect(
      formatVolunteerBirthdate("2002-05-03", new Date("2026-05-03T04:30:00Z")),
    ).toBe("03/05/2002 · 24 años");
    expect(formatVolunteerBirthdate("bad")).toBe("bad");
  });
});
