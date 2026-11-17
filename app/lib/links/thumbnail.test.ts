// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findLinkImage, uploadFilesFromUrl, deleteStoredFile } = vi.hoisted(
  () => ({
    findLinkImage: vi.fn(),
    uploadFilesFromUrl: vi.fn(),
    deleteStoredFile: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/links/link-image", () => ({ findLinkImage }));
vi.mock("@/app/server/uploadthing", () => ({ utapi: { uploadFilesFromUrl } }));
vi.mock("@/app/lib/uploadthing/storage", () => ({ deleteStoredFile }));

import {
  importLinkImage,
  isStoredImageUrl,
  removeLinkImage,
} from "@/app/lib/links/thumbnail";

const STORED = "https://abc123.ufs.sh/f/la-llave";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  deleteStoredFile.mockResolvedValue({ success: true });
});

describe("isStoredImageUrl", () => {
  it.each([STORED, "https://utfs.io/f/la-llave"])("takes %s", (url) => {
    expect(isStoredImageUrl(url)).toBe(true);
  });

  it.each([
    "http://abc123.ufs.sh/f/la-llave",
    "https://evil.example.com/f/la-llave",
    "https://ufs.sh.evil.example.com/f/la-llave",
    "https://evilufs.sh/f/la-llave",
    "https://img.clerk.com/f/la-llave",
    "https://abc123.ufs.sh/otra/ruta",
    "https://abc123.ufs.sh/f/a/b",
    "javascript:alert(1)",
    "/img/local.png",
    "",
  ])("refuses %j", (url) => {
    expect(isStoredImageUrl(url)).toBe(false);
  });
});

describe("importLinkImage", () => {
  it("copies the page's image to our storage and answers the copy", async () => {
    findLinkImage.mockResolvedValue("https://cdn.example.com/share.png");
    uploadFilesFromUrl.mockResolvedValue({
      data: { ufsUrl: STORED, key: "la-llave", type: "image/png" },
      error: null,
    });

    expect(await importLinkImage("https://example.com/")).toBe(STORED);
    expect(uploadFilesFromUrl).toHaveBeenCalledWith(
      "https://cdn.example.com/share.png",
    );
  });

  it("answers null, and copies nothing, for a page with no image", async () => {
    findLinkImage.mockResolvedValue(null);
    expect(await importLinkImage("https://example.com/")).toBeNull();
    expect(uploadFilesFromUrl).not.toHaveBeenCalled();
  });

  it("answers null for a page that cannot be read", async () => {
    findLinkImage.mockRejectedValue(new Error("address is not public"));
    expect(await importLinkImage("http://10.0.0.5/")).toBeNull();
    expect(uploadFilesFromUrl).not.toHaveBeenCalled();
  });

  it("answers null when the copy fails", async () => {
    findLinkImage.mockResolvedValue("https://cdn.example.com/share.png");
    uploadFilesFromUrl.mockResolvedValue({
      data: null,
      error: { code: "BAD_REQUEST" },
    });
    expect(await importLinkImage("https://example.com/")).toBeNull();
  });

  it("throws away a copy that turned out not to be an image", async () => {
    findLinkImage.mockResolvedValue("https://cdn.example.com/page.html");
    uploadFilesFromUrl.mockResolvedValue({
      data: { ufsUrl: STORED, key: "la-llave", type: "text/html" },
      error: null,
    });
    expect(await importLinkImage("https://example.com/")).toBeNull();
    expect(deleteStoredFile).toHaveBeenCalledWith(STORED, "la-llave");
  });
});

describe("removeLinkImage", () => {
  it("deletes a file of ours", async () => {
    await removeLinkImage(STORED);
    expect(deleteStoredFile).toHaveBeenCalledWith(STORED);
  });

  it("leaves alone what is not ours, or nothing", async () => {
    await removeLinkImage("https://evil.example.com/f/x");
    await removeLinkImage(null);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it("does not throw when the file could not be deleted", async () => {
    deleteStoredFile.mockResolvedValue({ success: false });
    await expect(removeLinkImage(STORED)).resolves.toBeUndefined();
  });
});
