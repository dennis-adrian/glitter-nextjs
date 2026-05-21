"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { useCallback, useEffect, useRef } from "react";
import { es as esDictionary } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";

import { useUploadThing } from "@/app/vendors/uploadthing";

type Props = {
	initialContent?: unknown;
	onChange: (blocks: unknown, html: string) => void;
	readOnly?: boolean;
};

export default function PostEditor({
	initialContent,
	onChange,
	readOnly = false,
}: Props) {
	const { startUpload } = useUploadThing("blogImage");

	const uploadFile = useCallback(
		async (file: File): Promise<string> => {
			const result = await startUpload([file]);
			const url = result?.[0]?.serverData?.imageUrl;
			if (!url) throw new Error("No se pudo subir la imagen");
			return url;
		},
		[startUpload],
	);

	const editor = useCreateBlockNote({
		// biome-ignore lint/suspicious/noExplicitAny: BlockNote initial content is loosely typed
		initialContent: (initialContent as any) ?? undefined,
		dictionary: esDictionary,
		uploadFile,
	});

	const lastSerializedRef = useRef<string>("");
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	useEffect(() => {
		const blocks = editor.document;
		lastSerializedRef.current = JSON.stringify(blocks);
		const html = editor.blocksToFullHTML(blocks);
		onChangeRef.current(blocks, html);
	}, [editor]);

	return (
		<div className="border rounded-md bg-white min-h-[400px]">
			<BlockNoteView
				editor={editor}
				editable={!readOnly}
				theme="light"
				onChange={() => {
					if (readOnly) return;
					const blocks = editor.document;
					const serialized = JSON.stringify(blocks);
					if (serialized !== lastSerializedRef.current) {
						lastSerializedRef.current = serialized;
						const html = editor.blocksToFullHTML(blocks);
						onChange(blocks, html);
					}
				}}
			/>
		</div>
	);
}
