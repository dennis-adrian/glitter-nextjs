import { describe, expect, it } from "vitest";

import { speakerFormSchema } from "@/app/lib/programs/form-schemas";

const speaker = {
  publicName: "Ana",
  bio: "",
};

describe("speakerFormSchema image URLs", () => {
  it.each([
    "https://img.clerk.com/example.jpg",
    "https://files.edgestore.dev/example.jpg",
    "https://utfs.io/f/example",
    "https://ufs.sh/f/example",
    "https://glitter.ufs.sh/f/example",
  ])("accepts configured image host %s", (imageUrl) => {
    expect(speakerFormSchema.safeParse({ ...speaker, imageUrl }).success).toBe(
      true,
    );
  });

  it.each([
    "http://img.clerk.com/example.jpg",
    "https://example.com/image.jpg",
    "https://img.clerk.com.example.com/image.jpg",
  ])("rejects unapproved image URL %s", (imageUrl) => {
    expect(speakerFormSchema.safeParse({ ...speaker, imageUrl }).success).toBe(
      false,
    );
  });
});
