import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FestivalNavSearch from "@/app/components/maps/festival-nav/festival-nav-search";

afterEach(cleanup);

describe("FestivalNavSearch", () => {
  it("clears the controlled query and returns focus to the input", () => {
    const onSelect = vi.fn();

    function SearchHarness() {
      const [value, setValue] = useState("Pandas Draw");

      return (
        <FestivalNavSearch
          entries={[]}
          value={value}
          onValueChange={setValue}
          onSelect={onSelect}
        />
      );
    }

    render(<SearchHarness />);

    const input = screen.getByRole("textbox", {
      name: "Buscar participantes",
    }) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));

    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(
      screen.queryByRole("button", { name: "Limpiar búsqueda" }),
    ).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("FestivalNavSearch focus scrolling", () => {
  /**
   * Renders the field inside a sticky bar and pins the geometry jsdom does not
   * compute: the bar sits `barTop` down the screen and sticks at 64px, with the
   * field 8px into it.
   */
  function renderInStickyBar(barTop: number) {
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    // jsdom ships neither of these; the component asks both.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );

    const { container } = render(
      <div style={{ position: "sticky", top: "64px" }}>
        <FestivalNavSearch entries={[]} onSelect={vi.fn()} />
      </div>,
    );

    const bar = container.firstElementChild as HTMLElement;
    const input = screen.getByRole("textbox", {
      name: "Buscar participantes",
    });

    bar.getBoundingClientRect = () => ({ top: barTop }) as DOMRect;
    input.getBoundingClientRect = () => ({ top: barTop + 8 }) as DOMRect;

    return { input, scrollBy };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("lifts the bar to where it sticks so the keyboard has room", () => {
    // Bar 300px down, sticking at 64: the field has 236px to climb.
    const { input, scrollBy } = renderInStickyBar(300);

    fireEvent.focus(input);

    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 236 }),
    );
  });

  it("leaves the scroll alone once the bar is already pinned", () => {
    const { input, scrollBy } = renderInStickyBar(64);

    fireEvent.focus(input);

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
