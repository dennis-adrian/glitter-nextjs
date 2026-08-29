// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { paragraph } from "@/app/lib/festival-terms/blocks";

const fetchDraftFestivalTermsVersion = vi.hoisted(() => vi.fn());
const fetchPublishedFestivalTermsVersion = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 1, role: "admin" }),
}));
vi.mock("@/app/lib/festival-terms/persist", () => ({
  createInitialFestivalTermsDraft: vi.fn(),
  ensureDefaultFestivalTerms: vi.fn(),
  insertFestivalTermsSections: vi.fn(),
}));
vi.mock("@/app/lib/festival-terms/queries", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/festival-terms/queries")>();
  return {
    ...actual,
    fetchDraftFestivalTermsVersion,
    fetchPublishedFestivalTermsVersion,
  };
});
vi.mock("@/db", () => ({
  db: dbMock,
}));

const validPublishPayload = {
  changelog: "Publicación de prueba",
  sections: [
    {
      clientId: "a",
      kind: "rich_text" as const,
      layout: "plain" as const,
      title: "Sección",
      bodyJson: [paragraph("Contenido de términos")],
      audienceCategories: [],
      audienceFestivalTypes: [],
    },
    {
      clientId: "b",
      kind: "schedule" as const,
      layout: "plain" as const,
      title: "Horarios",
      bodyJson: null,
      audienceCategories: [],
      audienceFestivalTypes: [],
    },
  ],
};

import {
  getOrCreateFestivalTermsDraft,
  publishFestivalTermsDraft,
} from "@/app/lib/festival-terms/actions";

describe("getOrCreateFestivalTermsDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDraftFestivalTermsVersion.mockReset();
    fetchPublishedFestivalTermsVersion.mockReset();
  });

  it("returns the existing draft without opening a transaction", async () => {
    const draft = { id: 9, documentId: 1, status: "draft" };
    fetchDraftFestivalTermsVersion.mockResolvedValue(draft);

    await expect(getOrCreateFestivalTermsDraft()).resolves.toEqual({
      success: true,
      draft,
    });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns a structured failure when the create transaction throws", async () => {
    fetchDraftFestivalTermsVersion.mockResolvedValue(null);
    fetchPublishedFestivalTermsVersion.mockResolvedValue({
      id: 2,
      documentId: 1,
      versionNumber: 3,
      status: "published",
    });
    dbMock.transaction.mockRejectedValue(new Error("insert failed"));

    await expect(getOrCreateFestivalTermsDraft()).resolves.toEqual({
      success: false,
      message: "No se pudo crear el borrador",
    });
  });

  it("returns the loaded draft after a successful create transaction", async () => {
    const created = { id: 11, documentId: 1, status: "draft" };
    fetchDraftFestivalTermsVersion
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);
    fetchPublishedFestivalTermsVersion.mockResolvedValue({
      id: 2,
      documentId: 1,
      versionNumber: 3,
      status: "published",
    });
    dbMock.transaction.mockResolvedValue({ id: 11 });

    await expect(getOrCreateFestivalTermsDraft()).resolves.toEqual({
      success: true,
      draft: created,
    });
  });
});

describe("publishFestivalTermsDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDraftFestivalTermsVersion.mockReset();
  });

  it("returns DRAFT_UNAVAILABLE_MESSAGE when a concurrent publish already claimed the draft", async () => {
    fetchDraftFestivalTermsVersion.mockResolvedValue({
      id: 5,
      documentId: 1,
      status: "draft",
    });
    dbMock.transaction.mockImplementation(async (callback) => {
      const tx = {
        query: {
          festivalTermsVersions: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      };
      return callback(tx);
    });

    await expect(
      publishFestivalTermsDraft(validPublishPayload),
    ).resolves.toEqual({
      success: false,
      message: "El borrador ya no está disponible",
    });
  });

  it("returns DRAFT_UNAVAILABLE_MESSAGE when the promote update loses the race", async () => {
    fetchDraftFestivalTermsVersion.mockResolvedValue({
      id: 5,
      documentId: 1,
      status: "draft",
      changelog: null,
    });
    dbMock.transaction.mockImplementation(async (callback) => {
      const tx = {
        query: {
          festivalTermsVersions: {
            findFirst: vi.fn().mockResolvedValue({
              id: 5,
              documentId: 1,
              status: "draft",
              changelog: null,
            }),
          },
        },
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
        update: vi
          .fn()
          .mockReturnValueOnce({
            set: () => ({
              where: () => Promise.resolve([]),
            }),
          })
          .mockReturnValueOnce({
            set: () => ({
              where: () => ({
                returning: () => Promise.resolve([]),
              }),
            }),
          }),
      };
      return callback(tx);
    });

    await expect(
      publishFestivalTermsDraft(validPublishPayload),
    ).resolves.toEqual({
      success: false,
      message: "El borrador ya no está disponible",
    });
  });

  it("keeps the generic publish message for unrelated database failures", async () => {
    fetchDraftFestivalTermsVersion.mockResolvedValue({
      id: 5,
      documentId: 1,
      status: "draft",
    });
    dbMock.transaction.mockRejectedValue(new Error("connection reset"));

    await expect(
      publishFestivalTermsDraft(validPublishPayload),
    ).resolves.toEqual({
      success: false,
      message: "Error al publicar los términos",
    });
  });
});
