type TextStyles = {
  bold?: boolean;
  italic?: boolean;
};

type TextNode = {
  type: "text";
  text: string;
  styles: TextStyles;
};

type LinkNode = {
  type: "link";
  href: string;
  content: TextNode[];
};

type InlineNode = TextNode | LinkNode;

type BlockNode = {
  id: string;
  type: "paragraph" | "heading" | "bulletListItem" | "numberedListItem";
  props: {
    textColor: "default";
    backgroundColor: "default";
    textAlignment: "left";
    level?: 2 | 3;
  };
  content: InlineNode[];
  children: BlockNode[];
};

let seedBlockId = 0;

function nextId() {
  seedBlockId += 1;
  return `terms-seed-${seedBlockId}`;
}

export function resetSeedBlockIds() {
  seedBlockId = 0;
}

function textNode(text: string, styles: TextStyles = {}): TextNode {
  return { type: "text", text, styles };
}

function contentOf(parts: Array<string | InlineNode>): InlineNode[] {
  return parts.map((part) => (typeof part === "string" ? textNode(part) : part));
}

const defaultProps = {
  textColor: "default" as const,
  backgroundColor: "default" as const,
  textAlignment: "left" as const,
};

export function bold(text: string): TextNode {
  return textNode(text, { bold: true });
}

export function italic(text: string): TextNode {
  return textNode(text, { italic: true });
}

export function link(href: string, text: string): LinkNode {
  return {
    type: "link",
    href,
    content: [textNode(text)],
  };
}

export function paragraph(...parts: Array<string | InlineNode>): BlockNode {
  return {
    id: nextId(),
    type: "paragraph",
    props: defaultProps,
    content: contentOf(parts),
    children: [],
  };
}

export function heading(
  level: 2 | 3,
  ...parts: Array<string | InlineNode>
): BlockNode {
  return {
    id: nextId(),
    type: "heading",
    props: { ...defaultProps, level },
    content: contentOf(parts),
    children: [],
  };
}

export function bullet(
  parts: Array<string | InlineNode>,
  children: BlockNode[] = [],
): BlockNode {
  return {
    id: nextId(),
    type: "bulletListItem",
    props: defaultProps,
    content: contentOf(parts),
    children,
  };
}

export function numbered(
  parts: Array<string | InlineNode>,
  children: BlockNode[] = [],
): BlockNode {
  return {
    id: nextId(),
    type: "numberedListItem",
    props: defaultProps,
    content: contentOf(parts),
    children,
  };
}

export type { BlockNode };
