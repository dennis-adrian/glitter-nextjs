import { vi } from "vitest";

/**
 * For unit tests of a caller that mock `@/app/vendors/resend` and `@/db`: a
 * stand-in for `@/app/lib/emails/recorded-send` that hands each send to the
 * mocked vendor with the arguments the caller gave before it was recorded,
 * and writes nothing. Recording itself is tested in `recorded-send.test.ts`.
 *
 *   vi.mock("@/app/lib/emails/recorded-send", async () =>
 *     (await import("@/app/lib/emails/recorded-send.testing")).passThrough(),
 *   );
 */
export async function passThrough() {
  const resend = await import("@/app/vendors/resend");
  const strip = (options: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(options).filter(
        ([name]) => !["template", "userId", "userIds"].includes(name),
      ),
    );
  return {
    DIRECT_EMAIL_KEY_PREFIX: "direct:",
    sendRecordedEmail: vi.fn(
      (payload: unknown, options: Record<string, unknown>) => {
        const rest = strip(options);
        const send = resend.sendEmail as (...args: unknown[]) => unknown;
        return Object.keys(rest).length > 0
          ? send(payload, rest)
          : send(payload);
      },
    ),
    sendRecordedBatch: vi.fn(
      (emails: unknown, options: Record<string, unknown>) => {
        const rest = strip(options);
        const send = resend.sendBatchEmails as (...args: unknown[]) => unknown;
        return Object.keys(rest).length > 0 ? send(emails, rest) : send(emails);
      },
    ),
  };
}
