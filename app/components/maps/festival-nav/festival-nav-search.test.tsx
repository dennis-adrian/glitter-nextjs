import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FestivalNavSearch from "@/app/components/maps/festival-nav/festival-nav-search";
import type { ParticipantSearchEntry } from "@/app/components/maps/festival-nav/festival-nav-participant-search";

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

describe("FestivalNavSearch selection", () => {
  it("releases the field so the phone keyboard leaves the located stand", () => {
    const onSelect = vi.fn();
    const entry = {
      userId: 1,
      category: "illustration",
      displayName: "Pandas Draw",
      imageUrl: null,
      standLabel: "A1",
      sectorName: "Lobby",
      sectorIndex: 0,
      stand: { id: 7 },
    } as unknown as ParticipantSearchEntry;

    render(<FestivalNavSearch entries={[entry]} onSelect={onSelect} />);

    const input = screen.getByRole("textbox", {
      name: "Buscar participantes",
    }) as HTMLInputElement;
    // Real focus, not a synthetic event: the assertion is about where
    // document.activeElement lands, so the field has to actually hold it first.
    input.focus();
    fireEvent.change(input, { target: { value: "Pandas" } });
    expect(document.activeElement).toBe(input);

    fireEvent.click(screen.getByRole("button", { name: /Pandas Draw/ }));

    expect(onSelect).toHaveBeenCalledWith(entry);
    expect(document.activeElement).not.toBe(input);
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
