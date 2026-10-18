import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledTaskWithProfile } from "@/app/lib/profile_tasks/definitions";

const transactionMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: { transaction: transactionMock },
}));

vi.mock("@/app/lib/users/clerk", () => ({
  deleteClerkUser: vi.fn(),
}));

vi.mock("@/app/lib/programs/anonymization", () => ({
  anonymizeProgramPurchasesForUser: vi.fn(),
}));

vi.mock("@/app/lib/posts/anonymization", () => ({
  detachPostsForDeletedUser: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));

// Drops the real helper's one-second pause, but forwards the options: the
// reminder sender needs the transaction and the id list they carry.
vi.mock("@/app/lib/emails/helpers", () => ({
  queueEmails: async (
    entities: unknown[],
    callback: (entity: unknown, options?: unknown) => Promise<void>,
    options?: unknown,
  ) => {
    for (const entity of entities) await callback(entity, options);
  },
}));

import { handleReminderEmails } from "@/app/lib/profile_tasks/actions";

const task = {
  id: 5,
  profileId: 9,
  dueDate: new Date("2026-10-07T12:00:00.000Z"),
  profile: {
    id: 9,
    displayName: "Ana Ilustra",
    email: "ana@example.com",
  },
} as unknown as ScheduledTaskWithProfile;

describe("handleReminderEmails", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ data: { id: "email-1" }, error: null });

    const tx = {
      query: { scheduledTasks: { findMany: async () => [task] } },
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [{ id: task.id }] }),
        }),
      }),
    };
    transactionMock.mockReset();
    transactionMock.mockImplementation(
      async (run: (transaction: typeof tx) => unknown) => run(tx),
    );
  });

  // Participants are written to in voseo, subject and body alike.
  it("asks the participant to complete their profile in voseo", async () => {
    await expect(handleReminderEmails()).resolves.toEqual([task]);

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["ana@example.com"],
        subject: "Completá tu perfil para participar de nuestros eventos",
      }),
    );

    const payload = sendEmailMock.mock.calls[0]?.[0] as {
      react: React.ReactElement;
    };
    const html = renderToStaticMarkup(payload.react);
    expect(html).toContain("Completá tu perfil");
    expect(html).toContain("hacé clic en el botón");
  });
});
