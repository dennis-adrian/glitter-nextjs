import "server-only";

import type { EmailTopic } from "@/app/lib/emails/topics";
import {
  signUnsubscribeToken,
  type UnsubscribeRecipient,
} from "@/app/lib/emails/unsubscribe-tokens";

/** Path of the one-click endpoint mail providers POST to (RFC 8058). */
export const ONE_CLICK_UNSUBSCRIBE_PATH = "/api/email/unsubscribe";
/** Path of the page the link in the email's footer opens. */
export const UNSUBSCRIBE_PAGE_PATH = "/email/unsubscribe";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/**
 * The unsubscribe link for the footer of one bulk email, and the headers
 * that let Gmail, Yahoo and others show their own "unsubscribe" button,
 * which POSTs to us without opening a page.
 */
export function unsubscribeLinks(
  recipient: UnsubscribeRecipient,
  topic: EmailTopic,
) {
  const token = encodeURIComponent(
    signUnsubscribeToken({ ...recipient, topic }),
  );
  const oneClickUrl = `${baseUrl()}${ONE_CLICK_UNSUBSCRIBE_PATH}?token=${token}`;
  return {
    pageUrl: `${baseUrl()}${UNSUBSCRIBE_PAGE_PATH}?token=${token}`,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
