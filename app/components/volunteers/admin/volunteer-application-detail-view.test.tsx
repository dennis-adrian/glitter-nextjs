// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  saveVolunteerReview: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/festivals/619/volunteers/42",
}));

import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import {
  ScreenBarProvider,
  ScreenTitle,
  usePublishScreenContext,
} from "@/app/components/navbar/screen-bar";
import VolunteerApplicationDetailView, {
  formatAppliedOn,
  volunteerDetailMeta,
} from "@/app/components/volunteers/admin/volunteer-application-detail-view";
import type { VolunteerApplicationDetail } from "@/app/lib/volunteers/admin-definitions";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const viewer = { role: "admin", status: "verified" } as const;

/** The navbar's published context, which PageBreadcrumbs reads. */
function Navbar() {
  usePublishScreenContext({
    viewer,
    tabs: buildAppNavigation({ viewer }).tabs,
    activeFestival: null,
  });
  return null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TODAY = new Date("2026-11-21T16:00:00Z");

const application: VolunteerApplicationDetail = {
  id: 42,
  festivalId: 619,
  fullName: "María Fernanda Quispe Mamani de la Cruz",
  birthdate: "2004-05-12",
  phone: "+591 70000001",
  email: "maria@example.com",
  zone: "Sopocachi",
  firstChoiceRoleId: 1,
  secondChoiceRoleId: 1,
  experience: [],
  experienceNotes: null,
  portfolio: null,
  motivation: "Quiero ayudar.",
  emergencyContactName: "Rosa Mamani",
  emergencyContactPhone: "71112222",
  referralSource: "instagram",
  consentedAt: new Date("2026-11-21T15:00:00Z"),
  privacyNoticeVersion: "2026-11-v2",
  imageConsent: true,
  status: "pending",
  assignedRoleId: null,
  adminNotes: null,
  availableShiftIds: [],
  assignedShiftIds: [],
  reviewedBy: null,
  reviewedAt: null,
  // 21 Nov, 23:30 in La Paz: still the 21st there, the 22nd in UTC.
  createdAt: new Date("2026-11-22T03:30:00Z"),
  updatedAt: new Date("2026-11-22T03:30:00Z"),
};

describe("volunteerDetailMeta", () => {
  it("joins age, zone and referral, skipping a missing zone", () => {
    expect(volunteerDetailMeta(application, TODAY)).toBe(
      "22 años · Zona Sopocachi · Se enteró por Instagram",
    );
    expect(volunteerDetailMeta({ ...application, zone: null }, TODAY)).toBe(
      "22 años · Se enteró por Instagram",
    );
  });

  it("dates the application on La Paz's calendar", () => {
    expect(formatAppliedOn(application.createdAt)).toBe("21 nov");
  });
});

describe("VolunteerApplicationDetailView", () => {
  it("renders the header, the back link and the three cards", () => {
    render(
      <ScreenBarProvider>
        <Navbar />
        <ScreenTitle title={application.fullName} />
        <VolunteerApplicationDetailView
          festivalId={619}
          festivalName="Glitter v11"
          application={application}
          roles={[
            {
              id: 1,
              name: "Montaje",
              description: "",
              sortOrder: 1,
              isActive: true,
              choiceCount: 1,
            },
          ]}
          shifts={[]}
          today={TODAY}
        />
      </ScreenBarProvider>,
    );
    const trail = screen.getByRole("navigation", { name: "Ruta" });
    expect(trail.hasAttribute("data-installed-hidden")).toBe(true);
    // The phone's single link up, then the desktop trail.
    const [back] = within(trail).getAllByRole("link", { name: "Voluntarios" });
    expect(back.getAttribute("href")).toBe(
      "/dashboard/festivals/619/volunteers",
    );
    const title = screen.getByRole("heading", {
      level: 1,
      name: application.fullName,
    });
    expect(title.hasAttribute("data-installed-title")).toBe(true);
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
    expect(screen.getByText("Postuló el 21 nov")).toBeTruthy();
    const whatsapp = screen.getByRole("link", {
      name: "Escribir por WhatsApp",
    });
    expect(whatsapp.getAttribute("href")).toBe("https://wa.me/59170000001");
    expect(whatsapp.getAttribute("target")).toBe("_blank");
    for (const name of ["Contacto", "Lo que eligió", "Decisión y asignación"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
    expect(
      screen.getByText(
        "La persona no recibe aviso automático: escribile por WhatsApp.",
      ),
    ).toBeTruthy();
  });
});
