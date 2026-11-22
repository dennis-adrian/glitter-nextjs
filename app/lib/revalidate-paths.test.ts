import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A typed `revalidatePath(path, "page" | "layout")` names a page or layout
 * by its file path under app/, route groups included: Next tags each page
 * with the folders it sits in (`getDerivedTags` in
 * next/dist/server/lib/implicit-tags.js). "/dashboard/x" with a type matches
 * nothing once the page lives in app/(site)/dashboard/x, and nothing warns.
 *
 * So every typed call here must name, as a plain string, a folder that holds
 * a page ("page") or pages ("layout"). A literal address takes no type:
 * `revalidatePath("/blog/my-post")`.
 */
const ROOT = process.cwd();
const APP = path.join(ROOT, "app");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const TYPED_CALL =
  /revalidatePath\(\s*("[^"]*"|`[^`]*`|[\w.]+(?:\([^)]*\))?)\s*,\s*"(page|layout)"\s*,?\s*\)/g;

const calls = sourceFiles(APP).flatMap((file) =>
  [...fs.readFileSync(file, "utf8").matchAll(TYPED_CALL)].map((match) => ({
    where: path.relative(ROOT, file),
    arg: match[1].trim(),
    type: match[2] as "page" | "layout",
  })),
);

function hasPage(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  if (fs.existsSync(path.join(dir, "page.tsx"))) return true;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .some(
      (entry) => entry.isDirectory() && hasPage(path.join(dir, entry.name)),
    );
}

describe("typed revalidatePath calls", () => {
  it("finds them", () => {
    expect(calls.length).toBeGreaterThan(50);
  });

  it.each(calls)("$where: $arg, $type names a real route", ({ arg, type }) => {
    // A plain string: a template or a variable cannot be checked, and a
    // literal address should drop the type instead.
    expect(arg).toMatch(/^"\/[^"$`]*"$/);
    const folder = path.join(APP, arg.slice(1, -1));
    if (type === "page") {
      expect(fs.existsSync(path.join(folder, "page.tsx")), folder).toBe(true);
    } else {
      expect(hasPage(folder), folder).toBe(true);
    }
  });
});
