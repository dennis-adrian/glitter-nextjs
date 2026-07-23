import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SanctionInfractionOption from "@/app/components/sanctions/infraction-option";

describe("SanctionInfractionOption", () => {
  it("shows every field required by the sanction selector", () => {
    const { container } = render(
      <SanctionInfractionOption
        infraction={{
          id: 42,
          status: "under_review",
          createdAt: new Date("2026-07-20T15:00:00.000Z"),
          type: {
            id: 3,
            label: "Incumplimiento",
            severity: "high",
          },
          festival: { id: 8, name: "Glitter Central" },
        }}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("#42");
    expect(text).toContain("Incumplimiento");
    expect(text).toContain("En revisión");
    expect(text).toContain("Severidad Alta");
    expect(text).toContain("Glitter Central");
    expect(text).toMatch(/20.*jul.*2026/i);
  });
});
