import { describe, expect, it } from "vitest";

import {
  activeTabKey,
  buildAppNavigation,
  buildPublicNavigation,
  isFocusedFlowPage,
  isNavLinkActive,
  type NavViewer,
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

  it("offers the supplies market only to verified participants", () => {
    expect(
      hrefs(group(buildAppNavigation({ viewer: verified }), "explore")!.items),
    ).toContain("/supplies");
    expect(
      hrefs(group(buildAppNavigation({ viewer: pending }), "explore")!.items),
    ).not.toContain("/supplies");
  });

  it("has no administration group for participants", () => {
    expect(
      group(buildAppNavigation({ viewer: verified }), "admin"),
    ).toBeUndefined();
  });

  it("gives admins the whole dashboard and programs", () => {
    const admin = group(
      buildAppNavigation({ viewer: { role: "admin", status: "verified" } }),
      "admin",
    )!;

    expect(admin.sections?.map((section) => section.label)).toEqual([
      "Dashboard",
      "Programas",
    ]);
    const all = admin.sections!.flatMap((section) => hrefs(section.items));
    expect(all).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/dashboard/emails",
        "/dashboard/feature_flags",
        "/dashboard/programs/check-in",
      ]),
    );
  });

  it("gives festival admins only the pages they may open", () => {
    const festivalAdmin = group(
      buildAppNavigation({
        viewer: { role: "festival_admin", status: "verified" },
      }),
      "admin",
    )!;
    const all = festivalAdmin.sections!.flatMap((section) =>
      hrefs(section.items),
    );

    expect(all).toContain("/dashboard/festivals");
    expect(all).toContain("/dashboard/programs");
    expect(all).not.toContain("/dashboard/emails");
    expect(all).not.toContain("/dashboard/feature_flags");
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
