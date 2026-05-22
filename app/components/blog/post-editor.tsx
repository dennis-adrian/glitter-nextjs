"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import type { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";

type Props = {
	editor: BlockNoteEditor<any, any, any>;
	readOnly?: boolean;
};

export default function PostEditor({ editor, readOnly = false }: Props) {
	return (
		<div className="bg-white min-h-[400px]">
			<BlockNoteView
				editor={editor}
				editable={!readOnly}
				theme="light"
				formattingToolbar={false}
			/>
		</div>
	);
}
