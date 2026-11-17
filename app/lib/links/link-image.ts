import "server-only";

import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

/*
 * Finding the image a page offers for itself (its OpenGraph image), for a
 * link's thumbnail. The address is one an admin typed, and this server is
 * what fetches it, so the fetch refuses anything that is not a public web
 * server: see `isPublicAddress`.
 */

/**
 * Whether an IP address is one on the public internet. Everything this
 * server could reach that an outsider could not is refused: loopback, the
 * private and carrier-grade ranges, link-local (the cloud metadata address
 * among them), multicast and the reserved blocks, in IPv4, IPv6 and IPv4
 * written as IPv6.
 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIPv4(address);
  if (version !== 6) return false;

  const lower = address.toLowerCase().split("%")[0];
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPublicIPv4(mapped[1]);
  const hex = expandIPv6(lower);
  if (!hex) return false;
  // ::ffff:a.b.c.d and the deprecated ::a.b.c.d, written in hex.
  if (/^0{20}(ffff|0000)/.test(hex)) {
    const tail = hex.slice(24);
    const octets = [0, 2, 4, 6].map((i) => parseInt(tail.slice(i, i + 2), 16));
    return /^0{20}ffff/.test(hex) ? isPublicIPv4(octets.join(".")) : false;
  }
  const first = parseInt(hex.slice(0, 4), 16);
  // Only global unicast, 2000::/3, and of it not the documentation,
  // 6to4 and Teredo blocks, which carry an IPv4 address of their own.
  if ((first & 0xe000) !== 0x2000) return false;
  if (hex.startsWith("20010db8")) return false;
  if (hex.startsWith("2002")) return false;
  if (hex.startsWith("20010000")) return false;
  return true;
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) {
    return false;
  }
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

/** The 32 hex digits of an IPv6 address, or null when it is not one. */
function expandIPv6(address: string): string | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(Math.max(missing, 0)).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => group.padStart(4, "0")).join("");
}

const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTRIBUTE_RE = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

/** The image names a page may give, in the order they are trusted. */
const IMAGE_META_NAMES = [
  "og:image:secure_url",
  "og:image:url",
  "og:image",
  "twitter:image",
  "twitter:image:src",
];

/**
 * The address of the image an HTML page offers for itself, resolved against
 * the page's own address, or null. Only an `http(s)` address is taken.
 */
export function findPageImage(html: string, pageUrl: string): string | null {
  const found = new Map<string, string>();
  for (const [tag] of html.matchAll(META_TAG_RE)) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(ATTRIBUTE_RE)) {
      attributes.set(
        match[1].toLowerCase(),
        match[2] ?? match[3] ?? match[4] ?? "",
      );
    }
    const name = (
      attributes.get("property") ??
      attributes.get("name") ??
      ""
    ).toLowerCase();
    const content = attributes.get("content")?.trim();
    if (name && content && !found.has(name)) found.set(name, content);
  }

  for (const name of IMAGE_META_NAMES) {
    const content = found.get(name);
    if (!content) continue;
    try {
      const url = new URL(decodeEntities(content), pageUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.href;
      }
    } catch {
      // Not an address; the next name may have one.
    }
  }
  return null;
}

type Lookup = typeof dnsLookup;

/**
 * `dns.lookup`, refusing a name that resolves to anything but a public
 * address. Given to the request itself, so the address checked is the one
 * connected to: a name cannot answer with a public address for the check and
 * a private one for the connection.
 */
function publicOnlyLookup(lookup: Lookup): Lookup {
  return ((hostname: string, options: unknown, callback: unknown) => {
    const done = (typeof options === "function" ? options : callback) as (
      error: NodeJS.ErrnoException | null,
      address?: unknown,
      family?: number,
    ) => void;
    const lookupOptions = typeof options === "function" ? {} : options;
    (lookup as unknown as (...args: unknown[]) => void)(
      hostname,
      lookupOptions,
      (
        error: NodeJS.ErrnoException | null,
        address: string | { address: string; family: number }[],
        family?: number,
      ) => {
        if (error) return done(error);
        const addresses = Array.isArray(address)
          ? address.map((entry) => entry.address)
          : [address];
        if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
          return done(
            Object.assign(new Error("address is not public"), {
              code: "ENOTPUBLIC",
            }),
          );
        }
        done(null, address, family);
      },
    );
  }) as unknown as Lookup;
}

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 512 * 1024;
const TIMEOUT_MS = 6_000;

type PageFetch = { url: string; html: string };

/** One GET, without following its redirect. */
function requestOnce(
  url: URL,
  lookup: Lookup,
): Promise<{ status: number; location?: string; html: string; type: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(
      url,
      {
        lookup,
        timeout: TIMEOUT_MS,
        headers: {
          accept: "text/html,application/xhtml+xml",
          // Sites answer a bare client with a consent or bot page.
          "user-agent":
            "Mozilla/5.0 (compatible; link-preview/1.0; +https://ogp.me)",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const type = String(response.headers["content-type"] ?? "");
        const location = response.headers.location;
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, location, html: "", type });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          // The meta tags are in the head; the rest is not read.
          if (size >= MAX_HTML_BYTES) response.destroy();
        });
        const finish = () =>
          resolve({
            status,
            html: Buffer.concat(chunks).toString("utf8"),
            type,
          });
        response.on("end", finish);
        response.on("close", finish);
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

function assertFetchable(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("not a web address");
  }
  if (url.username || url.password) throw new Error("credentials in address");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // A literal address never goes through the lookup, so it is checked here.
  if (isIP(host) && !isPublicAddress(host)) {
    throw new Error("address is not public");
  }
}

/**
 * The HTML of a public web page, following a few redirects, each one checked
 * like the first address. Throws when the page cannot be had.
 */
export async function fetchPublicPage(
  address: string,
  { lookup = dnsLookup }: { lookup?: Lookup } = {},
): Promise<PageFetch> {
  const guarded = publicOnlyLookup(lookup);
  let url = new URL(address);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertFetchable(url);
    const response = await requestOnce(url, guarded);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location) throw new Error("redirect without location");
      url = new URL(response.location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`status ${response.status}`);
    }
    if (response.type && !/html|xml/i.test(response.type)) {
      throw new Error("not a page");
    }
    return { url: url.href, html: response.html };
  }
  throw new Error("too many redirects");
}

/** The image a public page offers for itself, or null. */
export async function findLinkImage(
  address: string,
  options?: { lookup?: Lookup },
): Promise<string | null> {
  const page = await fetchPublicPage(address, options);
  return findPageImage(page.html, page.url);
}
