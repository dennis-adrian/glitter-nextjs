// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventEmitter } from "node:events";
import { isIP } from "node:net";

/**
 * The network, played by hand: each request made through `node:http(s)` is
 * answered by the next of `replies`, and is kept in `requests` to be looked
 * at. A reply says nothing more until the test makes it.
 */
const network = vi.hoisted(() => ({
  replies: [] as ((request: FakeRequest) => void)[],
  requests: [] as FakeRequest[],
}));

type FakeRequest = EventEmitter & {
  url: string;
  lookup: unknown;
  destroyed: boolean;
  destroy: () => void;
  respond: (
    status: number,
    headers?: Record<string, string>,
  ) => EventEmitter & { resume: () => void };
};

function fakeGet(
  url: URL,
  options: { lookup: unknown },
  onResponse: (response: EventEmitter) => void,
) {
  const request = new EventEmitter() as FakeRequest;
  request.url = url.href;
  request.lookup = options.lookup;
  request.destroyed = false;
  request.destroy = () => {
    request.destroyed = true;
  };
  request.respond = (status, headers = {}) => {
    const response = Object.assign(new EventEmitter(), {
      statusCode: status,
      headers,
      resume: () => {},
    });
    onResponse(response);
    return response;
  };
  network.requests.push(request);
  // As the real client does: a name is resolved first, through the lookup it
  // was given, and a refusal there is the request's error.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const answer = () => network.replies.shift()?.(request);
  queueMicrotask(() => {
    if (isIP(host)) return answer();
    (options.lookup as (...args: unknown[]) => void)(
      host,
      {},
      (error: Error | null) =>
        error ? request.emit("error", error) : answer(),
    );
  });
  return request;
}

vi.mock("server-only", () => ({}));
vi.mock("node:http", () => ({ default: { get: fakeGet }, get: fakeGet }));
vi.mock("node:https", () => ({ default: { get: fakeGet }, get: fakeGet }));

import {
  fetchPublicImage,
  fetchPublicPage,
  findPageImage,
  isPublicAddress,
} from "@/app/lib/links/link-image";

/** Answers the next request with `status`, `headers` and the whole `body`. */
function reply(
  status: number,
  headers: Record<string, string> = {},
  body: Buffer | string = "",
) {
  network.replies.push((request) => {
    const response = request.respond(status, headers);
    if (status >= 300 && status < 400) return;
    response.emit("data", Buffer.from(body));
    response.emit("end");
  });
}

beforeEach(() => {
  network.replies.length = 0;
  network.requests.length = 0;
});

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

  it("reads only the head, and a tag only if it is of a sane length", () => {
    const inBody = `<head><title>x</title></head><body><meta property="og:image" content="https://cdn.example.com/body.png"></body>`;
    expect(findPageImage(inBody, PAGE)).toBeNull();
    // With no end of head to stop at, the whole page is read.
    expect(
      findPageImage(
        `<meta property="og:image" content="https://cdn.example.com/a.png">`,
        PAGE,
      ),
    ).toBe("https://cdn.example.com/a.png");
    expect(
      findPageImage(
        `<HEAD><META PROPERTY="og:image" CONTENT="https://cdn.example.com/caps.png"></HEAD>`,
        PAGE,
      ),
    ).toBe("https://cdn.example.com/caps.png");

    const long = `<meta data-x="${"a".repeat(3000)}" property="og:image" content="https://cdn.example.com/long.png">`;
    expect(findPageImage(long, PAGE)).toBeNull();
  });

  it("does not choke on a page of tags that never close", () => {
    // Half a megabyte of `<meta ` with no `>`: unbounded, each one would scan
    // to the end of the page.
    const hostile = "<meta ".repeat(85_000);
    const started = performance.now();
    expect(findPageImage(hostile, PAGE)).toBeNull();
    expect(performance.now() - started).toBeLessThan(3_000);
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

describe("what is fetched, and for how long", () => {
  /** A resolver that answers every name with a public address. */
  const publicLookup = ((
    _hostname: string,
    _options: unknown,
    callback: (error: null, address: string, family: number) => void,
  ) => callback(null, "93.184.216.34", 4)) as never;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes an image of a kind a thumbnail may be", async () => {
    reply(200, { "content-type": "image/png; charset=binary" }, "PNGDATA");
    const image = await fetchPublicImage("https://cdn.example.com/share.png", {
      lookup: publicLookup,
    });
    expect(image).toEqual({
      body: Buffer.from("PNGDATA"),
      type: "image/png",
      extension: "png",
    });
    // The request carries the lookup that refuses private addresses.
    expect(typeof network.requests[0].lookup).toBe("function");
  });

  it.each([
    ["a page", "text/html"],
    ["an SVG, which can carry script", "image/svg+xml"],
    ["something with no type", ""],
  ])("refuses %s in place of an image", async (_what, type) => {
    reply(200, type ? { "content-type": type } : {}, "<svg/>");
    await expect(
      fetchPublicImage("https://cdn.example.com/x", { lookup: publicLookup }),
    ).rejects.toThrow(/not an image/);
  });

  it("refuses an image larger than an upload may be, without reading it all", async () => {
    network.replies.push((request) => {
      const response = request.respond(200, { "content-type": "image/jpeg" });
      response.emit("data", Buffer.alloc(3 * 1024 * 1024));
      response.emit("data", Buffer.alloc(2 * 1024 * 1024));
    });
    await expect(
      fetchPublicImage("https://cdn.example.com/huge.jpg", {
        lookup: publicLookup,
      }),
    ).rejects.toThrow(/too large/);
    expect(network.requests[0].destroyed).toBe(true);
  });

  it.each([
    ["http://169.254.169.254/latest/meta-data/"],
    ["http://127.0.0.1:3000/admin"],
    ["http://[::1]/"],
    ["http://10.0.0.5/img.png"],
  ])("refuses an image a page names at %s", async (address) => {
    await expect(fetchPublicImage(address)).rejects.toThrow(/not public/);
    expect(network.requests).toHaveLength(0);
  });

  it("checks the address again after every redirect, for an image and for a page", async () => {
    reply(302, { location: "http://169.254.169.254/latest/meta-data/" });
    await expect(
      fetchPublicImage("https://cdn.example.com/share.png", {
        lookup: publicLookup,
      }),
    ).rejects.toThrow(/not public/);
    // The first hop was made; the one to the private address never was.
    expect(network.requests.map((request) => request.url)).toEqual([
      "https://cdn.example.com/share.png",
    ]);

    reply(301, { location: "http://127.0.0.1/" });
    await expect(
      fetchPublicPage("https://example.com/", { lookup: publicLookup }),
    ).rejects.toThrow(/not public/);
  });

  it("gives up after a few redirects", async () => {
    for (let hop = 0; hop < 6; hop += 1) {
      reply(302, { location: `https://cdn.example.com/${hop}` });
    }
    await expect(
      fetchPublicImage("https://cdn.example.com/start", {
        lookup: publicLookup,
      }),
    ).rejects.toThrow(/too many redirects/);
    expect(network.requests).toHaveLength(4);
  });

  it("stops a request that trickles past its deadline", async () => {
    vi.useFakeTimers();
    let response: EventEmitter | undefined;
    network.replies.push((request) => {
      response = request.respond(200, { "content-type": "text/html" });
    });
    const page = fetchPublicPage("https://slow.example.com/", {
      lookup: publicLookup,
    });
    const outcome = expect(page).rejects.toThrow(/deadline/);

    // A byte every five seconds: the idle timeout never fires.
    for (let second = 0; second < 15; second += 5) {
      await vi.advanceTimersByTimeAsync(5_000);
      response?.emit("data", Buffer.from("x"));
    }
    await outcome;
    expect(network.requests[0].destroyed).toBe(true);
  });

  it("leaves no timer running once a request is answered", async () => {
    vi.useFakeTimers();
    reply(200, { "content-type": "text/html" }, "<html></html>");
    await fetchPublicPage("https://example.com/", { lookup: publicLookup });
    expect(vi.getTimerCount()).toBe(0);

    reply(500);
    await expect(
      fetchPublicPage("https://example.com/", { lookup: publicLookup }),
    ).rejects.toThrow(/status 500/);
    expect(vi.getTimerCount()).toBe(0);

    network.replies.push((request) =>
      request.emit("error", new Error("socket hang up")),
    );
    await expect(
      fetchPublicPage("https://example.com/", { lookup: publicLookup }),
    ).rejects.toThrow(/socket hang up/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads only the start of a long page", async () => {
    network.replies.push((request) => {
      const response = request.respond(200, { "content-type": "text/html" });
      response.emit(
        "data",
        Buffer.from(
          `<head><meta property="og:image" content="https://cdn.example.com/a.png"></head>`,
        ),
      );
      response.emit("data", Buffer.alloc(600 * 1024, "x"));
    });
    const page = await fetchPublicPage("https://example.com/", {
      lookup: publicLookup,
    });
    expect(page.html).toContain("og:image");
    expect(network.requests[0].destroyed).toBe(true);
  });
});
