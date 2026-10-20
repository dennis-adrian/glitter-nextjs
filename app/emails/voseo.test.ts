import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sourceFiles, tuteoHits } from "@/app/lib/voseo-scan";

/**
 * Each participant and visitor email keeps to voseo, one grammatical person
 * throughout; the patterns and their limits live in app/lib/voseo-scan.
 * Subjects built in app/lib/** are not scanned here: those modules also hold
 * in-app messages, and the send-site tests pin the subjects.
 *
 * Add a template below only when it is sent to the admin list alone.
 */
const ADMIN_ONLY_REASON =
  "sent only to the admin list; the voseo rule covers participant and visitor copy";
const ADMIN_ONLY: Record<string, string> = {
  "festival-activity-registration.tsx": ADMIN_ONLY_REASON,
  "order-confirmation-for-admins.tsx": ADMIN_ONLY_REASON,
  "order-updated-for-admins.tsx": ADMIN_ONLY_REASON,
  "order-voucher-submitted-for-admins.tsx": ADMIN_ONLY_REASON,
  "payment-confirmation-for-admins.tsx": ADMIN_ONLY_REASON,
  "profile-completion.tsx": ADMIN_ONLY_REASON,
  "program-signup-for-admins.tsx": ADMIN_ONLY_REASON,
  "reservation-confirmation-for-admins.tsx": ADMIN_ONLY_REASON,
  "reservation-created.tsx": ADMIN_ONLY_REASON,
  "terms-acceptance.tsx": ADMIN_ONLY_REASON,
};

const EMAILS_DIR = path.join(process.cwd(), "app/emails");

describe("email templates", () => {
  it("keeps participant and visitor emails in voseo", () => {
    const offenders = sourceFiles(EMAILS_DIR)
      .filter((file) => !ADMIN_ONLY[file])
      .flatMap((file) =>
        tuteoHits(readFileSync(path.join(EMAILS_DIR, file), "utf8")).map(
          (hit) => `${file}: ${hit}`,
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("tells a tuteo negative command from voseo and from a subordinate clause", () => {
    const hits = (text: string) => tuteoHits(text).length;
    expect(hits("No lo compartas")).toBe(1);
    expect(hits("no te\n    preocupes")).toBe(1);
    expect(hits("No lo compartás")).toBe(0);
    expect(hits("no te preocupés")).toBe(0);
    expect(hits("te pedimos que no lo compartas")).toBe(0);
  });

  it("finds the files it is meant to scan", () => {
    // Guards the guard: a moved directory would otherwise pass vacuously.
    const files = sourceFiles(EMAILS_DIR);
    expect(files).toContain("ticket.tsx");
    expect(files).toContain("verification_confimation/email-template.tsx");
    expect(files).not.toContain("ticket.test.tsx");
    // A renamed or deleted admin template must not leave a stale exemption.
    for (const file of Object.keys(ADMIN_ONLY)) {
      expect(existsSync(path.join(EMAILS_DIR, file)), file).toBe(true);
    }
  });
});
