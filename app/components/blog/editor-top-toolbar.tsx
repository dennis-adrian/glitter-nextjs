"use client";

import type { BlockNoteEditor } from "@blocknote/core";
import {
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Type,
  Undo2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useEditorChange, useEditorSelectionChange } from "@blocknote/react";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { cn } from "@/app/lib/utils";

type Props = {
  editor: BlockNoteEditor<any, any, any>;
  readOnly?: boolean;
};

type BlockStyle =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "quote"
  | "bullet"
  | "numbered";

function readCurrentStyle(editor: BlockNoteEditor<any, any, any>): BlockStyle {
  const block = editor.getTextCursorPosition().block;
  if (block.type === "heading") {
    const level = (block.props as { level?: number }).level ?? 1;
    if (level === 1) return "heading-1";
    if (level === 2) return "heading-2";
    if (level === 3) return "heading-3";
    return "heading-4";
  }
  if (block.type === "quote") return "quote";
  if (block.type === "bulletListItem") return "bullet";
  if (block.type === "numberedListItem") return "numbered";
  return "paragraph";
}

export default function EditorTopToolbar({ editor, readOnly = false }: Props) {
  const [activeStyles, setActiveStyles] = useState<Record<string, unknown>>(
    () => editor.getActiveStyles(),
  );
  const [blockStyle, setBlockStyle] = useState<BlockStyle>(() =>
    readCurrentStyle(editor),
  );

  const slash = editor.dictionary.slash_menu;
  const tooltips = editor.dictionary.formatting_toolbar;
  const styleLabels: Record<BlockStyle, string> = {
    paragraph: slash.paragraph.title,
    "heading-1": slash.heading.title,
    "heading-2": slash.heading_2.title,
    "heading-3": slash.heading_3.title,
    "heading-4": slash.heading_4.title,
    quote: slash.quote.title,
    bullet: slash.bullet_list.title,
    numbered: slash.numbered_list.title,
  };

  useEditorSelectionChange(() => {
    setActiveStyles(editor.getActiveStyles());
    setBlockStyle(readCurrentStyle(editor));
  }, editor);

  useEditorChange(() => {
    setActiveStyles(editor.getActiveStyles());
    setBlockStyle(readCurrentStyle(editor));
  }, editor);

  const applyStyle = useCallback(
    (style: BlockStyle) => {
      const block = editor.getTextCursorPosition().block;
      if (style === "paragraph") {
        editor.updateBlock(block, { type: "paragraph" });
      } else if (style === "heading-1") {
        editor.updateBlock(block, { type: "heading", props: { level: 1 } });
      } else if (style === "heading-2") {
        editor.updateBlock(block, { type: "heading", props: { level: 2 } });
      } else if (style === "heading-3") {
        editor.updateBlock(block, { type: "heading", props: { level: 3 } });
      } else if (style === "heading-4") {
        editor.updateBlock(block, { type: "heading", props: { level: 4 } });
      } else if (style === "quote") {
        editor.updateBlock(block, { type: "quote" });
      } else if (style === "bullet") {
        editor.updateBlock(block, { type: "bulletListItem" });
      } else if (style === "numbered") {
        editor.updateBlock(block, { type: "numberedListItem" });
      }
      editor.focus();
    },
    [editor],
  );

  const toggleInline = useCallback(
    (style: "bold" | "italic" | "strike" | "code") => {
      editor.toggleStyles({ [style]: true } as Record<string, true>);
      editor.focus();
    },
    [editor],
  );

  const insertLink = useCallback(() => {
    const existing = editor.getSelectedLinkUrl();
    const url = window.prompt("URL del enlace", existing ?? "https://");
    if (!url) return;
    editor.createLink(url);
    editor.focus();
  }, [editor]);

  const buttonClass = "h-8 w-8 shrink-0 p-0";
  const activeClass = "bg-muted";

  return (
    <div className="border-t">
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 md:flex-wrap md:overflow-x-visible">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={buttonClass}
          onClick={() => editor.undo()}
          disabled={readOnly}
          title="Deshacer"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={buttonClass}
          onClick={() => editor.redo()}
          disabled={readOnly}
          title="Rehacer"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px shrink-0 bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2"
              disabled={readOnly}
            >
              <Type className="h-4 w-4" />
              <span className="hidden text-xs sm:inline">
                {styleLabels[blockStyle]}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(
              [
                "paragraph",
                "heading-1",
                "heading-2",
                "heading-3",
                "heading-4",
                "quote",
                "bullet",
                "numbered",
              ] as BlockStyle[]
            ).map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => applyStyle(s)}
                className={cn(blockStyle === s && "bg-muted")}
              >
                {styleLabels[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-5 w-px shrink-0 bg-border" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(buttonClass, Boolean(activeStyles.bold) && activeClass)}
          onClick={() => toggleInline("bold")}
          disabled={readOnly}
          title={tooltips.bold.tooltip}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            buttonClass,
            Boolean(activeStyles.italic) && activeClass,
          )}
          onClick={() => toggleInline("italic")}
          disabled={readOnly}
          title={tooltips.italic.tooltip}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            buttonClass,
            Boolean(activeStyles.strike) && activeClass,
          )}
          onClick={() => toggleInline("strike")}
          disabled={readOnly}
          title={tooltips.strike.tooltip}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(buttonClass, Boolean(activeStyles.code) && activeClass)}
          onClick={() => toggleInline("code")}
          disabled={readOnly}
          title={tooltips.code.tooltip}
        >
          <Code className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px shrink-0 bg-border" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={buttonClass}
          onClick={insertLink}
          disabled={readOnly}
          title={tooltips.link.tooltip}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px shrink-0 bg-border" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(buttonClass, blockStyle === "bullet" && activeClass)}
          onClick={() => applyStyle("bullet")}
          disabled={readOnly}
          title={styleLabels.bullet}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(buttonClass, blockStyle === "numbered" && activeClass)}
          onClick={() => applyStyle("numbered")}
          disabled={readOnly}
          title={styleLabels.numbered}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
