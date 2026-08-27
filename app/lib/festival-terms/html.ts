type InlineNode = {
  type?: string;
  text?: string;
  href?: string;
  styles?: { bold?: boolean; italic?: boolean };
  content?: InlineNode[];
};

type BlockNode = {
  type?: string;
  props?: { level?: number };
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
      if (node.type === "link" && node.href) {
        return `<a href="${escapeHtml(node.href)}">${renderInline(node.content)}</a>`;
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
