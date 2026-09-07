import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "scripts/backfill-categories.ts"),
  "utf8",
);

describe("backfillCategoryCatalog visibility heuristics", () => {
  it("applies exclusive and sublimacion flags only before the catalog marker exists", () => {
    const loop = source.slice(
      source.indexOf("const alreadyClassified"),
      source.indexOf("for (const seed of HARDCODED_CATEGORY_COPY"),
    );

    expect(loop).toContain("alreadyClassified");
    expect(loop).toContain("categoryCatalogBackfillCompleted");
    expect(loop).toMatch(/if \(!alreadyClassified\)/);
    expect(loop.indexOf("if (!alreadyClassified)")).toBeLessThan(
      loop.indexOf("const isExclusive"),
    );
    expect(loop.indexOf("if (!alreadyClassified)")).toBeLessThan(
      loop.indexOf("const isAdminAssignableOnly"),
    );
    expect(loop.indexOf("if (!alreadyClassified)")).toBeLessThan(
      loop.indexOf('patch.visibility = "listed"'),
    );
    expect(loop.indexOf("if (seed && !row.descriptionHtml)")).toBeGreaterThan(
      loop.indexOf("if (!alreadyClassified)"),
    );
  });
});
