import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every tap that opens a screen must show something at once. On a client
 * navigation Next keeps everything above the first segment that changes, and
 * the tap shows a loading state immediately only when a `loading.tsx` sits in
 * that segment's parent, or in that segment or any directory below it on the
 * way to the page; Next prefetches it with the link. Otherwise nothing moves
 * until the server has rendered the whole page.
 *
 * This walks the route tree and lists each page a real navigation would
 * reach with nothing on screen. A navigation can first change a segment only
 * from one of its siblings, from its parent's own page, or from another value
 * of a dynamic segment; it can come back up to a page only from a route below
 * it.
 */
const APP = path.join(process.cwd(), "app");

function isRouteDir(name: string) {
  return name !== "api" && !name.startsWith("_") && !name.startsWith("@");
}

function listPages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isRouteDir(entry.name)) continue;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(child, "page.tsx"))) out.push(child);
    listPages(child, out);
  }
  return out;
}

const pages = listPages(APP);
const hasLoading = (dir: string) =>
  fs.existsSync(path.join(dir, "loading.tsx"));
const leadsToPage = (dir: string) =>
  pages.some((page) => page === dir || page.startsWith(dir + path.sep));

function routeChildren(dir: string) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isRouteDir(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .filter(leadsToPage);
}

function blankNavigations(page: string): string[] {
  const parts = path.relative(APP, page).split(path.sep);
  const dirs = [
    APP,
    ...parts.map((_, i) => path.join(APP, ...parts.slice(0, i + 1))),
  ];
  const gaps: string[] = [];

  for (let i = 1; i <= dirs.length; i++) {
    const parent = dirs[i - 1];
    const own = i === dirs.length;
    if (own) {
      if (!pages.some((other) => other.startsWith(page + path.sep))) continue;
    } else {
      const changed = dirs[i];
      const dynamic = path.basename(changed).startsWith("[");
      const siblings = routeChildren(parent).filter((d) => d !== changed);
      const parentPage = fs.existsSync(path.join(parent, "page.tsx"));
      if (!dynamic && siblings.length === 0 && !parentPage) continue;
    }
    if (hasLoading(parent) || dirs.slice(i).some(hasLoading)) continue;
    gaps.push(
      own
        ? "back up from a screen below it"
        : `entering ${path.relative(APP, dirs[i])}`,
    );
  }
  return gaps;
}

describe("loading states", () => {
  it("finds the route tree", () => {
    expect(pages.length).toBeGreaterThan(100);
  });

  it("shows something at once for every navigation into every screen", () => {
    const blank = pages
      .map((page) => ({
        page: path.relative(APP, page),
        gaps: blankNavigations(page),
      }))
      .filter(({ gaps }) => gaps.length > 0)
      .map(({ page, gaps }) => `${page}: ${gaps.join(", ")}`);

    // Fix: add a loading.tsx (usually `<ScreenSkeleton variant=… />`) in the
    // directory that holds the page, or in the parent of the segment named.
    expect(blank).toEqual([]);
  });
});
