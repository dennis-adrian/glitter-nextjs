// @vitest-environment node

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
const deleteFilesMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
// With no `impl`, any database access at all fails the test: a refused caller
// must be turned away before the first query. Ownership checks that need a row
// install a fake `impl` instead.
const dbState = vi.hoisted(() => ({
  touched: 0,
  impl: null as Record<string | symbol, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/app/server/uploadthing", () => ({
  utapi: { deleteFiles: deleteFilesMock },
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
  requireAdminOrFestivalAdmin: async () => {
    const profile = await profileMock();
    return profile &&
      (profile.role === "admin" || profile.role === "festival_admin")
      ? profile
      : null;
  },
  requireProfileOwnerOrStaff: async (profileId: number) => {
    const profile = await profileMock();
    if (!profile) return null;
    return profile.id === profileId ||
      profile.role === "admin" ||
      profile.role === "festival_admin"
      ? profile
      : null;
  },
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        dbState.touched += 1;
        if (dbState.impl) return dbState.impl[prop];
        throw new Error("database touched");
      },
    },
  ),
}));

import * as participantProductActions from "@/app/lib/participant_products/actions";
import {
  createParticipantProduct,
  deleteParticipantProduct,
} from "@/app/lib/participant_products/actions";
import {
  fetchParticipantProducts,
  fetchParticipantProductsByParticipationId,
} from "@/app/lib/participant_products/queries";
import * as uploadthingActions from "@/app/lib/uploadthing/actions";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { signProfilePictureUpload } from "@/app/lib/uploadthing/profile-picture-receipt";
import { signUploadReceipt } from "@/app/lib/uploadthing/upload-receipt";

const participant = {
  id: 5,
  clerkId: "user_participant",
  role: "user",
  status: "verified",
};
const otherParticipantId = 9;
const otherClerkId = "user_other";
const festivalAdmin = {
  id: 2,
  clerkId: "user_festival_admin",
  role: "festival_admin",
  status: "verified",
};
const admin = {
  id: 1,
  clerkId: "user_admin",
  role: "admin",
  status: "verified",
};

const UPLOADTHING_TOKEN = "test-uploadthing-token";
const NEW_IMAGE_URL = "https://app.ufs.sh/f/new-key";

// The product columns a participant sets.
const productFields = {
  name: "Stickers",
  description: "Pack de 5",
  imageUrl: NEW_IMAGE_URL,
  participationId: 3,
};

/**
 * A valid submission with the participant's own upload receipt, so a missing
 * guard would get past validation and reach the database instead of failing
 * for another reason. Built per test because signing reads the stubbed token.
 */
function newProduct() {
  return {
    ...productFields,
    uploadReceipt: signUploadReceipt(
      "imageUploader",
      participant.clerkId,
      NEW_IMAGE_URL,
    ),
  };
}

/** A fake transaction whose delete returns `rows` and records its WHERE. */
function installDeleteTx(rows: Record<string, unknown>[]) {
  const wheres: SQL[] = [];
  dbState.impl = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        delete: () => ({
          where: (where: SQL) => {
            wheres.push(where);
            return { returning: async () => rows };
          },
        }),
      }),
  };
  return wheres;
}

/**
 * Answers each `select … limit` in order, and records each select's WHERE and
 * the inserted values.
 */
function installSelectQueue(results: unknown[][]) {
  const inserted: unknown[] = [];
  const wheres: SQL[] = [];
  dbState.impl = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          wheres.push(where);
          return { limit: async () => results.shift() ?? [] };
        },
      }),
    }),
    insert: () => ({
      values: async (values: unknown) => {
        inserted.push(values);
      },
    }),
  };
  return { inserted, wheres };
}

const params = (where: SQL) => new PgDialect().sqlToQuery(where).params;
const sqlText = (where: SQL) => new PgDialect().sqlToQuery(where).sql;

beforeEach(() => {
  vi.stubEnv("UPLOADTHING_TOKEN", UPLOADTHING_TOKEN);
  profileMock.mockReset();
  deleteFilesMock.mockReset();
  deleteFilesMock.mockResolvedValue({ success: true, deletedCount: 1 });
  revalidatePathMock.mockReset();
  dbState.touched = 0;
  dbState.impl = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the use-server modules expose only their actions", () => {
  it("keeps raw deletion and the cleanup outbox out of uploadthing/actions", () => {
    expect(Object.keys(uploadthingActions).sort()).toEqual(["deleteFile"]);
  });

  it("keeps the product reads out of participant_products/actions", () => {
    expect(Object.keys(participantProductActions).sort()).toEqual([
      "createParticipantProduct",
      "deleteParticipantProduct",
    ]);
  });
});

describe.each([
  ["a signed-out visitor", null],
  ["a participant", participant],
])("deleteFile called by %s", (_, profile) => {
  it("is refused before touching storage or the database", async () => {
    profileMock.mockResolvedValue(profile);

    const result = await deleteFile("https://utfs.io/f/victim-key");

    expect(result).toEqual({ success: false, error: "No autorizado" });
    expect(deleteFilesMock).not.toHaveBeenCalled();
    expect(dbState.touched).toBe(0);
  });
});

describe.each([
  ["a festival admin", festivalAdmin],
  ["an admin", admin],
])("deleteFile called by %s", (_, profile) => {
  it("still deletes the file", async () => {
    profileMock.mockResolvedValue(profile);

    const result = await deleteFile("https://utfs.io/f/staff-key");

    expect(result).toEqual({ success: true });
    expect(deleteFilesMock).toHaveBeenCalledWith("staff-key");
  });
});

describe("participant product actions called by a signed-out visitor", () => {
  beforeEach(() => {
    profileMock.mockResolvedValue(null);
  });

  it.each([
    ["createParticipantProduct", () => createParticipantProduct(newProduct())],
    ["deleteParticipantProduct", () => deleteParticipantProduct(1)],
  ])("%s is refused before any query", async (_name, call) => {
    expect(await call()).toMatchObject({ success: false });
    expect(dbState.touched).toBe(0);
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it("reads no products", async () => {
    expect(await fetchParticipantProducts(participant.id, 1)).toEqual([]);
    expect(
      await fetchParticipantProductsByParticipationId(participant.id, 3),
    ).toEqual([]);
    expect(dbState.touched).toBe(0);
  });
});

describe("participant product reads", () => {
  it("return nothing for another participant's products", async () => {
    profileMock.mockResolvedValue(participant);

    expect(await fetchParticipantProducts(otherParticipantId, 1)).toEqual([]);
    expect(
      await fetchParticipantProductsByParticipationId(otherParticipantId, 3),
    ).toEqual([]);
    expect(dbState.touched).toBe(0);
  });

  it.each([
    ["the participant", participant, participant.id],
    ["a festival admin", festivalAdmin, otherParticipantId],
  ])("let %s through to the query", async (_, profile, profileId) => {
    profileMock.mockResolvedValue(profile);

    await fetchParticipantProducts(profileId, 1);
    await fetchParticipantProductsByParticipationId(profileId, 3);

    expect(dbState.touched).toBeGreaterThan(0);
  });
});

describe("deleteParticipantProduct", () => {
  it("scopes a participant's delete to their own rows", async () => {
    profileMock.mockResolvedValue(participant);
    const wheres = installDeleteTx([]);

    const result = await deleteParticipantProduct(1);

    expect(params(wheres[0])).toEqual([1, participant.id]);
    expect(result).toEqual({ success: false, message: "No autorizado" });
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it("deletes the file the participant's own row points at", async () => {
    profileMock.mockResolvedValue(participant);
    installDeleteTx([
      {
        userId: participant.id,
        participationId: 3,
        imageUrl: "https://utfs.io/f/own-key",
      },
    ]);

    const result = await deleteParticipantProduct(1);

    expect(result).toMatchObject({ success: true });
    expect(deleteFilesMock).toHaveBeenCalledWith("own-key");
  });

  it("lets a festival admin delete any participant's product", async () => {
    profileMock.mockResolvedValue(festivalAdmin);
    const wheres = installDeleteTx([
      {
        userId: otherParticipantId,
        participationId: 3,
        imageUrl: "https://utfs.io/f/their-key",
      },
    ]);

    const result = await deleteParticipantProduct(1);

    expect(params(wheres[0])).toEqual([1]);
    expect(result).toMatchObject({ success: true });
    expect(deleteFilesMock).toHaveBeenCalledWith("their-key");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/profiles/${otherParticipantId}/participations/3/products`,
    );
  });
});

describe("createParticipantProduct", () => {
  beforeEach(() => {
    profileMock.mockResolvedValue(participant);
  });

  it("refuses an image that is not an UploadThing upload", async () => {
    const imageUrl = "https://example.com/f/elsewhere";
    const result = await createParticipantProduct({
      ...productFields,
      imageUrl,
      uploadReceipt: signUploadReceipt(
        "imageUploader",
        participant.clerkId,
        imageUrl,
      ),
    });

    expect(result).toMatchObject({ success: false });
    expect(dbState.touched).toBe(0);
  });

  it.each([
    ["a query", `${NEW_IMAGE_URL}?x=1`],
    ["a fragment", `${NEW_IMAGE_URL}#a`],
    ["an empty query", `${NEW_IMAGE_URL}?`],
  ])(
    "refuses an UploadThing URL with %s, even when signed",
    async (_, imageUrl) => {
      const result = await createParticipantProduct({
        ...productFields,
        imageUrl,
        uploadReceipt: signUploadReceipt(
          "imageUploader",
          participant.clerkId,
          imageUrl,
        ),
      });

      expect(result).toMatchObject({ success: false });
      expect(dbState.touched).toBe(0);
    },
  );

  // The create-then-delete attack: point a product at somebody else's public
  // file, then delete the product to delete the file.
  it.each([
    ["no receipt", () => ""],
    ["a malformed receipt", () => "not-a-receipt"],
    [
      "another user's receipt for that file",
      () => signUploadReceipt("imageUploader", otherClerkId, NEW_IMAGE_URL),
    ],
    [
      "the caller's receipt for a different file",
      () =>
        signUploadReceipt(
          "imageUploader",
          participant.clerkId,
          "https://app.ufs.sh/f/own-other-key",
        ),
    ],
    [
      "the caller's profile picture receipt",
      () => signProfilePictureUpload(participant.id, NEW_IMAGE_URL),
    ],
  ])(
    "refuses a file the caller did not upload (%s) before any query",
    async (_, receipt) => {
      const result = await createParticipantProduct({
        ...productFields,
        uploadReceipt: receipt(),
      });

      expect(result).toEqual({
        success: false,
        message: "No pudimos verificar la imagen. Subila de nuevo.",
      });
      expect(dbState.touched).toBe(0);
    },
  );

  it("refuses a caller whose profile is not verified, before any query", async () => {
    profileMock.mockResolvedValue({ ...participant, status: "pending" });

    const result = await createParticipantProduct(newProduct());

    expect(result).toMatchObject({ success: false });
    expect(dbState.touched).toBe(0);
  });

  it("refuses another participant's participation", async () => {
    const { inserted } = installSelectQueue([[]]);

    const result = await createParticipantProduct(newProduct());

    expect(result).toMatchObject({ success: false });
    expect(inserted).toEqual([]);
  });

  it("refuses an image another product already uses, matched by file key", async () => {
    const { inserted, wheres } = installSelectQueue([
      [{ id: 3 }],
      [{ id: 40 }],
    ]);

    const result = await createParticipantProduct(newProduct());

    expect(result).toMatchObject({ success: false });
    expect(inserted).toEqual([]);
    // The same key under another host or URL form is the same file.
    expect(sqlText(wheres[1])).toContain("split_part");
    expect(params(wheres[1])).toEqual(["new-key"]);
  });

  it("stores only the fields a participant may set", async () => {
    const { inserted } = installSelectQueue([[{ id: 3 }], []]);

    const result = await createParticipantProduct({
      ...newProduct(),
      submissionStatus: "approved",
      submissionFeedback: "ok",
      userId: otherParticipantId,
      id: 77,
    } as Parameters<typeof createParticipantProduct>[0]);

    expect(result).toMatchObject({ success: true });
    expect(inserted).toEqual([{ ...productFields, userId: participant.id }]);
  });
});
