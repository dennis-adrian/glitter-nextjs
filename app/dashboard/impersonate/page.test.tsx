import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireAdminMock, searchMock, recentMock, notFoundMock } = vi.hoisted(
  () => ({
    requireAdminMock: vi.fn(),
    searchMock: vi.fn(),
    recentMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  usePathname: () => "/dashboard/impersonate",
}));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/app/lib/impersonation/queries", () => ({
  searchImpersonationCandidates: searchMock,
  listRecentImpersonations: recentMock,
}));
vi.mock("@/app/components/navbar/page-breadcrumbs", () => ({
  default: () => null,
}));
vi.mock("@/app/components/impersonation/enter-as-button", () => ({
  default: ({
    person,
    returnTo,
  }: {
    person: { name: string };
    returnTo: string;
  }) => <button data-return-to={returnTo}>Entrar {person.name}</button>,
}));

import ImpersonatePage from "@/app/dashboard/impersonate/page";

async function renderPage(q?: string) {
  const element = await ImpersonatePage({
    searchParams: Promise.resolve(q === undefined ? {} : { q }),
  });
  return render(element);
}

beforeEach(() => {
  requireAdminMock.mockReset();
  searchMock.mockReset();
  recentMock.mockReset();
  requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
  searchMock.mockResolvedValue([]);
  recentMock.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("/dashboard/impersonate", () => {
  it("does not exist for anyone but a global admin", async () => {
    requireAdminMock.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(searchMock).not.toHaveBeenCalled();
    expect(recentMock).not.toHaveBeenCalled();
  });

  it("opens on the search and the admin's recent views, searching nobody", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Entrar como participante",
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar por nombre o correo" }),
    ).toBeTruthy();
    expect(searchMock).not.toHaveBeenCalled();
    expect(recentMock).toHaveBeenCalledWith({ adminUserId: 1 }, 10);
    expect(
      screen.getByText("Todavía no entraste como ningún participante."),
    ).toBeTruthy();
  });

  it("lists the participants found, each with a way in that comes back here", async () => {
    searchMock.mockResolvedValue([
      {
        id: 2,
        displayName: "Ana Pérez",
        firstName: "Ana",
        lastName: "Pérez",
        email: "ana@example.com",
        imageUrl: null,
        status: "banned",
        category: "illustration",
      },
    ]);
    await renderPage("  ana  ");
    expect(searchMock).toHaveBeenCalledWith("ana");
    const results = screen.getByRole("region", { name: "Resultados" });
    expect(
      within(results).getByText("ana@example.com · Deshabilitado"),
    ).toBeTruthy();
    expect(
      within(results)
        .getByRole("button", { name: "Entrar Ana Pérez" })
        .getAttribute("data-return-to"),
    ).toBe("/dashboard/impersonate?q=ana");
  });

  it("says when nobody matched", async () => {
    await renderPage("zzz");
    expect(
      screen.getByText("No encontramos participantes con “zzz”."),
    ).toBeTruthy();
  });

  it("keeps a very long query to a sane length", async () => {
    await renderPage("a".repeat(500));
    expect(searchMock.mock.calls[0]?.[0]).toHaveLength(120);
  });
});
