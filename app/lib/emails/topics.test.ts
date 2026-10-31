import { describe, expect, it } from "vitest";

import {
  EMAIL_TOPIC_LABELS,
  EMAIL_TOPIC_SHORT_LABELS,
  EMAIL_TOPICS,
  isMailingTopic,
  MAILING_TOPICS,
} from "@/app/lib/emails/topics";

describe("email topics", () => {
  it("names comunicados as Anuncios", () => {
    expect(EMAIL_TOPIC_LABELS.announcements).toBe(
      "los anuncios de Productora Glitter",
    );
    expect(EMAIL_TOPIC_SHORT_LABELS.announcements).toBe("Anuncios");
  });

  it("labels every topic, for the page and the admin", () => {
    for (const topic of EMAIL_TOPICS) {
      expect(EMAIL_TOPIC_LABELS[topic]).toEqual(expect.any(String));
      expect(EMAIL_TOPIC_SHORT_LABELS[topic]).toEqual(expect.any(String));
    }
  });

  it("lets an unsubscribe link name announcements, but never all", () => {
    expect(MAILING_TOPICS).toContain("announcements");
    expect(MAILING_TOPICS).not.toContain("all");
    expect(isMailingTopic("announcements")).toBe(true);
    expect(isMailingTopic("all")).toBe(false);
  });
});
