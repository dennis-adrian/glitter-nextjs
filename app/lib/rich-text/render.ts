import { ServerBlockNoteEditor } from "@blocknote/server-util";

import {
  articleEditorSchema,
  assertCompactDocument,
  compactEditorSchema,
  type EditorVariant,
} from "@/app/lib/rich-text/schemas";
import { sanitizeRichTextHtml } from "@/app/lib/rich-text/sanitize";

export async function blocksToSanitizedHtml(
  blocks: unknown,
  variant: EditorVariant = "compact",
  documentLabel?: string,
): Promise<string> {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return "";
  }

  if (variant === "compact") {
    assertCompactDocument(blocks, documentLabel);
  }

  const editor =
    variant === "article"
      ? ServerBlockNoteEditor.create({ schema: articleEditorSchema })
      : ServerBlockNoteEditor.create({ schema: compactEditorSchema });

  const html = await editor.blocksToHTMLLossy(blocks as never);
  return sanitizeRichTextHtml(html, variant);
}
