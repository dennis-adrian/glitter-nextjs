import { expect, test } from "playwright/test";

const hasAdminSession = Boolean(process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE);

test.describe("store administration responsive layout", () => {
  test.skip(
    !hasAdminSession,
    "Set PLAYWRIGHT_ADMIN_STORAGE_STATE to an authenticated admin session.",
  );

  for (const viewport of [
    { name: "mobile", width: 320, height: 720, expectedView: "card" },
    { name: "tablet", width: 785, height: 900, expectedView: "card" },
    { name: "desktop", width: 1280, height: 900, expectedView: "table" },
  ] as const) {
    test(`${viewport.name} uses the correct orders view without page overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/dashboard/store/orders?status=all&period=all");

      const cardView = page.getByTestId("orders-card-view");
      const tableView = page.getByTestId("orders-table-view");
      await expect(
        viewport.expectedView === "card" ? cardView : tableView,
      ).toBeVisible();
      await expect(
        viewport.expectedView === "card" ? tableView : cardView,
      ).toBeHidden();

      const horizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
    });
  }

  test("order filters remain canonical after reload", async ({ page }) => {
    await page.goto(
      "/dashboard/store/orders?status=paid&rental=has_rental&period=custom&from=2026-08-01&to=2026-08-31&q=Antonieta&view=compact",
    );
    await page.reload();

    await expect(page).toHaveURL(/status=paid/);
    await expect(page).toHaveURL(/rental=has_rental/);
    await expect(page).toHaveURL(/from=2026-08-01/);
    await expect(page).toHaveURL(/to=2026-08-31/);
    await expect(page).toHaveURL(/q=Antonieta/);
  });

  test("profitability report stays within a mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/dashboard/store/analytics?period=month");

    await expect(
      page.getByRole("heading", { name: "Rentabilidad de pedidos" }),
    ).toBeVisible();
    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  });

  for (const viewport of [
    { name: "mobile", width: 320, height: 720 },
    { name: "tablet", width: 785, height: 900 },
    { name: "desktop", width: 1280, height: 900 },
  ] as const) {
    test(`category switcher is usable at ${viewport.name} width`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/dashboard/store/orders?status=all&period=all");

      const scopeGroup = page.getByRole("group", {
        name: "Categoría de tienda",
      });
      await expect(scopeGroup).toBeVisible();
      await expect(
        scopeGroup.getByRole("button", { name: "Todos" }),
      ).toHaveAttribute("aria-pressed", "true");

      await scopeGroup
        .getByRole("button", { name: "Mercadito de Insumos" })
        .click();
      await expect(page).toHaveURL(/category=supplies/);
      await expect(
        scopeGroup.getByRole("button", { name: "Mercadito de Insumos" }),
      ).toHaveAttribute("aria-pressed", "true");

      const horizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
    });
  }

  test("category scope survives reload and history", async ({ page }) => {
    await page.goto("/dashboard/store/orders?status=all&period=all");
    await page
      .getByRole("group", { name: "Categoría de tienda" })
      .getByRole("button", { name: "Tiendita" })
      .click();
    await expect(page).toHaveURL(/category=merch/);

    await page.reload();
    await expect(page).toHaveURL(/category=merch/);

    await page.goBack();
    await expect(page).not.toHaveURL(/category=merch/);
    await page.goForward();
    await expect(page).toHaveURL(/category=merch/);
  });

  test("category scope keeps other order filters and follows store navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      "/dashboard/store/orders?statuses=paid&rental=has_rental&period=custom&from=2026-08-01&to=2026-08-31&q=Antonieta&view=compact",
    );

    await page
      .getByRole("group", { name: "Categoría de tienda" })
      .getByRole("button", { name: "Mercadito de Insumos" })
      .click();

    await expect(page).toHaveURL(/category=supplies/);
    await expect(page).toHaveURL(/statuses=paid/);
    await expect(page).toHaveURL(/rental=has_rental/);
    await expect(page).toHaveURL(/from=2026-08-01/);
    await expect(page).toHaveURL(/to=2026-08-31/);
    await expect(page).toHaveURL(/q=Antonieta/);

    // Page-specific filters are dropped between sections; the scope is not.
    await page.getByRole("link", { name: "Productos" }).click();
    await expect(page).toHaveURL(/\/dashboard\/store\/products\?category=supplies$/);
  });
});
