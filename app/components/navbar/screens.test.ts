import { describe, expect, it } from "vitest";

import {
  buildAppNavigation,
  buildPublicNavigation,
  type NavViewer,
} from "@/app/components/navbar/app-navigation";
import {
  breadcrumbTrail,
  isTabRoot,
  resolveScreen,
  SCREENS,
  type ScreenContext,
} from "@/app/components/navbar/screens";

const verified: NavViewer = { role: "user", status: "verified" };
const pending: NavViewer = { role: "user", status: "pending" };
const admin: NavViewer = { role: "admin", status: "verified" };
const festivalAdmin: NavViewer = { role: "festival_admin", status: "verified" };

function ctx(
  viewer: NavViewer | null,
  activeFestival: { id: number } | null = null,
): ScreenContext {
  return {
    viewer,
    tabs: buildAppNavigation({ viewer, suppliesOpen: true }).tabs,
    activeFestival,
  };
}

describe("resolveScreen", () => {
  it("leaves every tab's own page to the regular header", () => {
    for (const path of [
      "/portal",
      "/my_participations",
      "/merch",
      "/supplies",
      "/menu",
      "/",
    ]) {
      expect(resolveScreen(path, ctx(verified))).toBeNull();
    }
    for (const path of [
      "/dashboard",
      "/dashboard/store/analytics",
      "/dashboard/store/orders",
      "/menu",
    ]) {
      expect(resolveScreen(path, ctx(admin))).toBeNull();
    }
    expect(resolveScreen("/dashboard/programs", ctx(festivalAdmin))).toBeNull();
  });

  it("shows nothing to someone signed out", () => {
    expect(resolveScreen("/my_orders", ctx(null))).toBeNull();
  });

  it("titles a deeper screen and names the screen above it", () => {
    expect(resolveScreen("/my_orders", ctx(verified))).toMatchObject({
      title: "Mis pedidos",
      parentHref: "/menu",
      close: false,
    });
    expect(
      resolveScreen("/profiles/3/orders/1043", ctx(verified)),
    ).toMatchObject({
      title: "Pedido",
      parentHref: "/my_orders",
    });
    expect(
      resolveScreen("/my_participations/team", ctx(verified)),
    ).toMatchObject({
      title: "Equipo",
      parentHref: "/my_participations",
    });
  });

  it("fills a parent from the path's own segments", () => {
    expect(
      resolveScreen(
        "/dashboard/festivals/9/festival_activities/4/results",
        ctx(admin, { id: 9 }),
      ),
    ).toMatchObject({
      title: "Resultados",
      parentHref: "/dashboard/festivals/9/festival_activities/4",
    });
    expect(
      resolveScreen(
        "/profiles/3/festivals/9/reservations/12/payments",
        ctx(verified),
      ),
    ).toMatchObject({
      parentHref: "/profiles/3/festivals/9/reservations/12",
      close: true,
    });
  });

  it("reads a literal segment before a parameter", () => {
    expect(
      resolveScreen("/dashboard/programs/check-in", ctx(admin))?.title,
    ).toBe("Registrar ingresos");
    expect(resolveScreen("/dashboard/programs/27", ctx(admin))?.title).toBe(
      "Programa",
    );
    expect(
      resolveScreen("/dashboard/infractions/types", ctx(admin))?.title,
    ).toBe("Tipos de infracción");
  });

  it("sends each role back to where it reached the page from", () => {
    expect(
      resolveScreen("/dashboard/programs/check-in", ctx(admin))?.parentHref,
    ).toBe("/menu/programas");
    expect(
      resolveScreen("/dashboard/programs/check-in", ctx(festivalAdmin))
        ?.parentHref,
    ).toBe("/dashboard/programs");
    expect(resolveScreen("/dashboard/banners", ctx(admin))?.parentHref).toBe(
      "/menu/configuracion",
    );
    expect(
      resolveScreen("/dashboard/banners", ctx(festivalAdmin))?.parentHref,
    ).toBe("/menu");
  });

  it("treats the festival in progress as the staff Festival tab's own page", () => {
    expect(
      resolveScreen("/dashboard/festivals/9", ctx(admin, { id: 9 })),
    ).toBeNull();
    expect(
      resolveScreen("/dashboard/festivals/9/tickets", ctx(admin, { id: 9 })),
    ).toMatchObject({
      title: "Entradas",
      parentHref: "/dashboard/festivals/9",
    });
    // Another edition hangs from the list, and the list from the festival.
    expect(
      resolveScreen("/dashboard/festivals/4", ctx(admin, { id: 9 }))
        ?.parentHref,
    ).toBe("/dashboard/festivals");
    expect(
      resolveScreen("/dashboard/festivals", ctx(admin, { id: 9 }))?.parentHref,
    ).toBe("/dashboard/festivals/9");
    // With none in progress, the list is the tab's own page.
    expect(resolveScreen("/dashboard/festivals", ctx(admin, null))).toBeNull();
  });

  it("treats the festival in progress as Festivales' own page for unverified profiles", () => {
    expect(resolveScreen("/festivals/9", ctx(pending, { id: 9 }))).toBeNull();
    expect(
      resolveScreen("/festivals/9/map", ctx(pending, { id: 9 }))?.parentHref,
    ).toBe("/festivals/9");
    // Verified participants reach it from Participaciones.
    expect(
      resolveScreen("/festivals/9", ctx(verified, { id: 9 }))?.parentHref,
    ).toBe("/my_participations");
  });

  it("never names a parent that would lead straight back to the same page", () => {
    for (const pattern of Object.keys(SCREENS)) {
      const path = pattern.replace(/\[[^\]]+\]/g, "7");
      for (const viewer of [verified, pending, admin, festivalAdmin]) {
        const screen = resolveScreen(path, ctx(viewer, { id: 7 }));
        if (screen) expect(screen.parentHref).not.toBe(path);
      }
    }
  });

  it("marks a flow's first step and the pages that must not go back into a step", () => {
    expect(resolveScreen("/checkout", ctx(verified))).toMatchObject({
      close: true,
    });
    expect(
      resolveScreen("/profiles/3/invoices/8/success", ctx(verified)),
    ).toMatchObject({ toParent: true, parentHref: "/my_participations" });
  });

  it("gives an unlisted page the nearest page above it that has a place", () => {
    expect(
      resolveScreen("/my_orders/archive/2024", ctx(verified)),
    ).toMatchObject({
      title: "",
      parentHref: "/my_orders",
    });
    expect(resolveScreen("/somewhere/else", ctx(verified))?.parentHref).toBe(
      "/portal",
    );
  });

  it("ignores a query string and a trailing slash", () => {
    expect(resolveScreen("/my_orders/?page=2", ctx(verified))?.title).toBe(
      "Mis pedidos",
    );
    expect(isTabRoot("/menu/", ctx(verified))).toBe(true);
  });
});

describe("breadcrumbTrail", () => {
  const labelsOf = (trail: { label: string }[]) => trail.map((c) => c.label);

  it("runs from the section down to the page, never from Más", () => {
    expect(breadcrumbTrail("/profiles/3/orders/1043", ctx(verified))).toEqual([
      { label: "Mis pedidos", href: "/my_orders" },
      { label: "Pedido", href: "/profiles/3/orders/1043" },
    ]);
  });

  it("takes the names that depend on data, and the page's own", () => {
    const trail = breadcrumbTrail(
      "/dashboard/festivals/9/festival_activities/4/results",
      ctx(admin, { id: 9 }),
      {
        labels: {
          "/dashboard/festivals/9": "Festicker 2026",
          "/dashboard/festivals/9/festival_activities/4": "Pasaporte",
        },
        current: "Resultados — Pasaporte",
      },
    );
    expect(labelsOf(trail)).toEqual([
      "Festicker 2026",
      "Actividades",
      "Pasaporte",
      "Resultados — Pasaporte",
    ]);
    expect(trail[0].href).toBe("/dashboard/festivals/9");
  });

  it("follows each role's own way in", () => {
    const trailOf = (viewer: NavViewer) =>
      breadcrumbTrail("/dashboard/programs/check-in", ctx(viewer)).map((c) => [
        c.label,
        c.href,
      ]);
    // Admins reach programs from their own screen in Más...
    expect(trailOf(admin)).toEqual([
      ["Programas", "/menu/programas"],
      ["Registrar ingresos", "/dashboard/programs/check-in"],
    ]);
    // ...festival admins from their Programas tab.
    expect(trailOf(festivalAdmin)).toEqual([
      ["Programas", "/dashboard/programs"],
      ["Registrar ingresos", "/dashboard/programs/check-in"],
    ]);
  });

  it("shows nothing on a page right below Más", () => {
    expect(breadcrumbTrail("/my_orders", ctx(verified))).toEqual([
      { label: "Mis pedidos", href: "/my_orders" },
    ]);
  });

  it("works for someone signed out, from the public site's pages", () => {
    const visitor: ScreenContext = {
      viewer: null,
      tabs: buildPublicNavigation({}),
      activeFestival: null,
    };
    expect(
      breadcrumbTrail("/festivals/9/map", visitor, {
        labels: { "/festivals/9": "Festicker 2026" },
      }),
    ).toEqual([
      { label: "Inicio", href: "/" },
      { label: "Festicker 2026", href: "/festivals/9" },
      { label: "Mapa", href: "/festivals/9/map" },
    ]);
  });

  it("follows a parent the page gives, then that parent's own place", () => {
    expect(
      breadcrumbTrail("/dashboard/reservations/5/edit", ctx(admin, { id: 9 }), {
        parentHref: "/dashboard/festivals/9/reservations",
        labels: { "/dashboard/festivals/9": "Festicker 2026" },
      }).map((c) => c.label),
    ).toEqual(["Festicker 2026", "Reservas y cobros", "Editar reserva"]);
  });

  it("follows where a level above sits when its path cannot say", () => {
    expect(
      breadcrumbTrail(
        "/dashboard/programs/occurrences/12/check-in",
        ctx(festivalAdmin),
        {
          current: "Registrar ingresos",
          parents: {
            "/dashboard/programs/occurrences/12":
              "/dashboard/programs/3/sessions/8",
          },
          labels: {
            "/dashboard/programs/occurrences/12": "14 nov 2026, 10:00",
            "/dashboard/programs/3/sessions/8": "Taller de risografía",
            "/dashboard/programs/3": "Glitter Week",
          },
        },
      ).map((c) => c.label),
    ).toEqual([
      "Programas",
      "Glitter Week",
      "Taller de risografía",
      "14 nov 2026, 10:00",
      "Registrar ingresos",
    ]);
  });

  it("is empty on a tab's own page", () => {
    expect(breadcrumbTrail("/my_participations", ctx(verified))).toEqual([]);
  });
});
