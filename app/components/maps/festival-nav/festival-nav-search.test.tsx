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
