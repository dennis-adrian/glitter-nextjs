import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CoinsIcon, StoreIcon } from "lucide-react";

import AdminReviewQueues from "@/app/components/home/admin-review-queues";

afterEach(cleanup);

const queues = [
  { key: "credits", label: "Recargas de créditos", detail: "Comprobantes por revisar", count: 3, href: "/dashboard/credits/reviews", icon: CoinsIcon },
  { key: "orders", label: "Pagos de la Tiendita", detail: "Comprobantes por verificar", count: 0, href: "/dashboard/store/payments", icon: StoreIcon },
];

describe("AdminReviewQueues", () => {
  it("links each queue to its page with its count, zeros included", () => {
    render(<AdminReviewQueues queues={queues} />);

    const credits = screen.getByRole("link", { name: /Recargas de créditos/ });
    expect(credits.getAttribute("href")).toBe("/dashboard/credits/reviews");
    expect(credits.textContent).toContain("3");
    expect(screen.getByRole("link", { name: /Pagos de la Tiendita/ }).textContent).toContain("0");
    expect(screen.queryByText("Nada por revisar")).toBeNull();
  });

  it("says so when nothing waits anywhere", () => {
    render(
      <AdminReviewQueues queues={queues.map((queue) => ({ ...queue, count: 0 }))} />,
    );

    expect(screen.getByText("Nada por revisar")).toBeTruthy();
  });
});
