"use client";

import "@blocknote/shadcn/style.css";

import type { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import { useTheme } from "next-themes";

import { useMediaQuery } from "@/app/hooks/use-media-query";

type Props = {
  editor: BlockNoteEditor<any, any, any>;
  readOnly?: boolean;
};

export default function PostEditor({ editor, readOnly = false }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { resolvedTheme } = useTheme();
  return (
    <div className="bg-card min-h-[400px]">
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        formattingToolbar={false}
        slashMenu={isDesktop}
      />
    </div>
  );
}
