import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
} from "@blocknote/core";

const {
  paragraph,
  bulletListItem,
  numberedListItem,
  quote,
  checkListItem,
  codeBlock,
  divider,
  image,
} = defaultBlockSpecs;

export const COMPACT_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "quote",
] as const;

export const ARTICLE_BLOCK_TYPES = [
  ...COMPACT_BLOCK_TYPES,
  "checkListItem",
  "codeBlock",
  "divider",
  "image",
] as const;

export type EditorVariant = "compact" | "article";

export const compactEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    heading: createHeadingBlockSpec({ levels: [2, 3] }),
    bulletListItem,
    numberedListItem,
    quote,
  },
});

export const articleEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3, 4] }),
    bulletListItem,
    numberedListItem,
    quote,
    checkListItem,
    codeBlock,
    divider,
    image,
  },
});

export function schemaForVariant(variant: EditorVariant) {
  return variant === "article" ? articleEditorSchema : compactEditorSchema;
}

export function allowedBlockTypes(variant: EditorVariant): readonly string[] {
  return variant === "article" ? ARTICLE_BLOCK_TYPES : COMPACT_BLOCK_TYPES;
}

export function allowedHeadingLevels(variant: EditorVariant): number[] {
  return variant === "article" ? [1, 2, 3, 4] : [2, 3];
}

type WalkableBlock = {
  type?: unknown;
  props?: { level?: unknown };
  children?: unknown;
};

function asBlockArray(value: unknown): WalkableBlock[] {
  return Array.isArray(value) ? (value as WalkableBlock[]) : [];
}

export function collectBlockTypes(blocks: unknown): string[] {
  const types: string[] = [];

  function walk(nodes: WalkableBlock[]) {
    for (const node of nodes) {
      if (typeof node?.type === "string") {
        types.push(node.type);
      }
      if (Array.isArray(node?.children)) {
        walk(node.children as WalkableBlock[]);
      }
    }
  }

  walk(asBlockArray(blocks));
  return types;
}

export function disallowedBlockTypes(
  blocks: unknown,
  variant: EditorVariant,
): string[] {
  const allowed = new Set(allowedBlockTypes(variant));
  return [...new Set(collectBlockTypes(blocks).filter((type) => !allowed.has(type)))];
}

export function headingLevelsIn(blocks: unknown): number[] {
  const levels: number[] = [];

  function walk(nodes: WalkableBlock[]) {
    for (const node of nodes) {
      if (node?.type === "heading" && typeof node.props?.level === "number") {
        levels.push(node.props.level);
      }
      if (Array.isArray(node?.children)) {
        walk(node.children as WalkableBlock[]);
      }
    }
  }

  walk(asBlockArray(blocks));
  return levels;
}

export function assertCompactDocument(
  blocks: unknown,
  documentLabel = "este documento",
): void {
  const extra = disallowedBlockTypes(blocks, "compact");
  if (extra.length > 0) {
    throw new Error(
      `Bloques no permitidos en ${documentLabel}: ${extra.join(", ")}`,
    );
  }
  const levels = headingLevelsIn(blocks);
  const allowed = new Set(allowedHeadingLevels("compact"));
  if (levels.some((level) => !allowed.has(level))) {
    throw new Error(
      `Solo se admiten títulos de nivel 2 y 3 en ${documentLabel}`,
    );
  }
}
