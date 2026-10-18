import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A standalone session has no program row, and an inner join on `programs`
 * silently drops it: checkout reports "Horario no encontrado", an approved
 * purchase sends no QR email, a resend rotates the link and sends nothing, a
 * reminder never goes out. The compiler cannot see any of that, because the
 * joined columns stay non-null in the result type. This test can.
 *
 * Join `programs` with `leftJoin` and handle the null. Add an entry below only
 * for a query that is about program sessions by definition, with the reason.
 */
const ALLOWED_INNER_JOINS: Record<string, { count: number; reason: string }> = {
  "data.ts": {
    count: 1,
    reason:
      "fetchPublishedSessionRouteParams lists /programs/[slug]/[sessionSlug] routes, which only program sessions have",
  },
};

const PROGRAMS_DIR = path.join(process.cwd(), "app/lib/programs");
const INNER_JOIN_ON_PROGRAMS = /\.innerJoin\(\s*programs\s*,/g;

function sourceFiles(): string[] {
  return readdirSync(PROGRAMS_DIR).filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !/\.test\.tsx?$/.test(file) &&
      !file.endsWith(".d.ts"),
  );
}

describe("queries in app/lib/programs", () => {
  it("never inner-join programs, which would drop standalone sessions", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(path.join(PROGRAMS_DIR, file), "utf8");
      const matches = source.match(INNER_JOIN_ON_PROGRAMS) ?? [];
      const allowed = ALLOWED_INNER_JOINS[file]?.count ?? 0;
      if (matches.length > allowed) {
        offenders.push(
          `${file}: ${matches.length} inner join(s) on programs, ${allowed} allowed`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("finds the files it is meant to scan", () => {
    // Guards the guard: a moved directory would otherwise pass vacuously.
    expect(sourceFiles()).toContain("checkout-actions.ts");
    expect(sourceFiles()).toContain("review-actions.ts");
  });
});
