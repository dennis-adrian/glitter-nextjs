import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * BlockNote's `blocksToFullHTML` output is div-heavy and carries the
 * `bn-*` / `data-content-type` hooks that `post-detail.tsx` and the blog
 * rules in `globals.css` style against, so this allowlist is deliberately
 * wider than `app/lib/rich-text/sanitize.ts` — it has to survive the
 * wrapper markup, not just the semantic tags.
 *
 * Anything scriptable stays out: no `script`/`style`/`iframe`/`object`/
 * `embed`, no form controls, and no `on*` handlers (sanitize-html drops
 * every attribute that is not named here).
 */
const ALLOWED_TAGS = [
  "div",
  "span",
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "mark",
  "sub",
  "sup",
  "a",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const GLOBAL_ATTRS = [
  "class",
  "style",
  "id",
  "dir",
  "lang",
  "title",
  "data-*",
  "aria-*",
  "role",
];

export function sanitizePostHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": GLOBAL_ATTRS,
      a: [...GLOBAL_ATTRS, "href", "target", "rel", "name"],
      img: [...GLOBAL_ATTRS, "src", "alt", "width", "height", "loading"],
      td: [...GLOBAL_ATTRS, "colspan", "rowspan"],
      th: [...GLOBAL_ATTRS, "colspan", "rowspan", "scope"],
    },
    // Matches the previous ALLOWED_URI_REGEXP: absolute http(s) or site-relative.
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: {},
    allowProtocolRelative: false,
    // BlockNote writes alignment and text colours inline. Only these
    // properties survive, so `style` cannot smuggle a `url(...)` payload.
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "background-color": [
          /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$|^rgba?\([\d.,\s%]+\)$/i,
        ],
        color: [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$|^rgba?\([\d.,\s%]+\)$/i],
      },
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        if (/^https?:\/\//i.test(href)) {
          return {
            tagName,
            attribs: {
              ...attribs,
              target: "_blank",
              rel: "noopener noreferrer",
            },
          };
        }
        return { tagName, attribs };
      },
    },
  });
}
