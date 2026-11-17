import "server-only";

import dynamicIconImports from "lucide-react/dynamicIconImports";
import * as simpleIcons from "simple-icons";

import {
  parseLibraryIcon,
  type IconLibrarySet,
} from "@/app/lib/links/definitions";

/*
 * Every icon of Lucide and Simple Icons, for the dashboard's picker. Server
 * only: the two libraries are several megabytes together, and the page shows
 * a picked icon from the drawing stored with its link (`site_links.icon_svg`).
 */

export type LibraryIcon = {
  /** What is stored in `site_links.icon`: `lucide:camera`, `si:spotify`. */
  ref: string;
  set: IconLibrarySet;
  name: string;
  /** What the picker names it: "Camera", "Spotify". */
  label: string;
};

type LucideNode = [string, Record<string, string>][];
type LucideImports = Record<string, () => Promise<{ __iconNode?: LucideNode }>>;

const lucideImports = dynamicIconImports as unknown as LucideImports;

type SimpleIcon = { title: string; slug: string; path: string };

const simpleIconsBySlug = new Map<string, SimpleIcon>();
for (const value of Object.values(simpleIcons as Record<string, unknown>)) {
  if (
    value &&
    typeof value === "object" &&
    "slug" in value &&
    "path" in value &&
    "title" in value
  ) {
    const icon = value as SimpleIcon;
    simpleIconsBySlug.set(icon.slug, icon);
  }
}

function lucideLabel(name: string) {
  const words = name.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Letters and digits only, so "tik tok" finds "TikTok" and "x-ray" "X Ray". */
function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const INDEX: (LibraryIcon & { key: string })[] = [
  ...Object.keys(lucideImports).map((name) => {
    const label = lucideLabel(name);
    return {
      ref: `lucide:${name}`,
      set: "lucide" as const,
      name,
      label,
      key: searchKey(label),
    };
  }),
  ...[...simpleIconsBySlug.values()].map((icon) => ({
    ref: `si:${icon.slug}`,
    set: "si" as const,
    name: icon.slug,
    label: icon.title,
    key: searchKey(`${icon.title} ${icon.slug}`),
  })),
];

export const ICON_LIBRARY_SIZE = INDEX.length;

/**
 * The library's icons whose name has `query` in it, the closest names
 * first. Nothing for an empty query: the picker shows the featured icons
 * until something is typed.
 */
export function searchLibraryIcons(query: string, limit = 96): LibraryIcon[] {
  const key = searchKey(query.slice(0, 64));
  if (!key) return [];
  const found: { icon: LibraryIcon; rank: number; length: number }[] = [];
  for (const { key: iconKey, ...icon } of INDEX) {
    const at = iconKey.indexOf(key);
    if (at < 0) continue;
    // The name itself, then names that start with it, then the rest; the
    // shorter name first, so "camera" comes before "camera off".
    found.push({ icon, rank: at === 0 ? 0 : 1, length: iconKey.length });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.length - b.length)
    .slice(0, limit)
    .map((entry) => entry.icon);
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const LUCIDE_TAGS = new Set([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
]);

/**
 * The drawing of a library icon as an `<svg>` in the current colour, or null
 * when the library has no such icon. Built here from the libraries' own data
 * and from nothing a person typed, which is what makes it safe to put in the
 * page as markup.
 */
export async function libraryIconSvg(ref: string): Promise<string | null> {
  const parsed = parseLibraryIcon(ref);
  if (!parsed) return null;

  if (parsed.set === "si") {
    const icon = simpleIconsBySlug.get(parsed.name);
    if (!icon) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="${escapeAttribute(icon.path)}"/></svg>`;
  }

  if (!Object.hasOwn(lucideImports, parsed.name)) return null;
  const node = (await lucideImports[parsed.name]()).__iconNode;
  if (!node) return null;
  const shapes = node
    .filter(([tag]) => LUCIDE_TAGS.has(tag))
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .filter(([name]) => name !== "key" && /^[a-zA-Z-]+$/.test(name))
        .map(([name, value]) => ` ${name}="${escapeAttribute(String(value))}"`)
        .join("");
      return `<${tag}${attributes}/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
}
