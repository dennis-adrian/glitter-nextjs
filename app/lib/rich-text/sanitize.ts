import sanitizeHtml from "sanitize-html";

import type { EditorVariant } from "@/app/lib/rich-text/schemas";

const COMPACT_TAGS = [
  "p",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "a",
  "blockquote",
  "br",
];

const ARTICLE_TAGS = [
  ...COMPACT_TAGS,
  "h1",
  "h4",
  "pre",
  "code",
  "hr",
  "img",
  "mark",
];

/**
 * The extra tags `blocksToHTMLLossy` emits for the blog-only blocks:
 * `figure`/`figcaption` around images, `input`+`li[data-checked]` for check
 * lists, `details`/`summary` for toggles, and the table family. Without
 * these the sanitizer would silently swallow whole blocks an author wrote.
 */
const BLOG_TAGS = [
  ...ARTICLE_TAGS,
  "figure",
  "figcaption",
  "input",
  "details",
  "summary",
  "table",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

function tagsForVariant(variant: EditorVariant): string[] {
  if (variant === "blog") return BLOG_TAGS;
  return variant === "article" ? ARTICLE_TAGS : COMPACT_TAGS;
}

const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|\/(?![\\/]))/i;

export function isAllowedRichTextUri(value: string): boolean {
  return ALLOWED_URI_REGEXP.test(value.trim());
}

export function sanitizeRichTextHtml(
  html: string,
  variant: EditorVariant = "compact",
): string {
  return sanitizeHtml(html, {
    allowedTags: tagsForVariant(variant),
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      // Carries the checked state of a check-list item; the styling hook.
      li: ["data-checked"],
      input: ["type", "checked", "disabled"],
      details: ["open"],
      code: ["class", "data-language"],
      pre: ["data-language"],
      col: ["span"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    // `class` is allowed on `code` for language-* hints only; anything else
    // that slips through carries no styling weight on the public page.
    allowedClasses: {
      code: [/^language-[\w-]+$/],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attributes) => {
        const attribs = { ...attributes };
        if (attribs.href && !isAllowedRichTextUri(attribs.href)) {
          delete attribs.href;
        }
        return { tagName, attribs };
      },
      img: (tagName, attributes) => {
        const attribs = { ...attributes };
        if (attribs.src && !isAllowedRichTextUri(attribs.src)) {
          delete attribs.src;
        }
        return { tagName, attribs };
      },
      // Check lists are a rendering of the author's document, not a control
      // the reader owns — so the box shows state but never accepts a click.
      input: (tagName, attributes) => ({
        tagName,
        attribs: {
          type: "checkbox",
          disabled: "disabled",
          ...(attributes.checked !== undefined ? { checked: "checked" } : {}),
        },
      }),
    },
  });
}
