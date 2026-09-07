import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";

const baseProps = {
  period: "week" as const,
  dateFrom: "",
  dateTo: "",
  onFromChange: vi.fn(),
  onToChange: vi.fn(),
};

describe("OrdersDateFilter", () => {
  afterEach(cleanup);

  it("does not reset the period when closing draft custom controls", () => {
    const onPeriodChange = vi.fn();
    render(
      <OrdersDateFilter
        {...baseProps}
        hasCustomRange={false}
        onPeriodChange={onPeriodChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));

    expect(onPeriodChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Esta semana" }).className,
    ).toContain("bg-secondary");
  });

  it("clears the period when an applied custom range is dismissed", () => {
    const onPeriodChange = vi.fn();
    render(
      <OrdersDateFilter
        {...baseProps}
        period="custom"
        dateFrom="2026-08-01"
        dateTo="2026-08-15"
        hasCustomRange
        onPeriodChange={onPeriodChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));

    expect(onPeriodChange).toHaveBeenCalledExactlyOnceWith("all");
  });
});
