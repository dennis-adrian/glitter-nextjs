// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ComunicadosTabs, {
  comunicadosHref,
  parseComunicadoTab,
} from "@/app/components/comunicados/admin/comunicados-tabs";

describe("parseComunicadoTab", () => {
  it("reads the three tabs and falls back to drafts", () => {
    expect(parseComunicadoTab("scheduled")).toBe("scheduled");
    expect(parseComunicadoTab("sent")).toBe("sent");
    expect(parseComunicadoTab(undefined)).toBe("drafts");
    expect(parseComunicadoTab("borrados")).toBe("drafts");
    expect(parseComunicadoTab(["sent", "drafts"])).toBe("drafts");
  });
});

describe("comunicadosHref", () => {
  it("leaves the defaults out of the URL", () => {
    expect(comunicadosHref("drafts")).toBe("/dashboard/communications");
    expect(comunicadosHref("drafts", 1)).toBe("/dashboard/communications");
    expect(comunicadosHref("drafts", 2)).toBe(
      "/dashboard/communications?page=2",
    );
    expect(comunicadosHref("scheduled")).toBe(
      "/dashboard/communications?tab=scheduled",
    );
  });
});

describe("ComunicadosTabs", () => {
  afterEach(cleanup);

  it("counts drafts and scheduled ones, not sent ones, and marks the current tab", () => {
    render(
      <ComunicadosTabs
        tab="scheduled"
        counts={{ drafts: 2, scheduled: 1, sent: 40 }}
      />,
    );
    const drafts = screen.getByRole("link", { name: "Borradores (2)" });
    const scheduled = screen.getByRole("link", { name: "Programados (1)" });
    const sent = screen.getByRole("link", { name: "Enviados" });

    expect(drafts.getAttribute("href")).toBe("/dashboard/communications");
    expect(drafts.getAttribute("aria-current")).toBeNull();
    expect(scheduled.getAttribute("aria-current")).toBe("page");
    expect(sent.getAttribute("href")).toBe(
      "/dashboard/communications?tab=sent",
    );
  });
});
