import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FestivalNavMapLegend from "@/app/components/maps/festival-nav/festival-nav-map-legend";
import { EMPTY_STAND_FILTERS } from "@/app/lib/maps/stand-filters";

afterEach(cleanup);

describe("FestivalNavMapLegend", () => {
  it("shows only marker activities configured for the festival", () => {
    const { container } = render(
      <FestivalNavMapLegend activityTypes={["stamp_passport"]} />,
    );

    expect(container.textContent).toContain("Ocupado");
    expect(container.textContent).toContain("Carrera de sellos");
    expect(container.textContent).toContain("Disponible");
    expect(container.textContent).not.toContain("En cuponera");
    expect(container.textContent).not.toContain("Cacería de stickers");
    expect(container.textContent).not.toContain("Color del stand");
    expect(container.textContent).not.toContain("Insignias sobre el stand");
    expect(
      container.querySelector('[aria-label="Color del stand"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Insignias sobre el stand"]'),
    ).not.toBeNull();
  });

  it("stays a read-only key when no change handler is given", () => {
    const { container } = render(
      <FestivalNavMapLegend activityTypes={["coupon_book"]} />,
    );

    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("exposes each entry as a toggle when controlled", () => {
    const onFiltersChange = vi.fn();
    render(
      <FestivalNavMapLegend
        activityTypes={["coupon_book"]}
        filters={EMPTY_STAND_FILTERS}
        onFiltersChange={onFiltersChange}
      />,
    );

    const occupied = screen.getByRole("button", { name: "Ocupado" });
    expect(occupied.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(occupied);
    expect(onFiltersChange).toHaveBeenCalledWith({
      status: "occupied",
      activities: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "En cuponera" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      status: "all",
      activities: ["coupon_book"],
    });
  });

  it("clears a pressed status instead of re-applying it", () => {
    const onFiltersChange = vi.fn();
    render(
      <FestivalNavMapLegend
        activityTypes={[]}
        filters={{ status: "occupied", activities: [] }}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ocupado" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      status: "all",
      activities: [],
    });
  });

  it("disables activity toggles while Disponible is selected", () => {
    const onFiltersChange = vi.fn();
    render(
      <FestivalNavMapLegend
        activityTypes={["coupon_book"]}
        filters={{ status: "available", activities: [] }}
        onFiltersChange={onFiltersChange}
      />,
    );

    const coupon = screen.getByRole("button", { name: "En cuponera" });
    expect(coupon.hasAttribute("disabled")).toBe(true);

    fireEvent.click(coupon);
    expect(onFiltersChange).not.toHaveBeenCalled();
  });

  it("drops activity selections when switching to Disponible", () => {
    const onFiltersChange = vi.fn();
    render(
      <FestivalNavMapLegend
        activityTypes={["coupon_book"]}
        filters={{ status: "all", activities: ["coupon_book"] }}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disponible" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      status: "available",
      activities: [],
    });
  });

  it("keeps a status without stands as a plain key", () => {
    const onFiltersChange = vi.fn();
    render(
      <FestivalNavMapLegend
        activityTypes={[]}
        filters={EMPTY_STAND_FILTERS}
        onFiltersChange={onFiltersChange}
        selectableStatuses={["occupied"]}
      />,
    );

    expect(screen.getByRole("button", { name: "Ocupado" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Disponible" })).toBeNull();
    expect(screen.getByText("Disponible")).not.toBeNull();
  });

  it("shows an activity with no badged stands as a disabled chip", () => {
    const onFiltersChange = vi.fn();
    render(
      <FestivalNavMapLegend
        activityTypes={["stamp_passport"]}
        filters={EMPTY_STAND_FILTERS}
        onFiltersChange={onFiltersChange}
        selectableActivities={[]}
      />,
    );

    const chip = screen.getByRole("button", { name: "Carrera de sellos" });
    expect(chip.hasAttribute("disabled")).toBe(true);

    fireEvent.click(chip);
    expect(onFiltersChange).not.toHaveBeenCalled();
  });

  it("still hides activities the festival does not run", () => {
    render(
      <FestivalNavMapLegend
        activityTypes={["stamp_passport"]}
        filters={EMPTY_STAND_FILTERS}
        onFiltersChange={vi.fn()}
        selectableActivities={[]}
      />,
    );

    expect(screen.queryByText("En cuponera")).toBeNull();
    expect(screen.queryByText("Cacería de stickers")).toBeNull();
  });
});
