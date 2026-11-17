// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findLinkImage, fetchPublicImage, uploadFiles, deleteStoredFile } =
  vi.hoisted(() => ({
    findLinkImage: vi.fn(),
    fetchPublicImage: vi.fn(),
    uploadFiles: vi.fn(),
    deleteStoredFile: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/links/link-image", () => ({
  findLinkImage,
  fetchPublicImage,
}));
// `uploadFilesFromUrl` is left out on purpose: it has this server fetch the
// address itself, unchecked, so nothing here may call it.
vi.mock("@/app/server/uploadthing", () => ({ utapi: { uploadFiles } }));
vi.mock("@/app/lib/uploadthing/storage", () => ({ deleteStoredFile }));

import {
  importLinkImage,
  isStoredImageUrl,
  removeLinkImage,
} from "@/app/lib/links/thumbnail";

const STORED = "https://abc123.ufs.sh/f/la-llave";
const PNG = {
  body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  type: "image/png",
  extension: "png",
};

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
  it("fetches the page's image itself, checked, and stores it as a file", async () => {
    findLinkImage.mockResolvedValue("https://cdn.example.com/share.png");
    fetchPublicImage.mockResolvedValue(PNG);
    uploadFiles.mockResolvedValue({
      data: { ufsUrl: STORED, key: "la-llave" },
      error: null,
    });

    expect(await importLinkImage("https://example.com/")).toBe(STORED);
    expect(fetchPublicImage).toHaveBeenCalledWith(
      "https://cdn.example.com/share.png",
    );
    // A file, with its bytes: never the address, for UploadThing's client to
    // fetch on this server unchecked.
    const [file] = uploadFiles.mock.calls[0];
    expect(file).toBeInstanceOf(Blob);
    expect(file.name).toBe("link.png");
    expect(file.type).toBe("image/png");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG.body);
  });

  it("answers null, and fetches nothing more, for a page with no image", async () => {
    findLinkImage.mockResolvedValue(null);
    expect(await importLinkImage("https://example.com/")).toBeNull();
    expect(fetchPublicImage).not.toHaveBeenCalled();
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it("answers null for a page that cannot be read", async () => {
    findLinkImage.mockRejectedValue(new Error("address is not public"));
    expect(await importLinkImage("http://10.0.0.5/")).toBeNull();
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it.each(["address is not public", "not an image", "too large", "deadline"])(
    "stores nothing when the image is refused: %s",
    async (reason) => {
      // The page is fine; the image it names is on a private address, is not
      // an image, is too big or never finishes.
      findLinkImage.mockResolvedValue(
        "http://169.254.169.254/latest/meta-data",
      );
      fetchPublicImage.mockRejectedValue(new Error(reason));

      expect(await importLinkImage("https://example.com/")).toBeNull();
      expect(uploadFiles).not.toHaveBeenCalled();
    },
  );

  it("answers null when the copy fails", async () => {
    findLinkImage.mockResolvedValue("https://cdn.example.com/share.png");
    fetchPublicImage.mockResolvedValue(PNG);
    uploadFiles.mockResolvedValue({
      data: null,
      error: { code: "BAD_REQUEST" },
    });
    expect(await importLinkImage("https://example.com/")).toBeNull();
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
