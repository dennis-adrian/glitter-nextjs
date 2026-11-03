import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FestivalGuide, {
  buildGuideCards,
} from "@/app/components/festivals/festival-guide";

afterEach(cleanup);

const base = {
  sectorCount: 4,
  standCount: 120,
  participantCount: 118,
  activityNames: ["Pasaporte", "Cuponera", "Stand Icónico"],
  locationLabel: "Casa de la Cultura",
  locationUrl: "https://maps.example/casa",
};

describe("buildGuideCards", () => {
  it("leads to each section of the page with its live figure", () => {
    expect(
      buildGuideCards(base).map((card) => [card.title, card.subtitle, card.href]),
    ).toEqual([
      ["Mapa", "4 sectores · 120 stands", "#mapa"],
      ["Participantes", "118 · buscá por nombre", "#participantes"],
      ["Actividades", "Pasaporte, Cuponera, Stand Icónico", "#actividades"],
      ["Cómo llegar", "Casa de la Cultura ↗", "https://maps.example/casa"],
    ]);
  });

  it("leaves out what the festival does not have and says what is not out yet", () => {
    const cards = buildGuideCards({
      ...base,
      sectorCount: 0,
      standCount: 0,
      participantCount: 0,
      activityNames: [],
      locationUrl: null,
    });
    expect(cards.map((card) => card.subtitle)).toEqual([
      "Estará disponible pronto",
      "Aún no hay participantes publicados",
    ]);
  });
});

describe("FestivalGuide", () => {
  it("opens the venue's location in a new tab and keeps the rest on the page", () => {
    render(<FestivalGuide cards={buildGuideCards(base)} />);

    expect(screen.getByRole("heading", { name: "Guía del festival" })).toBeTruthy();
    const directions = screen.getByRole("link", { name: /Cómo llegar/ });
    expect(directions.getAttribute("target")).toBe("_blank");
    expect(
      screen.getByRole("link", { name: /Mapa/ }).getAttribute("target"),
    ).toBeNull();
  });
});
