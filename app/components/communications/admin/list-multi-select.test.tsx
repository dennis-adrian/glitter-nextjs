// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ListMultiSelect from "@/app/components/communications/admin/list-multi-select";

const OPTIONS = [
  { value: "1", label: "Glitter Navidad" },
  { value: "2", label: "Twinkler" },
  { value: "3", label: "Festicker" },
];

describe("ListMultiSelect", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("stops offering more once the limit is reached, and still lets one go", () => {
    const onChange = vi.fn();
    render(
      <ListMultiSelect
        id="festivals"
        label="Con reserva confirmada en"
        placeholder="Agregar festival"
        options={OPTIONS}
        selected={["1", "2"]}
        onChange={onChange}
        max={2}
        maxReason="Hasta 2 festivales"
      />,
    );
    expect(screen.getByText("Hasta 2 festivales.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Agregar festival/ }));
    const item = (label: string) =>
      screen
        .getAllByText(label)
        .map((node) => node.closest("[cmdk-item]"))
        .find(Boolean) as HTMLElement;
    expect(item("Festicker").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(item("Festicker"));
    expect(onChange).not.toHaveBeenCalled();

    // Removing one is always possible.
    expect(item("Twinkler").getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(item("Twinkler"));
    expect(onChange).toHaveBeenCalledWith(["1"]);
  });
});
