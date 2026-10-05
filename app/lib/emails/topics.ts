import { emailTopicEnum } from "@/db/schema";

/**
 * What an unsubscribe row covers: one kind of bulk mail, or `all` of them,
 * including kinds added later.
 */
export type EmailTopic = (typeof emailTopicEnum.enumValues)[number];

/** A kind of bulk mail an email actually belongs to. */
export type MailingTopic = Exclude<EmailTopic, "all">;

export const EMAIL_TOPICS = emailTopicEnum.enumValues;

export const MAILING_TOPICS = EMAIL_TOPICS.filter(
  (topic): topic is MailingTopic => topic !== "all",
);

/** How the unsubscribe page names each topic, after "dejarás de recibir". */
export const EMAIL_TOPIC_LABELS: Record<EmailTopic, string> = {
  visitor_invitations:
    "las invitaciones para acreditarte a nuestros festivales",
  participant_invitations:
    "los avisos de festivales abiertos para participantes",
  all: "todos nuestros correos masivos",
};

/** Short names, for the admin page. */
export const EMAIL_TOPIC_SHORT_LABELS: Record<EmailTopic, string> = {
  visitor_invitations: "Invitaciones a visitantes",
  participant_invitations: "Avisos a participantes",
  all: "Todos los correos masivos",
};

export function isEmailTopic(value: unknown): value is EmailTopic {
  return (
    typeof value === "string" &&
    (EMAIL_TOPICS as readonly string[]).includes(value)
  );
}

/** A topic one email belongs to, and so one an unsubscribe link names. */
export function isMailingTopic(value: unknown): value is MailingTopic {
  return isEmailTopic(value) && value !== "all";
}
