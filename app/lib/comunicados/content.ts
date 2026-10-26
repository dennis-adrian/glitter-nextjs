import {
  ANNOUNCEMENT_MAX_DEPTH,
  COMUNICADO_DOC_MAX_BYTES,
  COMUNICADO_FOREIGN_IMAGE_MESSAGE,
  COMUNICADO_MAX_BLOCKS,
  COMUNICADO_MAX_IMAGES,
  COMUNICADO_TEXT_MAX,
} from "@/app/lib/comunicados/definitions";
import {
  COMUNICADO_IMAGE_CAP_MESSAGE,
  countComunicadoImages,
  foreignComunicadoImageUrls,
} from "@/app/lib/comunicados/images";
import {
  announcementBlocksToText,
  encodeHrefWhitespace,
  HREF_CONTROL_CHARACTER,
} from "@/app/lib/comunicados/text";
import { richTextBodyHasVisibleContent } from "@/app/lib/festival-terms/html";
import { isAllowedRichTextUri } from "@/app/lib/rich-text/sanitize";
import {
  ANNOUNCEMENT_BLOCK_TYPES,
  disallowedBlockTypes,
} from "@/app/lib/rich-text/schemas";

/**
 * The server's check of a comunicado's text (docs/IMPLEMENTATION-comunicados.md
 * C2, steps 1–6). Every rendering is made from the blocks this returns,
 * never from HTML or blocks as the client sent them.
 */

/** "draft" for autosave; "send" for test send, schedule, send and edit. */
export type AnnouncementStage = "draft" | "send";

export type AnnouncementBlockType = (typeof ANNOUNCEMENT_BLOCK_TYPES)[number];

export type AnnouncementText = {
  type: "text";
  text: string;
  styles: { bold?: true; italic?: true };
};

export type AnnouncementLink = {
  type: "link";
  href: string;
  content: AnnouncementText[];
};

export type AnnouncementInline = AnnouncementText | AnnouncementLink;

/** A BlockNote block as `announcementEditorSchema` holds it. */
export type AnnouncementBlock = {
  id?: string;
  type: AnnouncementBlockType;
  props: Record<string, string | number>;
  /** Absent on a divider or an image, which hold no text. */
  content?: AnnouncementInline[];
  children: AnnouncementBlock[];
};

export type NormalizeAnnouncementResult =
  | {
      ok: true;
      blocks: AnnouncementBlock[];
      /** `announcementBlocksToText(blocks, { withUrls: false })`. */
      text: string;
    }
  | { ok: false; message: string };

/**
 * Top-level blocks and their children: a list inside a list. A deeper block
 * follows its depth-2 ancestor instead (`normalizeBlocks`).
 */
const MAX_DEPTH = ANNOUNCEMENT_MAX_DEPTH;
const MAX_SHOWN_HREF = 60;
const MAX_BLOCK_ID = 64;

const MALFORMED =
  "No pudimos leer el texto del comunicado. Recargá la página y probá de nuevo.";

/** Spanish names for the blocks the other editors offer. */
const BLOCK_NAMES: Record<string, string> = {
  table: "tabla",
  video: "video",
  audio: "audio",
  file: "archivo",
  codeBlock: "bloque de código",
  checkListItem: "lista de tareas",
  toggleListItem: "lista desplegable",
  pageBreak: "salto de página",
  columnList: "columnas",
  column: "columnas",
};

const DEFAULT_COLORS = { backgroundColor: "default", textColor: "default" };
const DEFAULT_PROPS = { ...DEFAULT_COLORS, textAlignment: "left" };

class Refusal extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Postgres refuses NUL and unpaired surrogates in jsonb, so a paste carrying
 * one would fail the save. Other control characters print nothing.
 */
/** Half of a surrogate pair on its own: Postgres jsonb refuses it. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function cleanText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(LONE_SURROGATE, "�");
}

function textNode(raw: unknown): AnnouncementText {
  if (typeof raw === "string") return { type: "text", text: raw, styles: {} };
  if (!isRecord(raw) || raw.type !== "text" || typeof raw.text !== "string") {
    throw new Refusal(MALFORMED);
  }
  const styles: AnnouncementText["styles"] = {};
  // Underline, strike, code and colours break in email clients: dropped.
  if (isRecord(raw.styles)) {
    if (raw.styles.bold === true) styles.bold = true;
    if (raw.styles.italic === true) styles.italic = true;
  }
  return { type: "text", text: raw.text, styles };
}

function sameStyles(a: AnnouncementText, b: AnnouncementText) {
  return a.styles.bold === b.styles.bold && a.styles.italic === b.styles.italic;
}

/** Cleans, drops empty runs and merges neighbours a dropped style made equal. */
function mergeTexts(nodes: AnnouncementText[]): AnnouncementText[] {
  const merged: AnnouncementText[] = [];
  for (const node of nodes) {
    const text = cleanText(node.text);
    if (!text) continue;
    const last = merged.at(-1);
    if (last && sameStyles(last, node)) {
      last.text += text;
    } else {
      merged.push({ ...node, text });
    }
  }
  return merged;
}

function linkProblem(href: string, label: string) {
  const shown = href.trim() || label.trim();
  const clipped =
    shown.length > MAX_SHOWN_HREF
      ? `${shown.slice(0, MAX_SHOWN_HREF - 1)}…`
      : shown;
  return `Revisá el enlace «${clipped}»: tiene que ser una dirección https://, un mailto: o una página de Glitter como /my_participations.`;
}

function linkNode(raw: Record<string, unknown>): AnnouncementLink | null {
  const content = mergeTexts(
    (typeof raw.content === "string"
      ? [raw.content]
      : Array.isArray(raw.content)
        ? raw.content
        : []
    ).map(textNode),
  );
  // A link around no text cannot be seen or clicked.
  if (content.length === 0) return null;

  const href = typeof raw.href === "string" ? raw.href.trim() : "";
  // Browsers drop tabs and newlines inside a URL while parsing it, so
  // "/\t/sitio.com" would open another site.
  if (!isAllowedRichTextUri(href) || HREF_CONTROL_CHARACTER.test(href)) {
    throw new Refusal(
      linkProblem(
        typeof raw.href === "string" ? raw.href : "",
        content.map((node) => node.text).join(""),
      ),
    );
  }
  // A pasted space is encoded once, here, so the inbox, the email and its
  // text part all carry the same address: the email's path rule would
  // otherwise turn "/mis cosas" into plain words.
  // A lone surrogate would make jsonb refuse the whole autosave, title and
  // audience included: it becomes an encoded replacement character.
  return {
    type: "link",
    href: encodeHrefWhitespace(href).replace(LONE_SURROGATE, "%EF%BF%BD"),
    content,
  };
}

function inlineContent(raw: unknown): AnnouncementInline[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw === "string") return mergeTexts([textNode(raw)]);
  if (!Array.isArray(raw)) throw new Refusal(MALFORMED);

  const nodes: AnnouncementInline[] = [];
  let run: AnnouncementText[] = [];
  const flush = () => {
    nodes.push(...mergeTexts(run));
    run = [];
  };
  for (const item of raw) {
    if (isRecord(item) && item.type === "link") {
      flush();
      const link = linkNode(item);
      if (link) nodes.push(link);
    } else {
      run.push(textNode(item));
    }
  }
  flush();
  return nodes;
}

/**
 * Título (2) or Subtítulo (3). BlockNote parses a pasted h1 or h4–h6, and
 * Markdown's "#", whatever the schema's levels, so a level is clamped to the
 * nearer one rather than refused; the toolbar reads it the same way.
 */
function headingLevel(raw: unknown): 2 | 3 {
  // A heading made without a level is a Título, as the schema's default.
  if (raw === undefined) return 2;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Refusal(MALFORMED);
  }
  return raw >= 3 ? 3 : 2;
}

/**
 * An image keeps its address and caption. The caption is also its `name`,
 * which BlockNote prints as the inbox `alt`, so the inbox and the email
 * describe it the same way rather than by a file name. Its size and the
 * "show as a link" switch go: neither rendering can keep them.
 */
function imageProps(raw: Record<string, unknown>) {
  // An image made without an address has the schema's default: none yet.
  const url = raw.url ?? "";
  const caption = raw.caption ?? "";
  if (typeof url !== "string" || typeof caption !== "string") {
    throw new Refusal(MALFORMED);
  }
  const cleanCaption = cleanText(caption).trim();
  return {
    url: cleanText(url).trim(),
    caption: cleanCaption,
    name: cleanCaption,
    textAlignment: "left",
    backgroundColor: "default",
  };
}

/** Colours and alignment go back to their defaults; nothing else is kept. */
function blockProps(
  type: AnnouncementBlockType,
  raw: Record<string, unknown>,
): AnnouncementBlock["props"] {
  if (type === "divider") return {};
  if (type === "image") return imageProps(raw);
  if (type === "quote") return { ...DEFAULT_COLORS };
  if (type === "heading") {
    return { ...DEFAULT_PROPS, level: headingLevel(raw.level) };
  }
  // A numbered list's `start` is dropped too: the inbox HTML cannot keep it,
  // and every rendering should count the same way.
  return { ...DEFAULT_PROPS };
}

/**
 * At `MAX_DEPTH` a block's children become its following siblings, in
 * order, so a pasted third level of a list stays readable one level up.
 * An image with no address is dropped, its children taking its place at its
 * depth: an upload that never finished leaves one behind.
 */
function normalizeBlocks(raw: unknown[], depth: number): AnnouncementBlock[] {
  const blocks: AnnouncementBlock[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.type !== "string") {
      throw new Refusal(MALFORMED);
    }
    // `disallowedBlockTypes` already refused every other type.
    const type = item.type as AnnouncementBlockType;
    const props = blockProps(type, isRecord(item.props) ? item.props : {});

    const rawChildren = item.children ?? [];
    if (!Array.isArray(rawChildren)) throw new Refusal(MALFORMED);
    if (type === "image" && props.url === "") {
      blocks.push(...normalizeBlocks(rawChildren, depth));
      continue;
    }
    const children =
      rawChildren.length > 0
        ? normalizeBlocks(rawChildren, Math.min(depth + 1, MAX_DEPTH))
        : [];
    const lifted = depth >= MAX_DEPTH;

    const block: AnnouncementBlock = {
      type,
      props,
      children: lifted ? [] : children,
    };
    if (
      typeof item.id === "string" &&
      item.id.length > 0 &&
      item.id.length <= MAX_BLOCK_ID
    ) {
      block.id = cleanText(item.id);
    }
    if (type !== "divider" && type !== "image") {
      block.content = inlineContent(item.content);
    }
    blocks.push(block);
    if (lifted) blocks.push(...children);
  }
  return blocks;
}

/** Blocks, children counted; stops counting once past the limit. */
function countBlocks(raw: unknown[], limit: number): number {
  let count = 0;
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (count > limit) return;
      count += 1;
      if (isRecord(node) && Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(raw);
  return count;
}

function isEmptyParagraph(block: AnnouncementBlock) {
  return (
    block.type === "paragraph" &&
    block.children.length === 0 &&
    !(block.content ?? []).some((node) =>
      (node.type === "link" ? node.content : [node]).some(
        (text) => text.text.trim().length > 0,
      ),
    )
  );
}

function unknownTypesMessage(types: string[]) {
  const names = [...new Set(types.map((type) => BLOCK_NAMES[type] ?? type))];
  return names.length === 1
    ? `Este bloque no se puede usar en un comunicado: ${names[0]}.`
    : `Estos bloques no se pueden usar en un comunicado: ${names.join(", ")}.`;
}

function byteLength(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return null;
  }
}

/** Whether any block, at any depth, holds text that is not just spaces. */
function hasWrittenText(blocks: readonly AnnouncementBlock[]): boolean {
  return blocks.some(
    (block) =>
      (block.content ?? []).some((inline) =>
        inline.type === "text"
          ? inline.text.trim() !== ""
          : inline.content.some((part) => part.text.trim() !== ""),
      ) || hasWrittenText(block.children),
  );
}

/**
 * Checks and normalizes a comunicado's BlockNote document.
 *
 * Both stages refuse what would break a rendering (a block or a link the
 * variant does not have, more than `COMUNICADO_MAX_IMAGES` images) and
 * silently fix what a paste from Word, Google Docs or Markdown brings along
 * (styles, colours, alignment, heading levels, nesting past two levels,
 * spaces in an address, images with no address, empty paragraphs at the
 * end), so an autosave never fails on formatting. Only the "send" stage asks
 * for text, bounds its length and refuses an image not uploaded to Glitter:
 * drafts may be incomplete, and the composer flags such an image
 * (`foreignComunicadoImageUrls`).
 *
 * Every rule depends on the document alone: each batch of a send normalizes
 * its revision again, and a rule that changed its mind would fail it.
 */
export function normalizeAnnouncementDoc(
  input: unknown,
  opts: { stage: AnnouncementStage },
): NormalizeAnnouncementResult {
  if (!Array.isArray(input)) return { ok: false, message: MALFORMED };

  const bytes = byteLength(input);
  if (bytes === null) return { ok: false, message: MALFORMED };
  if (bytes > COMUNICADO_DOC_MAX_BYTES) {
    return {
      ok: false,
      message: "El comunicado es demasiado largo. Acortá el texto.",
    };
  }
  if (countBlocks(input, COMUNICADO_MAX_BLOCKS) > COMUNICADO_MAX_BLOCKS) {
    return {
      ok: false,
      message: `El texto puede tener hasta ${COMUNICADO_MAX_BLOCKS} párrafos, títulos o puntos de lista.`,
    };
  }

  // Before the walk, so one message names every block that has to go.
  const unknownTypes = disallowedBlockTypes(input, "announcement");
  if (unknownTypes.length > 0) {
    return { ok: false, message: unknownTypesMessage(unknownTypes) };
  }

  let blocks: AnnouncementBlock[];
  try {
    blocks = normalizeBlocks(input, 1);
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, message: error.message };
    throw error;
  }
  while (blocks.length > 0 && isEmptyParagraph(blocks[blocks.length - 1])) {
    blocks.pop();
  }

  if (countComunicadoImages(blocks) > COMUNICADO_MAX_IMAGES) {
    return { ok: false, message: COMUNICADO_IMAGE_CAP_MESSAGE };
  }
  // Only an UploadThing file is sure to stay up as long as the mail does
  // (C4). A draft keeps a pasted one so the admin can replace it.
  if (opts.stage === "send" && foreignComunicadoImageUrls(blocks).length > 0) {
    return { ok: false, message: COMUNICADO_FOREIGN_IMAGE_MESSAGE };
  }

  const text = announcementBlocksToText(blocks, { withUrls: false });

  if (opts.stage === "send") {
    // A divider alone is visible but says nothing: some text is required.
    if (!richTextBodyHasVisibleContent(blocks) || !hasWrittenText(blocks)) {
      return { ok: false, message: "Escribí el texto del comunicado." };
    }
    if (text.length > COMUNICADO_TEXT_MAX) {
      return {
        ok: false,
        message: `El texto puede tener hasta ${COMUNICADO_TEXT_MAX.toLocaleString("es-BO")} caracteres.`,
      };
    }
  }

  return { ok: true, blocks, text };
}
