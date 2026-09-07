import { describe, expect, it } from "vitest";

import { needsAttentionOrdersHref } from "@/app/components/organisms/orders/stats-cards";

describe("needsAttentionOrdersHref", () => {
  it("keeps the selected period on the orders drill-down", () => {
    expect(
      needsAttentionOrdersHref({
        category: "all",
        period: "month",
      }),
    ).toBe("/dashboard/store/orders?status=needs_attention&period=month");
  });

  it("carries a custom range and category scope", () => {
    expect(
      needsAttentionOrdersHref({
        category: "supplies",
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-15",
      }),
    ).toBe(
      "/dashboard/store/orders?status=needs_attention&period=custom&from=2026-08-01&to=2026-08-15&category=supplies",
    );
  });
});
