import { describe, expect, it } from "vitest";

import {
  getUploadThingFileKey,
  isUploadThingFileUrl,
} from "@/app/lib/uploadthing/file-key";

describe("getUploadThingFileKey", () => {
  it("reads the key of a utfs.io, ufs.sh or app.ufs.sh file", () => {
    expect(getUploadThingFileKey("https://utfs.io/f/abc123")).toBe("abc123");
    expect(getUploadThingFileKey("https://ufs.sh/f/abc123")).toBe("abc123");
    expect(getUploadThingFileKey("https://x7a9.ufs.sh/f/abc123")).toBe(
      "abc123",
    );
  });

  it("returns null for another host, a missing key or garbage", () => {
    for (const url of [
      "https://example.com/f/abc123",
      "https://utfs.io.example.com/f/abc123",
      "https://notufs.sh/f/abc123",
      "https://utfs.io/f/",
      "https://utfs.io/abc123",
      "/f/abc123",
      "",
      "no es una dirección",
    ]) {
      expect(getUploadThingFileKey(url)).toBeNull();
    }
  });

  it("stays as lenient as the storage cleanup has always been", () => {
    // Deleting a stored file only needs its key; `isUploadThingFileUrl` is
    // the strict reading.
    expect(getUploadThingFileKey("http://utfs.io/f/abc123")).toBe("abc123");
    expect(getUploadThingFileKey("https://utfs.io/f/abc123?x=1")).toBe(
      "abc123",
    );
  });
});

describe("isUploadThingFileUrl", () => {
  it("takes an https file on utfs.io, ufs.sh or an app's ufs.sh host", () => {
    for (const url of [
      "https://utfs.io/f/abc123",
      "https://ufs.sh/f/abc123",
      "https://x7a9.ufs.sh/f/abc123",
      "https://x7a9.ufs.sh/f/2e0fdb64-9957_imagen.jpg",
      "https://x7a9.ufs.sh/f/abc%20123",
    ]) {
      expect(isUploadThingFileUrl(url)).toBe(true);
    }
  });

  it("refuses another host, or one that only looks like UploadThing's", () => {
    for (const url of [
      "https://example.com/f/abc123",
      "https://utfs.io.example.com/f/abc123",
      "https://notufs.sh/f/abc123",
      "https://ufs.sh.example.com/f/abc123",
      "https://utfs.io./f/abc123",
      // The host is example.com; utfs.io is a user name.
      "https://utfs.io@example.com/f/abc123",
    ]) {
      expect(isUploadThingFileUrl(url)).toBe(false);
    }
  });

  it("refuses any scheme but https", () => {
    for (const url of [
      "http://utfs.io/f/abc123",
      "//utfs.io/f/abc123",
      "ftp://utfs.io/f/abc123",
      "javascript://utfs.io/f/abc123",
      "data:image/png;base64,iVBORw0KGgo=",
    ]) {
      expect(isUploadThingFileUrl(url)).toBe(false);
    }
  });

  it("refuses a query, a fragment, a port or credentials", () => {
    for (const url of [
      "https://utfs.io/f/abc123?",
      "https://utfs.io/f/abc123?x=1",
      "https://utfs.io/f/abc123#x",
      "https://utfs.io:8443/f/abc123",
      "https://user:clave@utfs.io/f/abc123",
      "https://evil.example@x7a9.ufs.sh/f/abc123",
    ]) {
      expect(isUploadThingFileUrl(url)).toBe(false);
    }
  });

  it("refuses a missing key or a path that is not /f/<key>", () => {
    for (const url of [
      "https://utfs.io",
      "https://utfs.io/",
      "https://utfs.io/f",
      "https://utfs.io/f/",
      "https://utfs.io/f/abc/def",
      "https://utfs.io/f/abc/",
      "https://utfs.io/x/f/abc",
      "https://utfs.io/f/..",
      "https://utfs.io/abc123",
    ]) {
      expect(isUploadThingFileUrl(url)).toBe(false);
    }
  });

  it("refuses an address a URL parser would have to clean first", () => {
    for (const url of [
      " https://utfs.io/f/abc123",
      "https://utfs.io/f/abc123 ",
      "https://utfs.io/f/abc 123",
      "https://utfs.io/f/abc\t123",
      "https://utfs.io/f/abc\n123",
      "https://utfs.io/f/abc\u0000",
      "https:\\\\utfs.io\\f\\abc123",
      "https://utfs.io\\f\\abc123",
      "HTTPS://X7A9.UFS.SH/f/abc123",
      "https://utfs.io:443/f/abc123",
      "https://utfs.io/f/abc/../def",
      "https://utfs.io/f/ñ",
    ]) {
      expect(isUploadThingFileUrl(url)).toBe(false);
    }
  });

  it("refuses garbage without throwing", () => {
    for (const url of ["", "utfs.io/f/abc123", "https://", "https://[::1"]) {
      expect(isUploadThingFileUrl(url)).toBe(false);
    }
    expect(isUploadThingFileUrl(undefined as unknown as string)).toBe(false);
    expect(isUploadThingFileUrl(42 as unknown as string)).toBe(false);
  });
});
