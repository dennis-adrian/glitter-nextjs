"use client";

import { filterSuggestionItems } from "@blocknote/core";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { es } from "@blocknote/core/locales";
import type { Block } from "@blocknote/core";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

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
  uploadFile?: (file: File) => Promise<string>;
  className?: string;
};

function allowSlashItem(
  item: { title: string; aliases?: string[] },
  variant: EditorVariant,
) {
  const aliases = new Set((item.aliases ?? []).map((alias) => alias.toLowerCase()));
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

export default function RichTextEditorInner({
  variant,
  initialContent,
  onChange,
  placeholder,
  editable = true,
  uploadFile,
  className,
}: RichTextEditorInnerProps) {
  const editor = useCreateBlockNote({
    schema: schemaForVariant(variant) as never,
    dictionary: {
      ...es,
      placeholders: {
        ...es.placeholders,
        emptyDocument: placeholder ?? es.placeholders.default,
      },
    },
    initialContent: Array.isArray(initialContent)
      ? (initialContent as Block[])
      : undefined,
    uploadFile: variant === "article" ? uploadFile : undefined,
  });

  return (
    <div
      className={cn(
        "min-h-[220px] rounded-md border bg-background px-2 py-1",
        className,
      )}
    >
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        slashMenu={false}
        onChange={async () => {
          const html = await editor.blocksToHTMLLossy(editor.document);
          onChange?.(editor.document, html);
        }}
      >
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
      </BlockNoteView>
    </div>
  );
}
