// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import CreditsIntroductionSkeleton from "@/app/components/festivals/reservations/credits-introduction-skeleton";

afterEach(cleanup);

describe("CreditsIntroductionSkeleton", () => {
  it("tells assistive tech the screen is loading", () => {
    render(<CreditsIntroductionSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("Cargando");
  });
});
