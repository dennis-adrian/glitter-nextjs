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

const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|\/(?![\\/]))/i;

export function isAllowedRichTextUri(value: string): boolean {
  return ALLOWED_URI_REGEXP.test(value.trim());
}

export function sanitizeRichTextHtml(
  html: string,
  variant: EditorVariant = "compact",
): string {
  return sanitizeHtml(html, {
    allowedTags: variant === "article" ? ARTICLE_TAGS : COMPACT_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
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
    },
  });
}
