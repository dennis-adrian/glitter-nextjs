import { describe, expect, it } from "vitest";

import { volunteerTaskRoute } from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";

const BASE = "/dashboard/festivals/7/volunteers";

describe("volunteerTaskRoute", () => {
  it.each([
    [BASE, { task: "revisar", item: false }],
    [`${BASE}/`, { task: "revisar", item: false }],
    [`${BASE}/12`, { task: "revisar", item: true }],
    [`${BASE}/12/disponibilidad`, { task: "revisar", item: true }],
    [`${BASE}/asignar`, { task: "asignar", item: false }],
    [`${BASE}/asignar/personas`, { task: "asignar", item: false }],
    [`${BASE}/shifts/3`, { task: "asignar", item: true }],
  ])("%s", (pathname, expected) => {
    expect(volunteerTaskRoute(pathname, 7)).toEqual(expected);
  });

  it("treats a path outside the festival's volunteers as Revisar's index", () => {
    expect(volunteerTaskRoute("/elsewhere", 7)).toEqual({
      task: "revisar",
      item: false,
    });
  });
});
