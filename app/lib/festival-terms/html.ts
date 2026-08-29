import { isAllowedRichTextUri } from "@/app/lib/rich-text/sanitize";

type InlineNode = {
  type?: string;
  text?: string;
  href?: string;
  styles?: { bold?: boolean; italic?: boolean };
  content?: InlineNode[];
};

type BlockNode = {
  type?: string;
  props?: {
    level?: number;
    url?: string;
    name?: string;
    previewWidth?: number;
  };
  content?: InlineNode[];
  children?: BlockNode[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInline(nodes: InlineNode[] | undefined): string {
  if (!nodes?.length) return "";
  return nodes
    .map((node) => {
      if (node.type === "link") {
        const inner = renderInline(node.content);
        if (node.href && isAllowedRichTextUri(node.href)) {
          return `<a href="${escapeHtml(node.href)}">${inner}</a>`;
        }
        return inner;
      }
      let text = escapeHtml(node.text ?? "");
      if (node.styles?.bold) text = `<strong>${text}</strong>`;
      if (node.styles?.italic) text = `<em>${text}</em>`;
      return text;
    })
    .join("");
}

function wrapListItems(blocks: BlockNode[], type: "ul" | "ol"): string {
  if (blocks.length === 0) return "";
  const items = blocks
    .map((block) => {
      const nested = groupBlocks(block.children ?? []);
      return `<li>${renderInline(block.content)}${nested}</li>`;
    })
    .join("");
  return `<${type}>${items}</${type}>`;
}

function groupBlocks(blocks: BlockNode[]): string {
  let html = "";
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.type === "bulletListItem") {
      const items: BlockNode[] = [];
      while (blocks[index]?.type === "bulletListItem") {
        items.push(blocks[index]);
        index += 1;
      }
      html += wrapListItems(items, "ul");
      continue;
    }
    if (block.type === "numberedListItem") {
      const items: BlockNode[] = [];
      while (blocks[index]?.type === "numberedListItem") {
        items.push(blocks[index]);
        index += 1;
      }
      html += wrapListItems(items, "ol");
      continue;
    }
    html += renderBlock(block);
    index += 1;
  }
  return html;
}

function renderBlock(block: BlockNode): string {
  if (block.type === "image") {
    const url = typeof block.props?.url === "string" ? block.props.url : "";
    const alt = typeof block.props?.name === "string" ? block.props.name : "";
    const allowedUrl = url && isAllowedRichTextUri(url) ? url : "";
    let html = allowedUrl
      ? `<img src="${escapeHtml(allowedUrl)}" alt="${escapeHtml(alt)}"`
      : `<img alt="${escapeHtml(alt)}"`;
    if (typeof block.props?.previewWidth === "number") {
      html += ` width="${block.props.previewWidth}"`;
    }
    return `${html} />`;
  }
  if (block.type === "divider") {
    return "<hr />";
  }

  const inner = renderInline(block.content);
  if (block.type === "heading") {
    const level = block.props?.level === 3 ? 3 : block.props?.level === 1 ? 1 : 2;
    return `<h${level}>${inner}</h${level}>`;
  }
  if (block.type === "paragraph") {
    return inner ? `<p>${inner}</p>` : "";
  }
  return inner;
}

export function blocksToSeedHtml(blocks: unknown): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return groupBlocks(blocks as BlockNode[]);
}

const VISIBLE_MEDIA_BLOCK_TYPES = new Set(["image", "divider"]);

function inlineNodesHaveVisibleText(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const value = node as InlineNode;
    if (typeof value.text === "string" && value.text.trim().length > 0) {
      return true;
    }
    if (inlineNodesHaveVisibleText(value.content)) return true;
  }
  return false;
}

/**
 * Sync emptiness check aligned with `renderTermsSectionHtml`:
 * empty / non-array bodies yield ""; empty paragraphs yield no text;
 * media blocks (image/divider) count as visible (BlockNote HTML path).
 */
export function richTextBodyHasVisibleContent(bodyJson: unknown): boolean {
  if (!Array.isArray(bodyJson) || bodyJson.length === 0) return false;

  function walk(blocks: unknown[]): boolean {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const node = block as BlockNode & { type?: string };
      if (typeof node.type === "string" && VISIBLE_MEDIA_BLOCK_TYPES.has(node.type)) {
        return true;
      }
      if (inlineNodesHaveVisibleText(node.content)) return true;
      if (Array.isArray(node.children) && walk(node.children)) return true;
    }
    return false;
  }

  return walk(bodyJson);
}
