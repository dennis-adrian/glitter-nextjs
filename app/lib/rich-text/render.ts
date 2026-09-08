import { ServerBlockNoteEditor } from "@blocknote/server-util";

import {
  assertCompactDocument,
  schemaForVariant,
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

  // `schemaForVariant` returns a union of three concrete schema types;
  // ServerBlockNoteEditor wants one. Same cast the client editor uses.
  const editor = ServerBlockNoteEditor.create({
    schema: schemaForVariant(variant) as never,
  });

  const html = await editor.blocksToHTMLLossy(blocks as never);
  return sanitizeRichTextHtml(html, variant);
}
