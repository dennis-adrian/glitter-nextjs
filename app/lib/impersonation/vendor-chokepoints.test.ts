// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The outside services a participant's action can change, guarded where the
 * call is made (docs/PLAN-impersonation.md §6.2): during a view each one is
 * refused before the service is asked, whether or not a database write
 * would have come first.
 */

vi.mock("server-only", () => ({}));

const { viewState, refuseMock, clerk, sendNotificationMock } = vi.hoisted(
  () => {
    const viewState = { viewing: true };
    class Refusal extends Error {
      readonly code = "IMPERSONATION_READ_ONLY";
    }
    return {
      viewState,
      refuseMock: vi.fn(async () => {
        if (viewState.viewing) throw new Refusal("solo lectura");
      }),
      clerk: {
        getUser: vi.fn(async () => ({ id: "user_ana" })),
        deleteUser: vi.fn(async () => ({})),
      },
      sendNotificationMock: vi.fn(async () => ({ statusCode: 201, headers: {} })),
    };
  },
);

vi.mock("@/db/write-guard", () => ({ refuseDuringView: refuseMock }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: clerk }),
}));
vi.mock("web-push", () => ({
  default: { sendNotification: sendNotificationMock },
}));

import { guardUTApi } from "@/app/server/uploadthing";
import { deleteClerkUser } from "@/app/lib/users/clerk";
import { sendPush } from "@/app/vendors/web-push";

beforeEach(() => {
  viewState.viewing = true;
  refuseMock.mockClear();
  clerk.getUser.mockClear();
  clerk.deleteUser.mockClear();
  sendNotificationMock.mockClear();
});

function fakeUTApi() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push(name);
      return { success: true, args };
    };
  const api = {
    uploadFiles: record("uploadFiles"),
    uploadFilesFromUrl: record("uploadFilesFromUrl"),
    deleteFiles: record("deleteFiles"),
    renameFiles: record("renameFiles"),
    updateACL: record("updateACL"),
    listFiles: record("listFiles"),
    getSignedURL: record("getSignedURL"),
  };
  return { api: guardUTApi(api), calls };
}

describe("UploadThing during a view", () => {
  it.each([
    "uploadFiles",
    "uploadFilesFromUrl",
    "deleteFiles",
    "renameFiles",
    "updateACL",
  ] as const)("refuses %s before UploadThing is asked", async (method) => {
    const { api, calls } = fakeUTApi();
    await expect(api[method]("key")).rejects.toMatchObject({
      code: "IMPERSONATION_READ_ONLY",
    });
    expect(calls).toEqual([]);
  });

  it("still reads: listing files, signed URLs", async () => {
    const { api, calls } = fakeUTApi();
    await api.listFiles();
    await api.getSignedURL("key");
    expect(calls).toEqual(["listFiles", "getSignedURL"]);
    expect(refuseMock).not.toHaveBeenCalled();
  });

  it("deletes outside a view, with the same arguments", async () => {
    viewState.viewing = false;
    const { api, calls } = fakeUTApi();
    await expect(api.deleteFiles("key")).resolves.toMatchObject({
      success: true,
      args: ["key"],
    });
    expect(calls).toEqual(["deleteFiles"]);
  });

  it("guards the instance the app uses", async () => {
    const { utapi } = await import("@/app/server/uploadthing");
    await expect(utapi.deleteFiles("key")).rejects.toMatchObject({
      code: "IMPERSONATION_READ_ONLY",
    });
  });
});

describe("Clerk during a view", () => {
  it("refuses to delete an account before Clerk is asked", async () => {
    await expect(deleteClerkUser("user_ana")).rejects.toMatchObject({
      code: "IMPERSONATION_READ_ONLY",
    });
    expect(clerk.getUser).not.toHaveBeenCalled();
    expect(clerk.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes outside a view", async () => {
    viewState.viewing = false;
    await expect(deleteClerkUser("user_ana")).resolves.toMatchObject({
      status: "deleted",
    });
    expect(clerk.deleteUser).toHaveBeenCalledWith("user_ana");
  });
});

describe("web push during a view", () => {
  const target = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "p", auth: "a" },
  };
  const options = {
    vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.c" },
    topic: "t",
    ttlSeconds: 60,
  };

  it("sends nothing", async () => {
    await expect(sendPush(target, "{}", options)).rejects.toMatchObject({
      code: "IMPERSONATION_READ_ONLY",
    });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
