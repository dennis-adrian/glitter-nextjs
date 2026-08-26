"use client";

import dynamic from "next/dynamic";

import type { EditorVariant } from "@/app/lib/rich-text/schemas";

const RichTextEditorInner = dynamic(
  () => import("@/app/components/organisms/rich-text-editor-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[220px] rounded-md border bg-muted/30" />
    ),
  },
);

type RichTextEditorProps = {
  variant: EditorVariant;
  initialContent?: unknown;
  onChange?: (json: unknown, html: string) => void;
  placeholder?: string;
  editable?: boolean;
  uploadFile?: (file: File) => Promise<string>;
  className?: string;
};

export default function RichTextEditor(props: RichTextEditorProps) {
  return <RichTextEditorInner {...props} />;
}
