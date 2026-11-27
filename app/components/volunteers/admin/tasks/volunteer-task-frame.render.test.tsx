import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VolunteerTaskFrame,
  VolunteerTaskSummary,
} from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";

let pathname = "/dashboard/festivals/7/volunteers";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const frame = (children: React.ReactNode) => (
  <VolunteerTaskFrame
    festivalId={7}
    top={<h1>Voluntarios</h1>}
    pending={31}
    places={24}
    strips={{ revisar: <p>layout revisar</p>, asignar: <p>layout asignar</p> }}
  >
    {children}
  </VolunteerTaskFrame>
);

describe("VolunteerTaskFrame", () => {
  it("shows the layout's counts and the strip of the task in the URL", () => {
    pathname = "/dashboard/festivals/7/volunteers/asignar";
    render(frame(null));
    expect(
      screen
        .getByRole("link", { name: /Asignar 24/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("link", { name: /Revisar 31/ })).toBeTruthy();
    expect(screen.getByText("layout asignar")).toBeTruthy();
  });

  it("follows the counts the content reports, and its strip only for its own task", () => {
    pathname = "/dashboard/festivals/7/volunteers";
    const { rerender } = render(
      frame(
        <VolunteerTaskSummary
          task="revisar"
          pending={32}
          places={20}
          strip={<p>fresh revisar</p>}
        />,
      ),
    );
    expect(screen.getByRole("link", { name: /Revisar 32/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Asignar 20/ })).toBeTruthy();
    expect(screen.getByText("fresh revisar")).toBeTruthy();

    // The URL moves to Asignar before its content reports: the counts stay
    // the newest known, the strip is Asignar's own.
    pathname = "/dashboard/festivals/7/volunteers/asignar";
    rerender(frame(null));
    expect(screen.getByRole("link", { name: /Revisar 32/ })).toBeTruthy();
    expect(screen.getByText("layout asignar")).toBeTruthy();
    expect(screen.queryByText("fresh revisar")).toBeNull();
  });
});
