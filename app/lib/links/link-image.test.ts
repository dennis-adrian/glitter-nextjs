// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fetchPublicPage,
  findPageImage,
  isPublicAddress,
} from "@/app/lib/links/link-image";

describe("isPublicAddress", () => {
  it.each([
    "8.8.8.8",
    "151.101.1.140",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
  ])("takes the public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ["this machine", "127.0.0.1"],
    ["this machine, another way", "127.8.9.1"],
    ["the unspecified address", "0.0.0.0"],
    ["a private network", "10.1.2.3"],
    ["a private network", "172.16.0.1"],
    ["a private network", "172.31.255.255"],
    ["a private network", "192.168.1.1"],
    ["a carrier's network", "100.64.0.1"],
    ["the cloud metadata address", "169.254.169.254"],
    ["a benchmark network", "198.18.0.1"],
    ["a documentation block", "203.0.113.7"],
    ["multicast", "224.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["this machine in IPv6", "::1"],
    ["the unspecified IPv6 address", "::"],
    ["a unique local address", "fd12:3456:789a::1"],
    ["a link-local address", "fe80::1"],
    ["a link-local address with a zone", "fe80::1%eth0"],
    ["IPv4 written as IPv6", "::ffff:127.0.0.1"],
    ["IPv4 written as IPv6, in hex", "::ffff:7f00:1"],
    ["the metadata address as IPv6", "::ffff:169.254.169.254"],
    ["an IPv4-compatible address", "::7f00:1"],
    ["a 6to4 address", "2002:7f00:1::1"],
    ["a Teredo address", "2001:0:4136:e378:8000:63bf:3fff:fdd2"],
    ["the IPv6 documentation block", "2001:db8::1"],
    ["IPv6 multicast", "ff02::1"],
    ["a name", "localhost"],
    ["nothing", ""],
    ["something that is not an address", "999.1.1.1"],
  ])("refuses %s (%s)", (_what, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe("findPageImage", () => {
  const PAGE = "https://quiz.productoraglitter.com/glitter";

  it("takes the OpenGraph image", () => {
    const html = `<head><meta property="og:image" content="https://cdn.example.com/a.png"></head>`;
    expect(findPageImage(html, PAGE)).toBe("https://cdn.example.com/a.png");
  });

  it("reads the attributes in any order, with either quote", () => {
    const html = `<meta content='https://cdn.example.com/b.jpg' property='og:image' />`;
    expect(findPageImage(html, PAGE)).toBe("https://cdn.example.com/b.jpg");
  });

  it("resolves an address relative to the page", () => {
    const html = `<meta property="og:image" content="/img/share.png">`;
    expect(findPageImage(html, PAGE)).toBe(
      "https://quiz.productoraglitter.com/img/share.png",
    );
  });

  it("decodes what the page escaped", () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/i?w=1&amp;h=2">`;
    expect(findPageImage(html, PAGE)).toBe("https://cdn.example.com/i?w=1&h=2");
  });

  it("prefers the secure address and falls back to Twitter's", () => {
    expect(
      findPageImage(
        `<meta property="og:image" content="http://a.example.com/1.png">
         <meta property="og:image:secure_url" content="https://a.example.com/1.png">`,
        PAGE,
      ),
    ).toBe("https://a.example.com/1.png");
    expect(
      findPageImage(
        `<meta name="twitter:image" content="https://a.example.com/t.png">`,
        PAGE,
      ),
    ).toBe("https://a.example.com/t.png");
  });

  it("takes nothing that is not a web address", () => {
    for (const content of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
    ]) {
      expect(
        findPageImage(`<meta property="og:image" content="${content}">`, PAGE),
      ).toBeNull();
    }
  });

  it("answers null for a page with no image", () => {
    expect(
      findPageImage("<html><head><title>x</title></head></html>", PAGE),
    ).toBeNull();
    expect(
      findPageImage(`<meta property="og:image" content="">`, PAGE),
    ).toBeNull();
  });
});

describe("fetchPublicPage", () => {
  /** A resolver that answers every name with `address`. */
  const resolvesTo = (address: string) =>
    ((
      _hostname: string,
      options: unknown,
      callback: (error: null, address: unknown, family: number) => void,
    ) => {
      const all = (options as { all?: boolean } | undefined)?.all;
      callback(
        null,
        all ? [{ address, family: address.includes(":") ? 6 : 4 }] : address,
        address.includes(":") ? 6 : 4,
      );
    }) as never;

  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://10.0.0.5:8080/admin",
    "http://[::ffff:127.0.0.1]/",
  ])("refuses the literal address %s before connecting", async (address) => {
    await expect(fetchPublicPage(address)).rejects.toThrow(/not public/);
  });

  it.each(["127.0.0.1", "169.254.169.254", "10.0.0.5", "::1"])(
    "refuses a name that resolves to %s",
    async (address) => {
      await expect(
        fetchPublicPage("http://interno.example.test/", {
          lookup: resolvesTo(address),
        }),
      ).rejects.toThrow(/not public/);
    },
  );

  it.each([
    "ftp://example.com/file",
    "file:///etc/passwd",
    "gopher://example.com/",
  ])("refuses %s, which is not a web address", async (address) => {
    await expect(fetchPublicPage(address)).rejects.toThrow(/web address/);
  });

  it("refuses an address that carries credentials", async () => {
    await expect(
      fetchPublicPage("https://user:secret@example.com/"),
    ).rejects.toThrow(/credentials/);
  });
});
