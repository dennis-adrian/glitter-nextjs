import "server-only";

import type { MailingTopic } from "@/app/lib/emails/topics";
import {
  signUnsubscribeToken,
  type UnsubscribeRecipient,
} from "@/app/lib/emails/unsubscribe-tokens";
import { publicBaseUrl } from "@/app/lib/urls";

/** Path of the one-click endpoint mail providers POST to (RFC 8058). */
export const ONE_CLICK_UNSUBSCRIBE_PATH = "/api/email/unsubscribe";
/** Path of the page the link in the email's footer opens. */
export const UNSUBSCRIBE_PAGE_PATH = "/email/unsubscribe";

/**
 * The unsubscribe link for the footer of one bulk email, and the headers
 * that let Gmail, Yahoo and others show their own "unsubscribe" button,
 * which POSTs to us without opening a page.
 */
export function unsubscribeLinks(
  recipient: UnsubscribeRecipient,
  topic: MailingTopic,
) {
  const token = encodeURIComponent(
    signUnsubscribeToken({ ...recipient, topic }),
  );
  const base = publicBaseUrl();
  const oneClickUrl = `${base}${ONE_CLICK_UNSUBSCRIBE_PATH}?token=${token}`;
  return {
    pageUrl: `${base}${UNSUBSCRIBE_PAGE_PATH}?token=${token}`,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
