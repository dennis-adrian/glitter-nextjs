"use client";

import {
  insertOrUpdateBlockForSlashMenu,
  type BlockNoteEditor,
} from "@blocknote/core";
import { FilePanelExtension } from "@blocknote/core/extensions";
import { useEditorChange, useEditorSelectionChange } from "@blocknote/react";
import {
  Bold,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  type LucideIcon,
  Minus,
  TextQuote,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/app/components/ui/button";
import type { announcementEditorSchema } from "@/app/lib/rich-text/schemas";
import { cn } from "@/app/lib/utils";
import {
  ANNOUNCEMENT_MAX_DEPTH,
  COMUNICADO_MAX_IMAGES,
} from "@/app/lib/comunicados/definitions";
import { countComunicadoImages } from "@/app/lib/comunicados/images";

/**
 * The comunicado editor's only formatting controls (C1): the pieces of the
 * blog's `EditorTopToolbar` that survive an email, so no strike, code,
 * colours or undo row. BlockNote's floating toolbar is off for this variant.
 * "Imagen" opens the upload panel (C4) and stops at the six images a
 * comunicado may have.
 */

export type AnnouncementEditor = BlockNoteEditor<
  typeof announcementEditorSchema.blockSchema,
  typeof announcementEditorSchema.inlineContentSchema,
  typeof announcementEditorSchema.styleSchema
>;

type Props = {
  editor: AnnouncementEditor;
  readOnly?: boolean;
};

type BlockKind =
  | "paragraph"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "quote"
  | "image";

/** Blocks a button turns the current one into, and back to a paragraph. */
const BLOCK_TARGETS = {
  h2: { type: "heading", props: { level: 2 } },
  h3: { type: "heading", props: { level: 3 } },
  bullet: { type: "bulletListItem" },
  numbered: { type: "numberedListItem" },
  quote: { type: "quote" },
} as const;

/**
 * Título (2) or Subtítulo (3). BlockNote parses a pasted h1 or h4–h6, and
 * Markdown's "#", whatever the schema's levels; `normalizeAnnouncementDoc`
 * saves them as the nearer of the two, and the editor shows them so.
 */
function savedHeadingLevel(level: number): 2 | 3 {
  return level >= 3 ? 3 : 2;
}

type AnnouncementBlockNode = ReturnType<
  AnnouncementEditor["getTextCursorPosition"]
>["block"];

/** Levels below a block: 0 without children. */
function subtreeHeight(block: AnnouncementBlockNode): number {
  return block.children.reduce(
    (height, child) => Math.max(height, 1 + subtreeHeight(child)),
    0,
  );
}

/**
 * Whether Tab would nest the selected blocks past the levels a comunicado
 * keeps. Tab moves each selected block, children included, under the block
 * above: one level deeper for all of them.
 */
export function tabWouldNestTooDeep(editor: AnnouncementEditor) {
  const blocks = editor.getSelection()?.blocks ?? [
    editor.getTextCursorPosition().block,
  ];
  return blocks.some((block) => {
    let depth = 1;
    let parent = editor.getParentBlock(block);
    while (parent) {
      depth += 1;
      parent = editor.getParentBlock(parent);
    }
    return depth + subtreeHeight(block) >= ANNOUNCEMENT_MAX_DEPTH;
  });
}

/**
 * Gives every heading the level it will be saved with, in one step. The step
 * stays out of the undo history: undo takes back the paste or the drop that
 * brought the heading, rather than the level, which would only be clamped
 * again.
 */
export function clampHeadingLevels(editor: AnnouncementEditor) {
  const updates: { id: string; level: 2 | 3 }[] = [];
  const walk = (blocks: AnnouncementEditor["document"]) => {
    for (const block of blocks) {
      if (block.type === "heading") {
        const level: number = block.props.level;
        const saved = savedHeadingLevel(level);
        if (saved !== level) updates.push({ id: block.id, level: saved });
      }
      walk(block.children);
    }
  };
  walk(editor.document);
  if (updates.length === 0) return;
  editor.transact((tr) => {
    tr.setMeta("addToHistory", false);
    for (const { id, level } of updates) {
      editor.updateBlock(id, { props: { level } });
    }
  });
}

function readBlockKind(editor: AnnouncementEditor): BlockKind {
  const block = editor.getTextCursorPosition().block;
  if (block.type === "heading") {
    return savedHeadingLevel(block.props.level) === 3 ? "h3" : "h2";
  }
  if (block.type === "bulletListItem") return "bullet";
  if (block.type === "numberedListItem") return "numbered";
  if (block.type === "quote") return "quote";
  if (block.type === "image") return "image";
  return "paragraph";
}

function ToolbarButton({
  label,
  icon: Icon,
  active = false,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 w-8 shrink-0 p-0", active && "bg-muted")}
      // Keeps the editor's selection: a click would otherwise blur it first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function Separator() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

export default function AnnouncementToolbar({
  editor,
  readOnly = false,
}: Props) {
  const [activeStyles, setActiveStyles] = useState<Record<string, unknown>>(
    () => editor.getActiveStyles(),
  );
  const [blockKind, setBlockKind] = useState<BlockKind>(() =>
    readBlockKind(editor),
  );
  const [imageCount, setImageCount] = useState(() =>
    countComunicadoImages(editor.document),
  );

  const refresh = useCallback(() => {
    setActiveStyles(editor.getActiveStyles());
    setBlockKind(readBlockKind(editor));
    setImageCount(countComunicadoImages(editor.document));
  }, [editor]);
  useEditorSelectionChange(refresh, editor);
  useEditorChange(refresh, editor);

  const toggleStyle = useCallback(
    (style: "bold" | "italic") => {
      editor.toggleStyles({ [style]: true });
      editor.focus();
    },
    [editor],
  );

  /** A second press on the active kind turns the block back into a paragraph. */
  const toggleBlock = useCallback(
    (kind: keyof typeof BLOCK_TARGETS) => {
      const current = readBlockKind(editor);
      // Turning an image into text would lose it.
      if (current === "image") return;
      const block = editor.getTextCursorPosition().block;
      editor.updateBlock(
        block,
        current === kind ? { type: "paragraph" } : BLOCK_TARGETS[kind],
      );
      editor.focus();
    },
    [editor],
  );

  const insertLink = useCallback(() => {
    const collapsed = editor.transact((tr) => tr.selection.empty);
    // A selected image or divider, or a selection with no text in it, would
    // be replaced by the link's text: there is nothing to link.
    if (!collapsed && !editor.getSelectedText()) return;
    const existing = editor.getSelectedLinkUrl();
    const typed = window.prompt("Dirección del enlace", existing ?? "https://");
    const url = typed?.trim();
    if (!url || url === "https://") return;
    // With nothing selected, the address itself becomes the link's text.
    editor.createLink(url, collapsed ? url : undefined);
    editor.focus();
  }, [editor]);

  const insertDivider = useCallback(() => {
    const block = editor.getTextCursorPosition().block;
    if (block.content === undefined) {
      // The cursor sits on a divider: add the new one after it.
      editor.insertBlocks([{ type: "divider" }], block, "after");
    } else {
      // Replaces an empty line, or goes below the current one, and moves the
      // cursor to the next line with text, as the "/" menu does.
      insertOrUpdateBlockForSlashMenu(editor, { type: "divider" });
    }
    editor.focus();
  }, [editor]);

  /** An empty image block, with the upload panel open on it, as "/" does. */
  const insertImage = useCallback(() => {
    const block = editor.getTextCursorPosition().block;
    const inserted =
      block.content === undefined
        ? // The cursor sits on a divider or an image: add it after.
          editor.insertBlocks([{ type: "image" }], block, "after")[0]
        : insertOrUpdateBlockForSlashMenu(editor, { type: "image" });
    editor.focus();
    // After the insert: any change to the document closes the panel.
    editor.getExtension(FilePanelExtension)?.showMenu(inserted.id);
  }, [editor]);

  return (
    <div
      role="toolbar"
      aria-label="Formato del texto"
      className="flex flex-wrap items-center gap-1 rounded-t-md border-b bg-muted/30 px-1 py-1"
    >
      <ToolbarButton
        label="Negrita"
        icon={Bold}
        active={Boolean(activeStyles.bold)}
        disabled={readOnly}
        onClick={() => toggleStyle("bold")}
      />
      <ToolbarButton
        label="Cursiva"
        icon={Italic}
        active={Boolean(activeStyles.italic)}
        disabled={readOnly}
        onClick={() => toggleStyle("italic")}
      />
      <ToolbarButton
        label="Enlace"
        icon={LinkIcon}
        disabled={readOnly}
        onClick={insertLink}
      />
      <Separator />
      <ToolbarButton
        label="Título"
        icon={Heading2}
        active={blockKind === "h2"}
        disabled={readOnly}
        onClick={() => toggleBlock("h2")}
      />
      <ToolbarButton
        label="Subtítulo"
        icon={Heading3}
        active={blockKind === "h3"}
        disabled={readOnly}
        onClick={() => toggleBlock("h3")}
      />
      <Separator />
      <ToolbarButton
        label="Lista"
        icon={List}
        active={blockKind === "bullet"}
        disabled={readOnly}
        onClick={() => toggleBlock("bullet")}
      />
      <ToolbarButton
        label="Lista numerada"
        icon={ListOrdered}
        active={blockKind === "numbered"}
        disabled={readOnly}
        onClick={() => toggleBlock("numbered")}
      />
      <ToolbarButton
        label="Cita"
        icon={TextQuote}
        active={blockKind === "quote"}
        disabled={readOnly}
        onClick={() => toggleBlock("quote")}
      />
      <ToolbarButton
        label="Separador"
        icon={Minus}
        disabled={readOnly}
        onClick={insertDivider}
      />
      <ToolbarButton
        label="Imagen"
        icon={ImageIcon}
        disabled={
          readOnly || !editor.uploadFile || imageCount >= COMUNICADO_MAX_IMAGES
        }
        onClick={insertImage}
      />
    </div>
  );
}
