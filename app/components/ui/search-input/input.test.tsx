import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchInput from "./input";
import type { SearchOption } from "./search-content";

const people: SearchOption[] = [
  { value: 1, label: "Ana Cheese" },
  { value: 2, label: "Carla Cheeseman" },
];

function panel(container: HTMLElement) {
  return container.querySelector<HTMLElement>("[data-search-results]")!;
}

function isOpen(container: HTMLElement) {
  return panel(container).classList.contains("block");
}

/** Lets the input's 300ms debounce run. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SearchInput", () => {
  it("stacks its results above the content that follows it", () => {
    const { container } = render(
      <SearchInput id="s" options={people} onSelect={vi.fn()} />,
    );
    expect(panel(container).classList).toContain("z-50");
  });

  it("opens again for the next term after a pick, without leaving the box", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SearchInput id="s" options={people} onSelect={onSelect} />,
    );
    const input = screen.getByRole("searchbox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ana" } });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Ana Cheese" }));

    expect(onSelect).toHaveBeenCalledWith(1);
    expect(isOpen(container)).toBe(false);
    expect(input).toHaveProperty("value", "");

    // Still focused, so no new focus event: typing alone must reopen it.
    fireEvent.change(input, { target: { value: "carla" } });
    await settle();
    expect(isOpen(container)).toBe(true);
    expect(
      screen.getByRole("button", { name: "Carla Cheeseman" }),
    ).toBeTruthy();
  });

  it("stays closed while there is nothing to show", () => {
    const { container } = render(
      <SearchInput id="s" options={[]} onSearch={vi.fn()} onSelect={vi.fn()} />,
    );
    fireEvent.focus(screen.getByRole("searchbox"));
    expect(isOpen(container)).toBe(false);
  });

  it("still opens on focus when it has suggestions or header actions", () => {
    const withSuggestions = render(
      <SearchInput
        id="a"
        options={[]}
        defaultOptions={people}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.focus(withSuggestions.getByRole("searchbox"));
    expect(isOpen(withSuggestions.container)).toBe(true);
    withSuggestions.unmount();

    const withActions = render(
      <SearchInput
        id="b"
        options={[]}
        contentHeaderActions={<button type="button">Actualizar</button>}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.focus(withActions.getByRole("searchbox"));
    expect(isOpen(withActions.container)).toBe(true);
  });

  it("still lists every option on focus when it filters locally", async () => {
    const { container } = render(
      <SearchInput id="s" options={people} onSelect={vi.fn()} />,
    );
    fireEvent.focus(screen.getByRole("searchbox"));
    await settle();
    expect(isOpen(container)).toBe(true);
    expect(
      screen.getByRole("button", { name: "Carla Cheeseman" }),
    ).toBeTruthy();
  });

  it("does not submit the form it sits in when Enter is pressed", () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <SearchInput id="s" options={people} onSelect={vi.fn()} />
        <button type="submit">Guardar</button>
      </form>,
    );
    const input = screen.getByRole("searchbox");

    // fireEvent returns false once a handler has prevented the default.
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "a" })).toBe(true);
    // Mid-composition Enter commits IME text and must stay untouched.
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(
      true,
    );
    expect(onSubmit).not.toHaveBeenCalled();

    // The form's own button still submits it.
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("asks for a longer term instead of reporting no results", async () => {
    const onSearch = vi.fn();
    render(
      <SearchInput
        id="s"
        options={[]}
        minSearchLength={2}
        onSearch={onSearch}
        onSelect={vi.fn()}
      />,
    );
    const input = screen.getByRole("searchbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });
    await settle();

    expect(
      screen.getByText("Escribí al menos 2 caracteres para buscar."),
    ).toBeTruthy();
    expect(screen.queryByText(/No se encontraron resultados/)).toBeNull();

    fireEvent.change(input, { target: { value: "an" } });
    await settle();
    expect(onSearch).toHaveBeenLastCalledWith("an");
    expect(screen.getByText(/No se encontraron resultados/)).toBeTruthy();
  });
});
