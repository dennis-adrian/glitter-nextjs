// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CredentialsHeader from "@/app/components/festivals/credentials/credentials-header";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { emptyData } from "@/app/lib/credentials/__fixtures__/data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));
vi.mock("@/app/components/navbar/page-breadcrumbs", () => ({ default: () => null }));

afterEach(cleanup);

describe("CredentialsHeader", () => {
  it("marks the title for the installed app and links the export with the filters", () => {
    renderWithCredentials(<CredentialsHeader />, {
      data: emptyData(),
      filters: {
        statuses: { verification_payment: true, pending: false },
        groups: { external: true, volunteer: true, staff: true },
      },
    });
    const title = screen.getByRole("heading", { level: 1, name: "Credenciales" });
    expect(title.hasAttribute("data-installed-title")).toBe(true);
    expect(screen.getByRole("link", { name: "Exportar CSV" }).getAttribute("href")).toBe(
      "/dashboard/festivals/1/credentials/export?estados=verificacion",
    );
  });
});
