// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PersonPicker from "@/app/components/comunicados/admin/composer/person-picker";
import type { ComunicadoPersonOption } from "@/app/lib/comunicados/queries";

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/app/lib/comunicados/actions", () => ({
  searchComunicadoPeopleAction: mocks.search,
}));

function person(id: number, name: string): ComunicadoPersonOption {
  return {
    id,
    name,
    email: `p${id}@example.com`,
    imageUrl: null,
    isAdmin: false,
    skipReason: null,
    realEmailOnPreview: false,
  };
}

const ANA = person(1, "Ana Pérez");
const ANABEL = person(2, "Anabel Rojas");

/** Searches the test answers by hand, by term. */
function manualSearch() {
  const pending = new Map<string, (people: ComunicadoPersonOption[]) => void>();
  mocks.search.mockImplementation(
    (term: string) =>
      new Promise<ComunicadoPersonOption[]>((resolve) => {
        pending.set(term, resolve);
      }),
  );
  return pending;
}

function renderPicker() {
  const onPick = vi.fn();
  render(<PersonPicker chosenIds={[]} fullReason={null} onPick={onPick} />);
  return onPick;
}

const trigger = () =>
  screen.getByRole("button", { name: /Agregar por nombre o correo/ });
const input = () => screen.getByLabelText("Buscar por nombre o correo");
const type = (value: string) =>
  fireEvent.change(input(), { target: { value } });

async function answer(
  pending: Map<string, (people: ComunicadoPersonOption[]) => void>,
  term: string,
  people: ComunicadoPersonOption[],
) {
  await waitFor(() => expect(pending.has(term)).toBe(true));
  await act(async () => pending.get(term)!(people));
}

describe("PersonPicker", () => {
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
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows only the answer for the term typed now, so Enter adds no one else", async () => {
    const pending = manualSearch();
    const onPick = renderPicker();
    fireEvent.click(trigger());

    type("Ana");
    await answer(pending, "Ana", [ANA]);
    expect(screen.getByText("Ana Pérez")).toBeTruthy();

    // A new term: the answer for "Ana" does not match it.
    type("Anab");
    expect(screen.queryByText("Ana Pérez")).toBeNull();
    expect(screen.getByText("Buscando…")).toBeTruthy();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();

    await answer(pending, "Anab", [ANABEL]);
    expect(screen.getByText("Anabel Rojas")).toBeTruthy();
    expect(screen.queryByText("Ana Pérez")).toBeNull();
  });

  it("starts over when it closes: no earlier answer shows on reopening", async () => {
    const pending = manualSearch();
    renderPicker();
    const close = async () => {
      fireEvent.keyDown(input(), { key: "Escape" });
      await waitFor(() =>
        expect(
          screen.queryByLabelText("Buscar por nombre o correo"),
        ).toBeNull(),
      );
    };

    fireEvent.click(trigger());
    type("Ana");
    await answer(pending, "Ana", [ANA]);
    expect(screen.getByText("Ana Pérez")).toBeTruthy();
    await close();

    fireEvent.click(trigger());
    expect(
      screen.getByText("Escribí al menos 2 letras para buscar."),
    ).toBeTruthy();
    // The same term is a new search: what it found before closing waits.
    type("Ana");
    expect(screen.queryByText("Ana Pérez")).toBeNull();
    expect(screen.getByText("Buscando…")).toBeTruthy();

    // A search still on its way when it closes is dropped too.
    type("Anab");
    await waitFor(() => expect(pending.has("Anab")).toBe(true));
    await close();
    await act(async () => pending.get("Anab")!([ANABEL]));
    pending.delete("Anab");
    fireEvent.click(trigger());
    type("Anab");
    expect(screen.queryByText("Anabel Rojas")).toBeNull();
    expect(screen.getByText("Buscando…")).toBeTruthy();
  });
});
