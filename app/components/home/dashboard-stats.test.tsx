import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import DashboardStats from "@/app/components/home/dashboard-stats";
import { buildDashboardStats } from "@/app/lib/home/dashboard";

afterEach(cleanup);

describe("DashboardStats", () => {
  const stats = buildDashboardStats({
    creditBalance: 240,
    orderCounts: { pending: 1 },
    upcomingPurchases: 1,
    nextFestival: { name: "Festicker 2026", daysLeft: 21 },
  });

  it("links every tile to its page", () => {
    render(<DashboardStats stats={stats} />);

    expect(
      screen.getByRole("link", { name: /Créditos/ }).getAttribute("href"),
    ).toBe("/my_credits");
    expect(
      screen.getByRole("link", { name: /Pedidos/ }).getAttribute("href"),
    ).toBe("/my_orders");
  });

  it("lays phones out in three columns and desktops in four", () => {
    render(<DashboardStats stats={stats} />);

    const list = screen.getByRole("list", { name: "Resumen" });
    expect(list.classList.contains("grid-cols-3")).toBe(true);
    expect(list.classList.contains("lg:grid-cols-4")).toBe(true);
    const festival = screen
      .getByRole("link", { name: /Próximo evento/ })
      .closest("li");
    expect(festival?.classList.contains("hidden")).toBe(true);
  });
});
