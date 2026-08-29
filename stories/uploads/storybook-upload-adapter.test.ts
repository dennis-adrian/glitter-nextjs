import { describe, expect, it } from "vitest";

import { storybookUploadAdapter } from "@/stories/uploads/storybook-upload-adapter";

function fakeImage(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

describe("storybookUploadAdapter", () => {
  it("keeps ids unique across separate calls with the same filename", async () => {
    const noopProgress = { onProgress: () => undefined };
    const [first] = await storybookUploadAdapter(
      [fakeImage("repeat.png")],
      noopProgress,
    );
    const [second] = await storybookUploadAdapter(
      [fakeImage("repeat.png")],
      noopProgress,
    );

    expect(first?.id).toMatch(/^storybook-repeat\.png-\d+$/);
    expect(second?.id).toMatch(/^storybook-repeat\.png-\d+$/);
    expect(first?.id).not.toBe(second?.id);
  });

  it("keeps ids unique within a multi-file call that repeats names", async () => {
    const results = await storybookUploadAdapter(
      [fakeImage("dup.png"), fakeImage("dup.png")],
      { onProgress: () => undefined },
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.id).not.toBe(results[1]?.id);
    expect(new Set(results.map((file) => file.id)).size).toBe(2);
  });
});
