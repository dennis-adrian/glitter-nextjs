import { emailTopicEnum } from "@/db/schema";

/** A kind of bulk mail people can stop receiving on its own. */
export type EmailTopic = (typeof emailTopicEnum.enumValues)[number];

export const EMAIL_TOPICS = emailTopicEnum.enumValues;

/** How the unsubscribe page names each topic. */
export const EMAIL_TOPIC_LABELS: Record<EmailTopic, string> = {
  visitor_invitations:
    "las invitaciones para acreditarte a nuestros festivales",
  participant_invitations:
    "los avisos de festivales abiertos para participantes",
};

export function isEmailTopic(value: unknown): value is EmailTopic {
  return (
    typeof value === "string" &&
    (EMAIL_TOPICS as readonly string[]).includes(value)
  );
}
