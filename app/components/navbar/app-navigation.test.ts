import { describe, expect, it } from "vitest";

import {
  activeTabKey,
  buildAppNavigation,
  buildPublicNavigation,
  isFocusedFlowPage,
  isNavLinkActive,
  mostSpecificActiveKey,
  type NavViewer,
  staffMenuSection,
} from "@/app/components/navbar/app-navigation";

const verified: NavViewer = { role: "user", status: "verified" };
const pending: NavViewer = { role: "user", status: "pending" };

function hrefs(links: { href: string }[]) {
  return links.map((link) => link.href);
}

function group(nav: ReturnType<typeof buildAppNavigation>, key: string) {
  return nav.groups.find((entry) => entry.key === key);
}

describe("buildAppNavigation tabs", () => {
  it("gives a verified participant Inicio, Participaciones, Tiendita and Más", () => {
    const { tabs } = buildAppNavigation({ viewer: verified });

    expect(tabs.map((tab) => tab.label)).toEqual([
      "Inicio",
      "Participaciones",
      "Tiendita",
      "Más",
    ]);
    expect(hrefs(tabs)).toEqual([
      "/portal",
      "/my_participations",
      "/merch",
      "/menu",
    ]);
  });

  it("gives anyone not verified the public festival instead of Participaciones", () => {
    for (const status of ["pending", "paused", "rejected", "banned"] as const) {
      const { tabs } = buildAppNavigation({
        viewer: { role: "user", status },
      });
      expect(tabs[1]).toMatchObject({
        label: "Festivales",
        href: "/festivals",
      });
    }
  });

  it("treats a session without a profile yet as not verified", () => {
    const { tabs } = buildAppNavigation({ viewer: null });
    expect(tabs[1]).toMatchObject({ label: "Festivales" });
  });
});

describe("buildAppNavigation groups", () => {
  it("leaves out entries whose flags are off", () => {
    const nav = buildAppNavigation({ viewer: verified });

    expect(hrefs(group(nav, "explore")!.items)).not.toContain("/blog");
    expect(hrefs(group(nav, "mine")!.items)).not.toContain("/my_credits");
    expect(hrefs(group(nav, "mine")!.items)).not.toContain("/my_programs");
  });

  it("adds them once their flags are on", () => {
    const nav = buildAppNavigation({
      viewer: verified,
      blogEnabled: true,
      creditsEnabled: true,
      programsHref: "/programs/glitter-week",
    });

    expect(hrefs(group(nav, "explore")!.items)).toEqual(
      expect.arrayContaining(["/blog", "/programs/glitter-week"]),
    );
    expect(hrefs(group(nav, "mine")!.items)).toEqual(
      expect.arrayContaining(["/my_credits", "/my_programs"]),
    );
  });

  it("keeps credits and history to the profiles their pages let in", () => {
    for (const status of ["verified", "paused"] as const) {
      const nav = buildAppNavigation({
        viewer: { role: "user", status },
        creditsEnabled: true,
      });
      expect(hrefs(group(nav, "mine")!.items)).toEqual(
        expect.arrayContaining(["/my_credits", "/my_history"]),
      );
    }
    for (const status of ["pending", "rejected", "banned"] as const) {
      const nav = buildAppNavigation({
        viewer: { role: "user", status },
        creditsEnabled: true,
      });
      expect(hrefs(group(nav, "mine")!.items)).toEqual([
        "/portal",
        "/my_orders",
      ]);
    }
  });

  it("puts both stores under Tiendita only for verified participants while supplies are open", () => {
    const store = (viewer: typeof verified, suppliesOpen: boolean) =>
      group(
        buildAppNavigation({ viewer, suppliesOpen }),
        "explore",
      )!.items.find((item) => item.key === "store")!;

    expect(hrefs(store(verified, true).children ?? [])).toEqual([
      "/merch",
      "/supplies",
    ]);
    // No separate supplies entry next to Tiendita.
    expect(
      hrefs(
        group(
          buildAppNavigation({ viewer: verified, suppliesOpen: true }),
          "explore",
        )!.items,
      ),
    ).not.toContain("/supplies");
    expect(store(verified, false).children).toBeUndefined();
    expect(store(pending, true).children).toBeUndefined();
  });

  it("gives the Tiendita tab both stores too, so it can ask which one", () => {
    const tab = buildAppNavigation({
      viewer: verified,
      suppliesOpen: true,
    }).tabs.find((entry) => entry.key === "store")!;
    expect(tab.children?.map((child) => child.label)).toEqual([
      "Merch",
      "Mercadito de Insumos",
    ]);
  });

  it("has no administration group for participants", () => {
    expect(
      group(buildAppNavigation({ viewer: verified }), "admin"),
    ).toBeUndefined();
  });

  it("gives admins their own shell: Inicio, the festival, operation, programs and settings", () => {
    const nav = buildAppNavigation({
      viewer: { role: "admin", status: "verified" },
      activeFestival: { id: 9, name: "Festicker 2026", status: "active" },
    });

    expect(nav.tabs.map((tab) => [tab.label, tab.href])).toEqual([
      ["Inicio", "/dashboard"],
      ["Festival", "/dashboard/festival"],
      ["Tienda", "/dashboard/store/analytics"],
      ["Más", "/menu"],
    ]);
    expect(nav.groups.map((entry) => entry.label)).toEqual([
      "",
      "Festival en curso",
      "Operación",
      "Mi cuenta",
    ]);
    // Their own orders stay reachable where there is no "Más" tab.
    expect(hrefs(group(nav, "account")!.items)).toEqual(["/my_orders"]);
    const festival = group(nav, "festival")!.sections![0];
    expect(festival.label).toBe("Festicker 2026");
    expect(festival.defaultOpen).toBe(true);
    // The rail's single festival icon opens the festival, not the list.
    expect(festival.href).toBe("/dashboard/festivals/9");
    expect(hrefs(festival.items).slice(0, 2)).toEqual([
      "/dashboard/festivals",
      "/dashboard/festivals/9/tickets",
    ]);
    const operation = group(nav, "operation")!;
    expect(operation.sections?.map((section) => section.label)).toEqual([
      "Programas",
      "Configuración",
    ]);
    // No participant pages: staff do not take part in festivals.
    expect(nav.groups.flatMap((entry) => hrefs(entry.items))).not.toContain(
      "/my_participations",
    );
  });

  it("keeps the staff Más short: people, two section screens and the account", () => {
    const more = buildAppNavigation({
      viewer: { role: "admin", status: "verified" },
    }).more!;

    expect(more.map((entry) => entry.label)).toEqual([
      "Personas",
      "Más secciones",
      "Mi cuenta",
    ]);
    expect(hrefs(more[1].items)).toEqual([
      "/menu/programas",
      "/menu/configuracion",
    ]);
    expect(more.flatMap((entry) => entry.items).length).toBeLessThanOrEqual(9);
  });

  it("gives festival admins programs instead of the store, and only their pages", () => {
    const nav = buildAppNavigation({
      viewer: { role: "festival_admin", status: "verified" },
    });

    expect(nav.tabs.map((tab) => tab.label)).toEqual([
      "Inicio",
      "Festival",
      "Programas",
      "Más",
    ]);
    const all = [
      ...nav.groups.flatMap((entry) => hrefs(entry.items)),
      ...nav.groups.flatMap((entry) =>
        (entry.sections ?? []).flatMap((section) => hrefs(section.items)),
      ),
    ];
    expect(all).toContain("/dashboard/festivals");
    expect(all).toContain("/dashboard/programs");
    expect(all).not.toContain("/dashboard/emails");
    expect(all).not.toContain("/dashboard/feature_flags");
    expect(all).not.toContain("/dashboard/store/analytics");
  });

  it("gives festival admins every programs page from Más, not only the list", () => {
    const more = buildAppNavigation({
      viewer: { role: "festival_admin", status: "verified" },
    }).more!;

    expect(more.map((entry) => entry.label)).toEqual([
      "Gestión",
      "Más secciones",
      "Mi cuenta",
    ]);
    expect(hrefs(more[1].items)).toEqual(["/menu/programas"]);
    // The screen it opens lists check-in, enrollments and payments.
    expect(
      hrefs(
        staffMenuSection(
          { role: "festival_admin", status: "verified" },
          "programas",
          { paidProgramsEnabled: true },
        )!.items,
      ),
    ).toEqual(
      expect.arrayContaining([
        "/dashboard/programs/check-in",
        "/dashboard/programs/enrollments",
        "/dashboard/programs/purchases",
      ]),
    );
  });

  it("leaves out the pages paid programs bring while the flag is off", () => {
    const paidOnly = [
      "/dashboard/programs/check-in",
      "/dashboard/programs/enrollments",
      "/dashboard/programs/purchases",
    ];
    for (const role of ["admin", "festival_admin"] as const) {
      const viewer = { role, status: "verified" as const };
      const screen = hrefs(staffMenuSection(viewer, "programas")!.items);
      const sidebar = buildAppNavigation({ viewer }).groups.flatMap((group) =>
        (group.sections ?? []).flatMap((section) => hrefs(section.items)),
      );
      for (const href of paidOnly) {
        expect(screen).not.toContain(href);
        expect(sidebar).not.toContain(href);
      }
      expect(screen).toContain("/dashboard/programs");

      const on = buildAppNavigation({ viewer, paidProgramsEnabled: true });
      expect(
        on.groups.flatMap((group) =>
          (group.sections ?? []).flatMap((section) => hrefs(section.items)),
        ),
      ).toEqual(expect.arrayContaining(paidOnly));
    }
  });

  it("opens the staff section screens only for who may see them", () => {
    expect(
      staffMenuSection({ role: "admin", status: "verified" }, "configuracion")
        ?.label,
    ).toBe("Configuración");
    expect(
      staffMenuSection(
        { role: "festival_admin", status: "verified" },
        "configuracion",
      ),
    ).toBeNull();
    expect(
      staffMenuSection(
        { role: "festival_admin", status: "verified" },
        "programas",
      )?.label,
    ).toBe("Programas");
    expect(
      staffMenuSection({ role: "user", status: "verified" }, "programas"),
    ).toBeNull();
  });

  it("lights staff Inicio only on its own page", () => {
    const { tabs } = buildAppNavigation({
      viewer: { role: "admin", status: "verified" },
    });
    expect(activeTabKey(tabs, "/dashboard")).toBe("home");
    expect(activeTabKey(tabs, "/dashboard/store/orders")).toBe("store");
    expect(activeTabKey(tabs, "/dashboard/festivals/9/map")).toBe("festival");
    expect(activeTabKey(tabs, "/dashboard/users")).toBe("more");
  });
});

describe("buildPublicNavigation", () => {
  it("keeps the signed-out site as it was", () => {
    expect(
      buildPublicNavigation({
        blogEnabled: true,
        programsHref: "/programs/x",
      }).map((link) => link.label),
    ).toEqual([
      "Inicio",
      "Próximo Evento",
      "Blog",
      "Tiendita",
      "Charlas y Talleres",
    ]);
  });
});

describe("isNavLinkActive", () => {
  const link = {
    key: "orders",
    label: "Mis pedidos",
    href: "/my_orders",
    icon: () => null,
  };

  it("matches the page and what sits under it", () => {
    expect(isNavLinkActive(link, "/my_orders")).toBe(true);
    expect(isNavLinkActive(link, "/my_orders/12")).toBe(true);
  });

  it("does not match a page that only shares the prefix", () => {
    expect(isNavLinkActive(link, "/my_orders_archive")).toBe(false);
  });

  it("ignores the query string in the href", () => {
    expect(
      isNavLinkActive(
        { ...link, href: "/dashboard/infractions?limit=25&offset=0" },
        "/dashboard/infractions",
      ),
    ).toBe(true);
  });

  it("matches the root only exactly", () => {
    expect(isNavLinkActive({ ...link, href: "/" }, "/merch")).toBe(false);
  });
});

describe("activeTabKey", () => {
  const { tabs } = buildAppNavigation({ viewer: verified });

  it.each([
    ["/", "home"],
    ["/portal", "home"],
    ["/my_participations", "participations"],
    ["/profiles/3/festivals/9/reservations/41", "participations"],
    ["/merch/collections/verano", "store"],
    ["/supplies", "store"],
    ["/menu", "more"],
    ["/my_orders", "more"],
    ["/dashboard/festivals", "more"],
  ])("lights %s as %s", (pathname, key) => {
    expect(activeTabKey(tabs, pathname)).toBe(key);
  });

  it("lights nothing on a page no tab leads to", () => {
    expect(activeTabKey(tabs, "/public_profiles/4")).toBeNull();
  });
});

describe("isFocusedFlowPage", () => {
  it.each([
    "/checkout",
    "/orders/31/payment",
    "/profiles/3/orders/7/pay",
    "/profiles/3/festivals/9/reservations/41/payments",
    "/profiles/3/festivals/9/reservations/new",
    "/profiles/3/festivals/9/reservations/new/sectors/2",
  ])("treats %s as a focused step", (pathname) => {
    expect(isFocusedFlowPage(pathname)).toBe(true);
  });

  it.each(["/portal", "/merch", "/my_orders", "/orders/31"])(
    "keeps the tab bar on %s",
    (pathname) => {
      expect(isFocusedFlowPage(pathname)).toBe(false);
    },
  );
});

describe("mostSpecificActiveKey", () => {
  it("lights only the closest of nested entries", () => {
    const links = [
      {
        key: "tickets",
        label: "Entradas",
        href: "/dashboard/festivals/9/tickets",
        icon: () => null,
      },
      {
        key: "verification",
        label: "Verificar entradas",
        href: "/dashboard/festivals/9/tickets/verification",
        icon: () => null,
      },
    ] as unknown as Parameters<typeof mostSpecificActiveKey>[0];

    expect(
      mostSpecificActiveKey(
        links,
        "/dashboard/festivals/9/tickets/verification",
      ),
    ).toBe("verification");
    expect(mostSpecificActiveKey(links, "/dashboard/festivals/9/tickets")).toBe(
      "tickets",
    );
    expect(
      mostSpecificActiveKey(links, "/dashboard/festivals/9/map"),
    ).toBeNull();
  });
});
