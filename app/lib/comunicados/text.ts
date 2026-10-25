import { COMUNICADO_EXCERPT_MAX } from "@/app/lib/comunicados/definitions";

/**
 * The plain-text rendering of a comunicado (docs/IMPLEMENTATION-comunicados.md
 * C3): the stored text and the excerpt without URLs, the email's text part
 * with them. Client-safe and synchronous, so the composer counts characters
 * with the same function the server limits them with.
 */

export type AnnouncementTextOptions = {
  withUrls: boolean;
  /**
   * Turns a root-relative link absolute when `withUrls` is on, by plain
   * concatenation (C3). Without it the path is shown as written.
   */
  baseUrl?: string;
};

type InlineNode = {
  type?: unknown;
  text?: unknown;
  href?: unknown;
  content?: unknown;
};

type BlockNode = {
  type?: unknown;
  props?: { caption?: unknown };
  content?: unknown;
  children?: unknown;
};

const LIST_ITEM_TYPES = new Set(["bulletListItem", "numberedListItem"]);
const INDENT = "  ";

function asNodes<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter(
        (node): node is T => Boolean(node) && typeof node === "object",
      )
    : [];
}

function stripScheme(value: string) {
  return value
    .replace(/^(?:https?:\/\/|mailto:)/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function shownHref(href: string, opts: AnnouncementTextOptions) {
  if (/^mailto:/i.test(href)) return href.slice("mailto:".length);
  if (href.startsWith("/") && opts.baseUrl) {
    return `${opts.baseUrl.replace(/\/+$/, "")}${href}`;
  }
  return href;
}

function inlineText(content: unknown, opts: AnnouncementTextOptions): string {
  if (typeof content === "string") return content;
  return asNodes<InlineNode>(content)
    .map((node) => {
      if (node.type === "link") {
        const label = inlineText(node.content, opts);
        const href = typeof node.href === "string" ? node.href.trim() : "";
        if (!opts.withUrls || !href) return label;
        const shown = shownHref(href, opts);
        if (!label.trim()) return shown;
        // A pasted address is its own label: "x.com (https://x.com)" says it twice.
        if (stripScheme(label.trim()) === stripScheme(shown)) return label;
        return `${label} (${shown})`;
      }
      return typeof node.text === "string" ? node.text : "";
    })
    .join("");
}

/** Every line after the first lines up under the first one's text. */
function indentLines(text: string, first: string, rest: string) {
  return text
    .split("\n")
    .map((line, index) => `${index === 0 ? first : rest}${line}`.trimEnd())
    .join("\n");
}

function blockText(block: BlockNode, opts: AnnouncementTextOptions): string {
  if (block.type === "divider") return "—";
  if (block.type === "image") {
    const caption = block.props?.caption;
    return typeof caption === "string" ? caption.trim() : "";
  }
  return inlineText(block.content, opts).trim();
}

/** The blocks of one level, as chunks the caller separates with a blank line. */
function renderLevel(
  blocks: BlockNode[],
  indent: string,
  opts: AnnouncementTextOptions,
): string[] {
  const chunks: string[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];

    if (typeof block.type === "string" && LIST_ITEM_TYPES.has(block.type)) {
      // A run of list items is one chunk: one item per line.
      const lines: string[] = [];
      let number = 0;
      let previous: unknown = null;
      while (
        index < blocks.length &&
        typeof blocks[index].type === "string" &&
        LIST_ITEM_TYPES.has(blocks[index].type as string)
      ) {
        const item = blocks[index];
        let marker = "• ";
        if (item.type === "numberedListItem") {
          number = previous === "numberedListItem" ? number + 1 : 1;
          marker = `${number}. `;
        }
        const text = blockText(item, opts);
        if (text) {
          lines.push(
            indentLines(
              text,
              `${indent}${marker}`,
              `${indent}${" ".repeat(marker.length)}`,
            ),
          );
        }
        lines.push(
          ...renderLevel(asNodes(item.children), indent + INDENT, opts),
        );
        previous = item.type;
        index += 1;
      }
      if (lines.length > 0) chunks.push(lines.join("\n"));
      continue;
    }

    const text = blockText(block, opts);
    if (text) chunks.push(indentLines(text, indent, indent));
    chunks.push(...renderLevel(asNodes(block.children), indent + INDENT, opts));
    index += 1;
  }

  return chunks;
}

/**
 * C3's rules: a blank line between blocks; headings on their own line; "• "
 * and "1. " for list items; links as their text, or "texto (https://…)"
 * with `withUrls`; dividers as "—"; images as their caption, or nothing.
 * Empty paragraphs leave no gap.
 */
export function announcementBlocksToText(
  blocks: unknown[],
  opts: AnnouncementTextOptions,
): string {
  return renderLevel(asNodes(blocks), "", opts).join("\n\n").trim();
}

/** Trailing marks a cut would leave dangling before the "…". */
const DANGLING_END = /[\s,;:.\-–—]+$/;

/**
 * The inbox body: whitespace collapsed, cut on a word boundary so the result,
 * "…" included, fits `COMUNICADO_EXCERPT_MAX`.
 */
export function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= COMUNICADO_EXCERPT_MAX) return flat;

  let cut = flat.slice(0, COMUNICADO_EXCERPT_MAX - 1);
  // Mid-word unless the next character is a space: back up to the last one.
  if (flat[cut.length] !== " ") {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 0) {
      cut = cut.slice(0, lastSpace);
    } else if (/[\uD800-\uDBFF]$/.test(cut)) {
      // One long word: never split an emoji's surrogate pair.
      cut = cut.slice(0, -1);
    }
  }
  return `${cut.replace(DANGLING_END, "")}…`;
}
