import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const envLabel = vi.hoisted(() => ({ value: "" }));

vi.mock("@/app/lib/config", () => ({
  getEnvLabel: () => envLabel.value,
}));

import manifest from "@/app/manifest";

/** Width and height from a PNG's header, without decoding it. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("the web app manifest", () => {
  beforeEach(() => {
    envLabel.value = "";
  });

  it("opens Glitter full screen from its own start page", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: "Glitter",
      short_name: "Glitter",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "es",
    });
  });

  it("names a staging install after its environment, as page titles do", () => {
    envLabel.value = "[Prev]";
    expect(manifest()).toMatchObject({
      name: "[Prev] Glitter",
      short_name: "[Prev] Glitter",
    });
  });

  it("offers the 192 and 512 icons Chrome needs, and a maskable one", () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((icon) => `${icon.purpose} ${icon.sizes}`).sort()).toEqual(
      ["any 192x192", "any 512x512", "maskable 512x512"],
    );
  });

  it("points every icon at a PNG of the size it declares", () => {
    for (const icon of manifest().icons ?? []) {
      const file = path.join(process.cwd(), "public", icon.src);
      expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
  });

  it("gives iPhones a 180 px home-screen icon", () => {
    expect(pngSize(path.join(process.cwd(), "app", "apple-icon.png"))).toBe(
      "180x180",
    );
  });
});
