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
	| "quote"
	| "bullet"
	| "numbered";

const STYLE_LABELS: Record<BlockStyle, string> = {
	paragraph: "Texto",
	"heading-1": "Título 1",
	"heading-2": "Título 2",
	"heading-3": "Título 3",
	quote: "Cita",
	bullet: "Lista",
	numbered: "Lista numerada",
};

function readCurrentStyle(editor: BlockNoteEditor<any, any, any>): BlockStyle {
	const block = editor.getTextCursorPosition().block;
	if (block.type === "heading") {
		const level = (block.props as { level?: number }).level ?? 1;
		if (level === 1) return "heading-1";
		if (level === 2) return "heading-2";
		return "heading-3";
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

	const buttonClass = "h-8 w-8 p-0";
	const activeClass = "bg-muted";

	return (
		<div className="sticky top-0 z-30 -mx-4 md:mx-0 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/70">
			<div className="flex flex-wrap items-center gap-1 px-4 py-2">
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

				<div className="mx-1 h-5 w-px bg-border" />

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-8 gap-1 px-2"
							disabled={readOnly}
						>
							<Type className="h-4 w-4" />
							<span className="hidden text-xs sm:inline">
								{STYLE_LABELS[blockStyle]}
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
								{STYLE_LABELS[s]}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<div className="mx-1 h-5 w-px bg-border" />

				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(buttonClass, Boolean(activeStyles.bold) && activeClass)}
					onClick={() => toggleInline("bold")}
					disabled={readOnly}
					title="Negrita"
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
					title="Cursiva"
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
					title="Tachado"
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
					title="Código en línea"
				>
					<Code className="h-4 w-4" />
				</Button>

				<div className="mx-1 h-5 w-px bg-border" />

				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={buttonClass}
					onClick={insertLink}
					disabled={readOnly}
					title="Enlace"
				>
					<LinkIcon className="h-4 w-4" />
				</Button>

				<div className="mx-1 h-5 w-px bg-border" />

				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(buttonClass, blockStyle === "bullet" && activeClass)}
					onClick={() => applyStyle("bullet")}
					disabled={readOnly}
					title="Lista con viñetas"
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
					title="Lista numerada"
				>
					<ListOrdered className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
