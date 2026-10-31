import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
  defaultStyleSpecs,
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
  toggleListItem,
  table,
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

/**
 * Blog posts are the widest surface: everything `article` allows, plus
 * toggles and tables. Kept separate from `article` rather than widening it,
 * because `article` also drives the festival terms editor, which should not
 * grow tables just because the blog wants them.
 */
export const BLOG_BLOCK_TYPES = [
  ...ARTICLE_BLOCK_TYPES,
  "toggleListItem",
  "table",
] as const;

/**
 * Comunicados: what survives an email client. No tables, toggles, check lists
 * or code. Images are uploaded to Glitter (`normalizeAnnouncementDoc`).
 */
export const ANNOUNCEMENT_BLOCK_TYPES = [
  ...COMPACT_BLOCK_TYPES,
  "divider",
  "image",
] as const;

export type EditorVariant = "compact" | "article" | "blog" | "announcement";

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

export const blogEditorSchema = BlockNoteSchema.create({
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
    toggleListItem,
    table,
  },
});

/**
 * Bold and italic are the only styles, so the editor never shows underline,
 * strike, code or a colour that the email would drop. Toggle headings are off
 * for the same reason (they export as `<details>`), and a heading made
 * without a level is a "Título". The image is the spec article and blog use;
 * the server keeps only its address and caption.
 */
export const announcementEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    heading: createHeadingBlockSpec({
      levels: [2, 3],
      defaultLevel: 2,
      allowToggleHeadings: false,
    }),
    bulletListItem,
    numberedListItem,
    quote,
    divider,
    image,
  },
  styleSpecs: {
    bold: defaultStyleSpecs.bold,
    italic: defaultStyleSpecs.italic,
  },
});

export function schemaForVariant(variant: EditorVariant) {
  if (variant === "blog") return blogEditorSchema;
  if (variant === "announcement") return announcementEditorSchema;
  return variant === "article" ? articleEditorSchema : compactEditorSchema;
}

export function allowedBlockTypes(variant: EditorVariant): readonly string[] {
  if (variant === "blog") return BLOG_BLOCK_TYPES;
  if (variant === "announcement") return ANNOUNCEMENT_BLOCK_TYPES;
  return variant === "article" ? ARTICLE_BLOCK_TYPES : COMPACT_BLOCK_TYPES;
}

export function allowedHeadingLevels(variant: EditorVariant): number[] {
  return variant === "compact" || variant === "announcement"
    ? [2, 3]
    : [1, 2, 3, 4];
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
  return [
    ...new Set(collectBlockTypes(blocks).filter((type) => !allowed.has(type))),
  ];
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

function assertDocumentFits(
  blocks: unknown,
  variant: "compact" | "announcement",
  documentLabel: string,
): void {
  const extra = disallowedBlockTypes(blocks, variant);
  if (extra.length > 0) {
    throw new Error(
      `Bloques no permitidos en ${documentLabel}: ${extra.join(", ")}`,
    );
  }
  const levels = headingLevelsIn(blocks);
  const allowed = new Set(allowedHeadingLevels(variant));
  if (levels.some((level) => !allowed.has(level))) {
    throw new Error(
      `Solo se admiten títulos de nivel 2 y 3 en ${documentLabel}`,
    );
  }
}

export function assertCompactDocument(
  blocks: unknown,
  documentLabel = "este documento",
): void {
  assertDocumentFits(blocks, "compact", documentLabel);
}

/**
 * A backstop for the renderer: comunicados reach it already checked by
 * `normalizeAnnouncementDoc`, which explains a refusal to the admin.
 */
export function assertAnnouncementDocument(
  blocks: unknown,
  documentLabel = "un comunicado",
): void {
  assertDocumentFits(blocks, "announcement", documentLabel);
}
