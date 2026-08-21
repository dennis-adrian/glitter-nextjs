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
});
