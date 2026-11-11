// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sendEmail, sendBatchEmails, inserted, insertFailure, insertGate } =
  vi.hoisted(() => ({
    sendEmail: vi.fn(),
    sendBatchEmails: vi.fn(),
    inserted: [] as { values: unknown; conflict: unknown }[],
    insertFailure: { error: null as Error | null },
    insertGate: { promise: null as Promise<void> | null },
  }));

vi.mock("@/app/vendors/resend", () => ({ sendEmail, sendBatchEmails }));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => ({
        onConflictDoUpdate: async (conflict: unknown) => {
          if (insertGate.promise) await insertGate.promise;
          if (insertFailure.error) throw insertFailure.error;
          inserted.push({ values, conflict });
        },
      }),
    }),
  },
}));

import {
  batchOutcomes,
  recipientsOf,
  sendRecordedBatch,
  sendRecordedEmail,
  settleRecordedEmails,
  singleOutcome,
} from "@/app/lib/emails/recorded-send";
import { ImpersonationReadOnlyError } from "@/db/write-guard";

type Row = Record<string, unknown>;

async function rows(): Promise<Row[]> {
  await settleRecordedEmails();
  return inserted.flatMap((entry) => entry.values as Row[]);
}

const payload = {
  from: "Glitter Store <reservas@productoraglitter.com>",
  to: ["ana@example.com"],
  subject: "Tu orden #12 ha sido recibida",
  html: "<a href='https://x/orders/12?token=secret-token'>Ver</a>",
  attachments: [{ filename: "qrcode.png", content: Buffer.from("png") }],
};

beforeEach(() => {
  sendEmail.mockReset();
  sendBatchEmails.mockReset();
  inserted.length = 0;
  insertFailure.error = null;
  insertGate.promise = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendRecordedEmail", () => {
  it("sends exactly what the caller gave, then records it as sent", async () => {
    const result = { data: { id: "re_123" }, error: null, headers: {} };
    sendEmail.mockResolvedValue(result);

    await expect(
      sendRecordedEmail(payload, {
        template: "order_received",
        userId: 7,
        idempotencyKey: "order-12",
      }),
    ).resolves.toBe(result);

    expect(sendEmail).toHaveBeenCalledWith(payload, {
      idempotencyKey: "order-12",
    });
    expect(await rows()).toEqual([
      expect.objectContaining({
        templateKey: "order_received",
        userId: 7,
        channel: "email",
        lane: "transactional",
        recipientEmail: "ana@example.com",
        status: "sent",
        attempts: 1,
        lastError: null,
        providerMessageId: "re_123",
        idempotencyKey: "direct:order-12",
      }),
    ]);
  });

  it("keeps the body, links and attachments out of the stored payload", async () => {
    sendEmail.mockResolvedValue({ data: { id: "re_1" }, error: null });
    await sendRecordedEmail(payload, { template: "ticket_issued" });

    const stored = (await rows())[0]!.payload;
    expect(stored).toEqual({
      subject: "Tu orden #12 ha sido recibida",
      from: "Glitter Store <reservas@productoraglitter.com>",
      attachments: 1,
    });
    expect(JSON.stringify(stored)).not.toContain("secret-token");
  });

  it("gives a send without a key a key of its own, every time", async () => {
    sendEmail.mockResolvedValue({ data: { id: "re_1" }, error: null });
    await sendRecordedEmail(payload, { template: "ticket_issued" });
    await sendRecordedEmail(payload, { template: "ticket_issued" });

    const [first, second] = await rows();
    expect(first!.idempotencyKey).toMatch(/^direct:[0-9a-f-]{36}$/);
    expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
    expect(sendEmail).toHaveBeenCalledWith(payload, {});
  });

  it("records a refusal as failed by its type and hands the result back", async () => {
    const result = {
      data: null,
      error: {
        name: "validation_error",
        message: "ana@example.com is invalid",
        statusCode: 422,
      },
      headers: {},
    };
    sendEmail.mockResolvedValue(result);

    await expect(
      sendRecordedEmail(payload, { template: "order_received" }),
    ).resolves.toBe(result);
    expect((await rows())[0]).toMatchObject({
      status: "failed",
      lastError: "resend:validation_error",
      providerMessageId: null,
      sentAt: null,
    });
    // The provider's message can echo the address.
    expect(JSON.stringify(await rows())).not.toContain("is invalid");
  });

  it("records a timeout as failed and still throws it", async () => {
    const timeout = new Error("Resend request timed out");
    sendEmail.mockRejectedValue(timeout);

    await expect(
      sendRecordedEmail(payload, { template: "ticket_issued" }),
    ).rejects.toBe(timeout);
    expect((await rows())[0]).toMatchObject({
      status: "failed",
      lastError: "timeout",
    });
  });

  it("records nothing for a send refused during a view as someone else", async () => {
    const refusal = new ImpersonationReadOnlyError();
    sendEmail.mockRejectedValue(refusal);

    await expect(
      sendRecordedEmail(payload, { template: "profile_verified" }),
    ).rejects.toBe(refusal);
    await settleRecordedEmails();
    expect(inserted).toEqual([]);
  });

  it("never waits for the record", async () => {
    sendEmail.mockResolvedValue({ data: { id: "re_1" }, error: null });
    let release!: () => void;
    insertGate.promise = new Promise<void>((resolve) => (release = resolve));

    // Resolves although the insert is still held, as one blocked behind the
    // caller's own transaction would be.
    await sendRecordedEmail(payload, { template: "order_received" });
    expect(inserted).toEqual([]);
    release();
    expect(await rows()).toHaveLength(1);
  });

  it("never fails the send over the record", async () => {
    const result = { data: { id: "re_1" }, error: null };
    sendEmail.mockResolvedValue(result);
    insertFailure.error = new Error("connection refused");

    await expect(
      sendRecordedEmail(payload, { template: "order_received" }),
    ).resolves.toBe(result);
    expect(console.error).toHaveBeenCalledWith(
      "Could not record a sent email",
      {
        template: "order_received",
        errorType: "Error",
      },
    );
  });

  it("settles the same row again when the caller retries under its key", async () => {
    sendEmail.mockResolvedValue({ data: { id: "re_1" }, error: null });
    await sendRecordedEmail(payload, {
      template: "order_payment_reminder",
      idempotencyKey: "order-reminder-1",
    });
    // The conflict target is the key, and the update is limited to rows
    // this module wrote.
    await settleRecordedEmails();
    const conflict = inserted[0]!.conflict as { target: unknown };
    expect(conflict.target).toBeDefined();
    expect((await rows())[0]!.idempotencyKey).toBe("direct:order-reminder-1");
  });
});

describe("singleOutcome", () => {
  it("counts a 409 for a reused key as accepted", () => {
    expect(
      singleOutcome({
        data: null,
        error: {
          name: "invalid_idempotent_request",
          message: "",
          statusCode: 409,
        },
        headers: {},
      } as never),
    ).toEqual({
      status: "sent",
      lastError: "idempotent_replay",
      providerMessageId: null,
    });
  });

  it("marks the development no-op as simulated", () => {
    expect(singleOutcome({ data: null, error: null, headers: null })).toEqual({
      status: "sent",
      lastError: "simulated",
      providerMessageId: null,
    });
  });
});

describe("recipientsOf", () => {
  it("joins every address of one email, and reads a lone string", () => {
    expect(recipientsOf(["a@x.com", " b@x.com "])).toBe("a@x.com, b@x.com");
    expect(recipientsOf("a@x.com")).toBe("a@x.com");
    expect(recipientsOf([])).toBeNull();
  });
});

describe("sendRecordedBatch", () => {
  const emails = [
    { ...payload, to: ["a@example.com"] },
    { ...payload, to: ["b@example.com"] },
  ];

  it("records one bulk row per email, each with its own Resend id", async () => {
    const result = {
      data: { data: [{ id: "re_a" }, { id: "re_b" }] },
      error: null,
      headers: {},
    };
    sendBatchEmails.mockResolvedValue(result);

    await expect(
      sendRecordedBatch(emails, {
        template: "festival_participant_invitation_email",
        userIds: [3, 4],
        idempotencyKey: "invite-page-1",
      }),
    ).resolves.toBe(result);

    expect(sendBatchEmails).toHaveBeenCalledWith(emails, {
      idempotencyKey: "invite-page-1",
    });
    expect(await rows()).toEqual([
      expect.objectContaining({
        recipientEmail: "a@example.com",
        userId: 3,
        lane: "bulk",
        status: "sent",
        providerMessageId: "re_a",
        idempotencyKey: "direct:invite-page-1:0",
      }),
      expect.objectContaining({
        recipientEmail: "b@example.com",
        userId: 4,
        providerMessageId: "re_b",
        idempotencyKey: "direct:invite-page-1:1",
      }),
    ]);
  });

  it("fails every row of a refused or timed-out batch", async () => {
    sendBatchEmails.mockResolvedValue({
      data: null,
      error: { name: "rate_limit_exceeded", message: "", statusCode: 429 },
      headers: {},
    });
    await sendRecordedBatch(emails, {
      template: "festival_visitor_invitation",
    });
    expect((await rows()).map((row) => row.lastError)).toEqual([
      "resend:rate_limit_exceeded",
      "resend:rate_limit_exceeded",
    ]);

    inserted.length = 0;
    sendBatchEmails.mockRejectedValue(new Error("Resend request timed out"));
    await expect(
      sendRecordedBatch(emails, { template: "festival_visitor_invitation" }),
    ).rejects.toThrow("timed out");
    expect((await rows()).map((row) => row.status)).toEqual([
      "failed",
      "failed",
    ]);
  });
});

describe("batchOutcomes", () => {
  it("keeps the development no-op's placeholder ids out", () => {
    expect(
      batchOutcomes(
        {
          data: { data: [{ id: "not-sent" }] },
          error: null,
          simulated: true,
        } as never,
        1,
      ),
    ).toEqual([
      { status: "sent", lastError: "simulated", providerMessageId: null },
    ]);
  });

  it("fails only the items a permissive batch refused", () => {
    expect(
      batchOutcomes(
        {
          data: { data: [{ id: "re_a" }], errors: [{ index: 1 }] },
          error: null,
        },
        2,
      ),
    ).toEqual([
      { status: "sent", lastError: null, providerMessageId: "re_a" },
      {
        status: "failed",
        lastError: "resend:item_rejected",
        providerMessageId: null,
      },
    ]);
  });
});

/**
 * Every email leaves a row: only the queue, the outboxes and this module may
 * call Resend's send functions. A new caller goes through `sendRecordedEmail`.
 */
describe("who may send straight to Resend", () => {
  const ROOT = join(__dirname, "..", "..", "..");
  const ALLOWED = new Set([
    "app/lib/emails/recorded-send.ts",
    // Test-only stand-in for it.
    "app/lib/emails/recorded-send.testing.ts",
    // The delivery queue and the bulk lane write their own rows.
    "app/lib/notifications/deliveries.ts",
    "app/lib/notifications/bulk-email.ts",
    // The two outboxes, listed on the log from their own tables.
    "app/lib/reservations/notification-outbox.ts",
    "app/lib/infractions/notifications.ts",
  ]);

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return name === "node_modules" ? [] : sources(path);
      }
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("lists no other caller", () => {
    const callers = sources(join(ROOT, "app"))
      .filter((path) => !path.includes("/vendors/"))
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return (
          text.includes('@/app/vendors/resend"') &&
          /\b(sendEmail|sendBatchEmails)\b/.test(text)
        );
      })
      .map((path) => relative(ROOT, path))
      .filter((path) => !ALLOWED.has(path));
    expect(callers).toEqual([]);
  });
});
