import "server-only";

import DOMPurify from "isomorphic-dompurify";

const FORBID_TAGS = [
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"form",
	"button",
	"select",
	"textarea",
	"meta",
	"link",
];

const FORBID_ATTR = [
	"onerror",
	"onload",
	"onclick",
	"onmouseover",
	"onfocus",
	"onblur",
	"onsubmit",
	"onchange",
	"onkeydown",
	"onkeyup",
	"onkeypress",
];

let hookRegistered = false;
function registerExternalLinkHook() {
	if (hookRegistered) return;
	hookRegistered = true;
	DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
		if (node.tagName !== "A") return;
		const href = node.getAttribute("href") ?? "";
		if (/^https?:\/\//i.test(href)) {
			node.setAttribute("target", "_blank");
			node.setAttribute("rel", "noopener noreferrer");
		}
	});
}

export function sanitizePostHtml(html: string): string {
	registerExternalLinkHook();
	return DOMPurify.sanitize(html, {
		FORBID_TAGS,
		FORBID_ATTR,
		ALLOWED_URI_REGEXP: /^(?:https?:|\/)/i,
		USE_PROFILES: { html: true },
	});
}
