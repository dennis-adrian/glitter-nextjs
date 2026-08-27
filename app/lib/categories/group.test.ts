import { describe, expect, it } from "vitest";

import { groupByManagementArea } from "@/app/lib/categories/group";

describe("management area grouping", () => {
  it("keeps unmatched categories in a sorted other group", () => {
    const groups = groupByManagementArea([
      { category: "none", label: "Zeta", sortOrder: 1 },
      { category: "illustration", label: "Arte", sortOrder: 0 },
      { category: "new_artist", label: "Álbum", sortOrder: 1 },
      { category: "none", label: "Beta", sortOrder: 0 },
      { category: "gastronomy", label: "Comida", sortOrder: 0 },
    ]);

    expect(groups.map((group) => group.area)).toEqual([
      "illustration",
      "entrepreneurship",
      "gastronomy",
      "other",
    ]);
    expect(groups[0].items.map((item) => item.label)).toEqual(["Arte"]);
    expect(groups[3].items.map((item) => item.label)).toEqual([
      "Beta",
      "Álbum",
      "Zeta",
    ]);
  });
});
