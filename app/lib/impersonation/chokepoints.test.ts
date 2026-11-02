// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The side-effect chokepoints of "Entrar como participante"
 * (docs/PLAN-impersonation.md §6.2): while an admin views the app as a
 * participant, these answer without writing, rather than leaving it to the
 * database guard to throw.
 */

vi.mock("server-only", () => ({}));

const { viewState, writes, uploadHandler } = vi.hoisted(() => ({
  viewState: { viewing: true },
  writes: [] as string[],
  uploadHandler: vi.fn(async () => new Response("ok")),
}));

vi.mock("@/app/lib/impersonation/viewer", () => ({
  isImpersonating: async () => viewState.viewing,
}));

/** A database that records any write it is asked for, and reads nothing. */
vi.mock("@/db", () => {
  const chain = (kind: string) => {
    writes.push(kind);
    const builder: Record<string, unknown> = {};
    for (const method of [
      "values",
      "set",
      "where",
      "onConflictDoUpdate",
      "onConflictDoNothing",
      "returning",
    ]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (rows: unknown[]) => unknown) =>
      resolve([{ requestCount: 1 }]);
    return builder;
  };
  return {
    db: {
      insert: () => chain("insert"),
      update: () => chain("update"),
      delete: () => chain("delete"),
    },
  };
});

vi.mock("@/app/lib/notifications/queries", () => ({
  resolveInboxViewer: async () => ({ id: 7, role: "user" }),
  resolveInboxViewerWithAccess: async () => ({ id: 7, role: "user" }),
  retentionCutoff: () => new Date(0),
}));
vi.mock("uploadthing/next", () => ({
  createRouteHandler: () => ({ GET: vi.fn(), POST: uploadHandler }),
}));
vi.mock("@/app/api/uploadthing/core", () => ({ ourFileRouter: {} }));

import { POST as uploadPost } from "@/app/api/uploadthing/route";
import { IMPERSONATION_READ_ONLY_RESULT } from "@/app/lib/impersonation/definitions";
import {
  archiveNotificationAction,
  markAllNotificationsReadAction,
  markGiftsCelebratedAction,
  markNotificationReadAction,
  markNotificationsUnreadAction,
  markNotificationUnreadAction,
  unarchiveNotificationAction,
} from "@/app/lib/notifications/actions";
import { markNotificationRead } from "@/app/lib/notifications/read";
import {
  consumeActionRateLimit,
  releaseActionRateLimit,
} from "@/app/lib/rate-limit";

beforeEach(() => {
  viewState.viewing = true;
  writes.length = 0;
  uploadHandler.mockClear();
});

describe("rate limits during a view", () => {
  it("let the admin through without counting against the participant", async () => {
    await expect(
      consumeActionRateLimit({ key: "stands:7", limit: 1, windowMs: 1000 }),
    ).resolves.toBe(true);
    await releaseActionRateLimit({
      key: "stands:7",
      limit: 1,
      windowMs: 1000,
      now: new Date(),
    });
    expect(writes).toEqual([]);
  });

  it("still count outside a view", async () => {
    viewState.viewing = false;
    await consumeActionRateLimit({ key: "stands:7", limit: 5, windowMs: 1000 });
    expect(writes).toContain("insert");
  });
});

describe("read state during a view", () => {
  it("opens an item without reading it for the participant", async () => {
    await markNotificationRead({ id: 7, role: "user" }, 12);
    await expect(markNotificationReadAction(12)).resolves.toEqual({
      success: true,
    });
    expect(writes).toEqual([]);
  });

  it("leaves a gift for the participant to celebrate, answering as done", async () => {
    await expect(markGiftsCelebratedAction([12])).resolves.toEqual({
      success: true,
    });
    expect(writes).toEqual([]);
  });

  it.each([
    ["markNotificationUnreadAction", () => markNotificationUnreadAction(12)],
    ["archiveNotificationAction", () => archiveNotificationAction(12)],
    ["unarchiveNotificationAction", () => unarchiveNotificationAction(12)],
    [
      "markAllNotificationsReadAction",
      () => markAllNotificationsReadAction("all"),
    ],
    [
      "markNotificationsUnreadAction",
      () => markNotificationsUnreadAction([12]),
    ],
  ])("refuses %s with the read-only message", async (_, run) => {
    await expect(run()).resolves.toEqual(IMPERSONATION_READ_ONLY_RESULT);
    expect(writes).toEqual([]);
  });

  it("reads an item for the participant outside a view", async () => {
    viewState.viewing = false;
    await markNotificationRead({ id: 7, role: "user" }, 12);
    expect(writes).toEqual(["update"]);
  });
});

describe("uploads during a view", () => {
  it("are refused before UploadThing sees them", async () => {
    const response = await uploadPost(
      new Request("https://www.glitter.com.bo/api/uploadthing", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: IMPERSONATION_READ_ONLY_RESULT.message,
    });
    expect(uploadHandler).not.toHaveBeenCalled();
  });

  it("go through outside a view, UploadThing's own callback included", async () => {
    viewState.viewing = false;
    const response = await uploadPost(
      new Request("https://www.glitter.com.bo/api/uploadthing", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(uploadHandler).toHaveBeenCalledTimes(1);
  });
});
