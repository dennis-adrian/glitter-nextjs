// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MobileSearchScreen from "@/app/components/ui/mobile-search-screen";

afterEach(cleanup);

const options = [
  { value: "a", label: "Ana" },
  { value: "b", label: "Beto" },
];

function renderScreen(props: Partial<Parameters<typeof MobileSearchScreen<string>>[0]> = {}) {
  const onSelect = vi.fn();
  const onSearchValueChange = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MobileSearchScreen<string>
      open
      title="Buscar"
      options={options}
      searchValue="a"
      onSelect={onSelect}
      onSearchValueChange={onSearchValueChange}
      onOpenChange={onOpenChange}
      {...props}
    />,
  );
  return { onSelect, onSearchValueChange, onOpenChange };
}

describe("MobileSearchScreen", () => {
  it("picks one and resets by default, as the partner search expects", () => {
    const { onSelect, onSearchValueChange, onOpenChange } = renderScreen();
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBeNull();
    fireEvent.click(screen.getByText("Ana"));
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(onSearchValueChange).toHaveBeenCalledWith("");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opts into picking several: keeps the search, marks rows, closes with Listo", () => {
    const { onSelect, onSearchValueChange, onOpenChange } = renderScreen({
      keepSearchOnSelect: true,
      selectedValues: ["b"],
      dismissLabel: "Listo",
    });
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
    expect(screen.getByRole("option", { name: "Beto" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "Ana" }).getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("option", { name: "Ana" }));
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(onSearchValueChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSearchValueChange).not.toHaveBeenCalled();
  });
});
