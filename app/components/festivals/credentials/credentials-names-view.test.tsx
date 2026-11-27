// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CredentialsNamesView from "@/app/components/festivals/credentials/credentials-names-view";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { addReservation, emptyData } from "@/app/lib/credentials/__fixtures__/data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));

const writeText = vi.fn();
Object.assign(navigator, { clipboard: { writeText } });

afterEach(() => {
  cleanup();
  writeText.mockReset();
});

function festival() {
  const data = emptyData();
  addReservation(data, { category: "gastronomy", people: [{ name: "Cocina Andina" }] });
  addReservation(data, { people: [{ name: "Lucía Fernández" }, { name: "Andrés Vaca" }] });
  addReservation(data, { people: [{ name: "Pendiente" }], status: "pending" });
  addReservation(data, { people: [{ name: "Doble", userId: 5 }] });
  addReservation(data, { people: [{ name: "Doble", userId: 5 }], category: "entrepreneurship" });
  return data;
}

describe("CredentialsNamesView", () => {
  it("copies one line per named credential, a gastronomy name twice", () => {
    renderWithCredentials(<CredentialsNamesView />, { data: festival() });
    // Andrés, Doble ×2, Lucía, and Cocina Andina twice.
    expect(screen.getByTestId("credentials-names-count").textContent).toBe("6 nombres");
    fireEvent.click(screen.getByRole("button", { name: /Copiar nombres/ }));
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied.split("\n").filter((line) => line === "Cocina Andina")).toHaveLength(2);
    expect(copied).not.toContain("Pendiente");
  });

  it("searches without case or accents", () => {
    renderWithCredentials(<CredentialsNamesView />, { data: festival() });
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "LUCIA" } });
    expect(screen.getByTestId("credentials-names-count").textContent).toBe("1 nombre");
    expect(screen.getAllByText("Lucía Fernández").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Cocina Andina")).toHaveLength(0);
  });

  it("lists the warnings above the table", () => {
    renderWithCredentials(<CredentialsNamesView />, { data: festival() });
    expect(screen.getByText("Hay 1 caso para revisar a mano")).toBeTruthy();
    expect(screen.getByText(/Doble está en más de una reserva/)).toBeTruthy();
  });
});
