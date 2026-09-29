import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SessionContextHeader from "@/app/components/programs/session-context-header";

afterEach(() => {
  cleanup();
});

describe("SessionContextHeader", () => {
  it("points a program session back to its program", () => {
    render(
      <SessionContextHeader
        program={{ slug: "semana", name: "Semana Glitter" }}
        festival={null}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "Volver a Semana Glitter" })
        .getAttribute("href"),
    ).toBe("/programs/semana");
  });

  it("links a standalone session's festival once the festival is public", () => {
    render(
      <SessionContextHeader
        program={null}
        festival={{ id: 12, name: "Glitter 12", status: "published" }}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "Charlas y Talleres" })
        .getAttribute("href"),
    ).toBe("/programs");
    expect(
      screen
        .getByRole("link", { name: /Parte de Glitter 12/ })
        .getAttribute("href"),
    ).toBe("/festivals/12");
  });

  it("says nothing about a festival that is still a draft", () => {
    render(
      <SessionContextHeader
        program={null}
        festival={{ id: 12, name: "Glitter 12", status: "draft" }}
      />,
    );

    expect(screen.queryByText(/Parte de/)).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
