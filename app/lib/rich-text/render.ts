import { ServerBlockNoteEditor } from "@blocknote/server-util";

import {
  assertAnnouncementDocument,
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
  // Comunicados come here normalized (`normalizeAnnouncementDoc`): their
  // schema has only bold and italic, and BlockNote throws on any other style.
  if (variant === "announcement") {
    assertAnnouncementDocument(blocks, documentLabel);
  }

  // `schemaForVariant` returns a union of concrete schema types;
  // ServerBlockNoteEditor wants one. Same cast the client editor uses.
  const editor = ServerBlockNoteEditor.create({
    schema: schemaForVariant(variant) as never,
  });

  // BlockNote fills its prop defaults into the blocks it is given (an image
  // gains `showPreview`): render a copy, so a caller that stores the same
  // blocks, as a comunicado's revision does, stores them as normalized.
  const html = await editor.blocksToHTMLLossy(structuredClone(blocks) as never);
  // BlockNote fills an empty block (a blank line, an empty heading or list
  // item) with U+FFFC when it exports HTML, and a browser draws that as an
  // "OBJ" box. Its Markdown export strips it; the HTML one does not.
  return sanitizeRichTextHtml(html.replaceAll("￼", ""), variant);
}
