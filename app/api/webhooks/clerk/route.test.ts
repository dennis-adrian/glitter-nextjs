// @vitest-environment node
import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  CLERK_WEBHOOK_SIGNING_SECRET: undefined as string | undefined,
}));
const recordClerkLoginDeleted = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: env }));
vi.mock("@/app/lib/users/clerk-login-deleted", () => ({
  recordClerkLoginDeleted,
}));

import { POST } from "@/app/api/webhooks/clerk/route";

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;

/** A delivery signed the way Clerk (Svix) signs one, checked for real. */
function delivery(
  event: unknown,
  options: { secret?: string; timestamp?: number } = {},
) {
  const body = JSON.stringify(event);
  const id = `msg_${randomUUID()}`;
  const timestamp = String(
    Math.floor((options.timestamp ?? Date.now()) / 1000),
  );
  const key = Buffer.from(
    (options.secret ?? SECRET).replace(/^whsec_/, ""),
    "base64",
  );
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Request("https://example.test/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body,
  }) as never;
}

const userDeleted = (id?: string) => ({
  type: "user.deleted",
  object: "event",
  data: { id, object: "user", deleted: true },
});

describe("Clerk webhook", () => {
  beforeEach(() => {
    env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
    recordClerkLoginDeleted.mockReset();
    recordClerkLoginDeleted.mockResolvedValue({ kind: "no_profile" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("records a deleted login against its profile", async () => {
    const response = await POST(delivery(userDeleted("user_abc")));

    expect(response.status).toBe(200);
    expect(recordClerkLoginDeleted).toHaveBeenCalledWith("user_abc");
  });

  it("logs a profile the app kept, for an operator", async () => {
    recordClerkLoginDeleted.mockResolvedValue({
      kind: "flagged",
      profileId: 42,
    });

    expect((await POST(delivery(userDeleted("user_abc")))).status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      "Clerk login deleted outside a deletion the app finishes",
      { profileId: 42 },
    );
  });

  it("refuses a delivery not signed with the secret", async () => {
    const forged = delivery(userDeleted("user_abc"), {
      secret: `whsec_${randomBytes(24).toString("base64")}`,
    });

    expect((await POST(forged)).status).toBe(401);
    expect(recordClerkLoginDeleted).not.toHaveBeenCalled();
  });

  it("refuses a replayed delivery from long ago", async () => {
    const stale = delivery(userDeleted("user_abc"), {
      timestamp: Date.now() - 60 * 60_000,
    });

    expect((await POST(stale)).status).toBe(401);
    expect(recordClerkLoginDeleted).not.toHaveBeenCalled();
  });

  it("refuses everything while no secret is configured", async () => {
    env.CLERK_WEBHOOK_SIGNING_SECRET = undefined;

    expect((await POST(delivery(userDeleted("user_abc")))).status).toBe(500);
    expect(recordClerkLoginDeleted).not.toHaveBeenCalled();
  });

  it("acknowledges other events without acting on them", async () => {
    const response = await POST(
      delivery({ type: "user.updated", object: "event", data: { id: "x" } }),
    );

    expect(response.status).toBe(200);
    expect(recordClerkLoginDeleted).not.toHaveBeenCalled();
  });

  it("answers 500 on a database error, so Clerk delivers it again", async () => {
    recordClerkLoginDeleted.mockRejectedValue(new Error("connection lost"));

    expect((await POST(delivery(userDeleted("user_abc")))).status).toBe(500);
  });

  it("acknowledges a deletion event that names no user", async () => {
    expect((await POST(delivery(userDeleted()))).status).toBe(200);
    expect(recordClerkLoginDeleted).not.toHaveBeenCalled();
  });
});
