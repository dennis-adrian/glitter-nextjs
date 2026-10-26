"use client";

import { filterSuggestionItems } from "@blocknote/core";
import {
  DragHandleMenu,
  FilePanelController,
  getDefaultReactSlashMenuItems,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
  useDictionary,
  type SideMenuProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { es } from "@blocknote/core/locales";
import type { Block } from "@blocknote/core";
import { useTheme } from "next-themes";

import "@blocknote/shadcn/style.css";

import AnnouncementFilePanel from "@/app/components/comunicados/admin/announcement-file-panel";
import AnnouncementToolbar, {
  clampHeadingLevels,
  tabWouldNestTooDeep,
  type AnnouncementEditor,
} from "@/app/components/comunicados/admin/announcement-toolbar";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  allowedHeadingLevels,
  schemaForVariant,
  type EditorVariant,
} from "@/app/lib/rich-text/schemas";
import { cn } from "@/app/lib/utils";

type RichTextEditorInnerProps = {
  variant: EditorVariant;
  initialContent?: unknown;
  onChange?: (json: unknown, html: string) => void;
  placeholder?: string;
  editable?: boolean;
  uploadFile?: (file: File, blockId?: string) => Promise<string>;
  className?: string;
};

/**
 * A comunicado's upload as BlockNote calls it. A paste or a drop (C4) first
 * inserts an image and passes its id, and BlockNote 0.54 shows "Loading..."
 * in it from then on (`createFileBlockWrapper`). After a refusal, which the
 * upload has already toasted, the image turns back into an empty line
 * instead. The upload panel passes no id and shows the refusal itself.
 */
function announcementUploadFile(
  uploadFile: (file: File, blockId?: string) => Promise<string>,
) {
  return async (file: File, blockId?: string) => {
    try {
      return await uploadFile(file, blockId);
    } catch (failure) {
      if (!blockId) throw failure;
      return { type: "paragraph" };
    }
  };
}

function allowSlashItem(
  item: { title: string; aliases?: string[] },
  variant: EditorVariant,
) {
  const aliases = new Set(
    (item.aliases ?? []).map((alias) => alias.toLowerCase()),
  );
  if (aliases.has("collapsable")) return false;

  const headingLevel = aliases.has("h1")
    ? 1
    : aliases.has("h2")
      ? 2
      : aliases.has("h3")
        ? 3
        : aliases.has("h4")
          ? 4
          : aliases.has("h5")
            ? 5
            : aliases.has("h6")
              ? 6
              : null;

  if (headingLevel != null) {
    return allowedHeadingLevels(variant).includes(headingLevel);
  }

  return true;
}

/**
 * The block menu without "Colores": a comunicado resets colours on save, so
 * offering them would only lose the admin's work.
 */
function AnnouncementDragHandleMenu() {
  const dictionary = useDictionary();
  return (
    <DragHandleMenu>
      <RemoveBlockItem>
        {dictionary.drag_handle.delete_menuitem}
      </RemoveBlockItem>
    </DragHandleMenu>
  );
}

function AnnouncementSideMenu(props: SideMenuProps) {
  return <SideMenu {...props} dragHandleMenu={AnnouncementDragHandleMenu} />;
}

export default function RichTextEditorInner({
  variant,
  initialContent,
  onChange,
  placeholder,
  editable = true,
  uploadFile,
  className,
}: RichTextEditorInnerProps) {
  const { resolvedTheme } = useTheme();
  const isAnnouncement = variant === "announcement";
  // Comunicados offer "/" on desktop only, as the blog does; phones format
  // with the toolbar.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const showSlashMenu = !isAnnouncement || isDesktop;
  const editor = useCreateBlockNote({
    schema: schemaForVariant(variant) as never,
    dictionary: {
      ...es,
      placeholders: {
        ...es.placeholders,
        emptyDocument: placeholder ?? es.placeholders.default,
      },
    },
    initialContent:
      Array.isArray(initialContent) && initialContent.length > 0
        ? (initialContent as Block[])
        : undefined,
    // Comunicados upload JPEG and PNG images from their own panel, or a
    // paste or a drop (C4).
    uploadFile:
      variant === "article"
        ? uploadFile
        : isAnnouncement && uploadFile
          ? announcementUploadFile(uploadFile)
          : undefined,
    // A pasted h1 or h4–h6 lands with its own level: comunicados show it
    // as the Título or Subtítulo it will be saved as.
    pasteHandler: isAnnouncement
      ? ({ editor: pastedInto, defaultPasteHandler }) => {
          const handled = defaultPasteHandler();
          clampHeadingLevels(pastedInto as unknown as AnnouncementEditor);
          return handled;
        }
      : undefined,
  });

  const view = (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      slashMenu={false}
      // Comunicados format from `AnnouncementToolbar` alone.
      formattingToolbar={!isAnnouncement}
      sideMenu={!isAnnouncement}
      // Its default has an "Embed" tab, which would take any site's image.
      filePanel={!isAnnouncement}
      onChange={async () => {
        const html = await editor.blocksToHTMLLossy(editor.document);
        onChange?.(editor.document, html);
      }}
    >
      {showSlashMenu && (
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              getDefaultReactSlashMenuItems(editor).filter((item) =>
                allowSlashItem(item, variant),
              ),
              query,
            )
          }
        />
      )}
      {isAnnouncement && <SideMenuController sideMenu={AnnouncementSideMenu} />}
      {isAnnouncement && (
        <FilePanelController filePanel={AnnouncementFilePanel} />
      )}
    </BlockNoteView>
  );

  if (!isAnnouncement) {
    return (
      <div
        className={cn(
          "min-h-[220px] rounded-md border bg-background px-2 py-1",
          className,
        )}
      >
        {view}
      </div>
    );
  }

  return (
    <div
      className={cn("min-h-[220px] rounded-md border bg-background", className)}
      // Tab nests the block under the one above. A comunicado's lists stop at
      // two levels, so past that Tab does nothing instead of nesting a level
      // every rendering would lift.
      onKeyDownCapture={(event) => {
        if (event.key !== "Tab" || event.shiftKey) return;
        // Only inside the text: Tab on the toolbar moves focus as usual.
        if (!editor.domElement?.contains(event.target as Node)) return;
        if (tabWouldNestTooDeep(editor as unknown as AnnouncementEditor)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <AnnouncementToolbar
        // The editor was made from `announcementEditorSchema`; the variant
        // switch above types it as any schema.
        editor={editor as unknown as AnnouncementEditor}
        readOnly={!editable}
      />
      <div className="px-2 py-1">{view}</div>
    </div>
  );
}
