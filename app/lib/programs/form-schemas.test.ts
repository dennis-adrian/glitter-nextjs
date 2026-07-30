import { describe, expect, it } from "vitest";

import {
  programFormSchema,
  speakerFormSchema,
} from "@/app/lib/programs/form-schemas";

const speaker = {
  publicName: "Ana",
  bio: "",
};

const program = {
  name: "Glitter Week",
};

const ALLOWED_HOSTS = [
  "https://img.clerk.com/example.jpg",
  "https://files.edgestore.dev/example.jpg",
  "https://utfs.io/f/example",
  "https://ufs.sh/f/example",
  "https://glitter.ufs.sh/f/example",
];

const REJECTED_URLS = [
  "http://img.clerk.com/example.jpg",
  "https://example.com/image.jpg",
  "https://img.clerk.com.example.com/image.jpg",
];

describe("speakerFormSchema image URLs", () => {
  it.each(ALLOWED_HOSTS)("accepts configured image host %s", (imageUrl) => {
    expect(speakerFormSchema.safeParse({ ...speaker, imageUrl }).success).toBe(
      true,
    );
  });

  it.each(REJECTED_URLS)("rejects unapproved image URL %s", (imageUrl) => {
    expect(speakerFormSchema.safeParse({ ...speaker, imageUrl }).success).toBe(
      false,
    );
  });
});

describe("programFormSchema bannerUrl", () => {
  it.each(ALLOWED_HOSTS)("accepts configured image host %s", (bannerUrl) => {
    expect(programFormSchema.safeParse({ ...program, bannerUrl }).success).toBe(
      true,
    );
  });

  it.each(REJECTED_URLS)("rejects unapproved banner URL %s", (bannerUrl) => {
    expect(programFormSchema.safeParse({ ...program, bannerUrl }).success).toBe(
      false,
    );
  });

  it("rejects a malformed URL", () => {
    expect(
      programFormSchema.safeParse({ ...program, bannerUrl: "not a url" })
        .success,
    ).toBe(false);
  });

  it("accepts an omitted banner — it is optional", () => {
    expect(programFormSchema.safeParse(program).success).toBe(true);
  });
});
