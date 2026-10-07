import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RegistrationInvitationEmailTemplate, {
  registrationInvitationSubject,
} from "@/app/emails/registration-invitation";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { GLITTER_EMAIL_LOGO_URL } from "@/app/lib/constants";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

function festival(overrides: Partial<FestivalWithDates> = {}) {
  return {
    id: 12,
    name: "Glitter 6ta Edición",
    festivalType: "glitter",
    posterUrl: "https://cdn.test/poster.png",
    festivalBannerUrl: null,
    thumbnailUrl: null,
    locationLabel: "Teatro CBA",
    address: "Calle Sucre #364",
    locationUrl: "https://maps.test/cba",
    festivalDates: [
      {
        id: 1,
        startDate: new Date("2026-11-14T14:00:00.000Z"),
        endDate: new Date("2026-11-15T00:00:00.000Z"),
      },
      {
        id: 2,
        startDate: new Date("2026-11-15T14:00:00.000Z"),
        endDate: new Date("2026-11-15T23:00:00.000Z"),
      },
    ],
    ...overrides,
  } as FestivalWithDates;
}

function html(props: Partial<FestivalWithDates> = {}, visitorName?: string) {
  return renderToStaticMarkup(
    RegistrationInvitationEmailTemplate({
      festival: festival(props),
      visitorName,
    }),
  );
}

describe("registration invitation email", () => {
  it("leads with the festival's poster instead of the brand banner", () => {
    const body = html();
    expect(body).toContain('src="https://cdn.test/poster.png"');
    // A pixel width: Outlook ignores CSS widths on images.
    expect(body).toMatch(
      /<img[^>]*width="480"[^>]*poster\.png|<img[^>]*poster\.png[^>]*width="480"/,
    );
    expect(body).not.toContain(GLITTER_EMAIL_LOGO_URL);
  });

  it("falls back to the logo banner when the festival has no artwork", () => {
    const body = html({ posterUrl: null });
    expect(body).toContain(GLITTER_EMAIL_LOGO_URL);
  });

  it("serves an artwork path from our own site as an absolute URL", () => {
    expect(html({ posterUrl: "/img/poster.png" })).toContain(
      `src="${BASE_URL}/img/poster.png"`,
    );
  });

  it("sends every link to the tagged registration page", () => {
    const body = html();
    const link = `${BASE_URL}/festivals/12/registration?utm_source=glitter_email&amp;utm_medium=email&amp;utm_campaign=registration_invitation&amp;utm_content=festival_12`;
    // Both buttons and the poster.
    expect(body.split(`href="${link}"`).length - 1).toBe(3);
  });

  it("lists each day with its hours, and where", () => {
    const body = html();
    expect(body).toContain("Sábado, 14 de noviembre · 10:00 AM a 8:00 PM");
    expect(body).toContain("Domingo, 15 de noviembre · 10:00 AM a 7:00 PM");
    expect(body).toContain("Teatro CBA · Calle Sucre #364");
    expect(body).toContain('href="https://maps.test/cba"');
  });

  it("invites rather than promising a shorter queue", () => {
    const body = html();
    expect(body).toContain("Te invitamos a");
    expect(body).not.toMatch(/fila|cola/i);
  });

  it("promises gifts to the first to arrive, without a number", () => {
    expect(html()).toContain(
      "Tenemos regalos para las primeras personas en llegar cada día.",
    );
    expect(
      html({ festivalDates: festival().festivalDates.slice(0, 1) }),
    ).toContain("Tenemos regalos para las primeras personas en llegar.");
    expect(html()).not.toMatch(/\b200\b/);
  });

  it("greets the visitor only when there is a name", () => {
    expect(html({}, "Camila")).toContain("¡Hola, Camila!");
    expect(html()).not.toContain("¡Hola");
  });

  it("names the festival in the subject", () => {
    expect(registrationInvitationSubject({ name: "Glitter 6ta Edición" })).toBe(
      "Te invitamos a Glitter 6ta Edición",
    );
  });
});
