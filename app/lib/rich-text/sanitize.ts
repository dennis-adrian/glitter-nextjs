import DOMPurify from "isomorphic-dompurify";

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

const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt"];

const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|\/)/i;

export function isAllowedRichTextUri(value: string): boolean {
  return ALLOWED_URI_REGEXP.test(value.trim());
}

export function sanitizeRichTextHtml(
  html: string,
  variant: EditorVariant = "compact",
): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: variant === "article" ? ARTICLE_TAGS : COMPACT_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
  });
}
