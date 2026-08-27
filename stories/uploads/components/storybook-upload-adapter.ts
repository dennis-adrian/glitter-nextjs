import type { ImageUploadAdapter } from "@/stories/uploads/components/upload-types";

const imagePool = [
  "/img/banner-caceria-de-sellos.png",
  "/img/glitter-mascot-with-stand.png",
  "/img/landing/mascot-comic.png",
  "/img/profile-default-banner.png",
] as const;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Deterministic transport used only by Storybook stories and browser tests. */
export const storybookUploadAdapter: ImageUploadAdapter = async (
  files,
  { onProgress },
) => {
  onProgress(20);
  await wait(40);
  onProgress(65);
  await wait(40);
  onProgress(100);
  await wait(30);

  return files.map((file, index) => ({
    id: `storybook-${file.name}-${index}`,
    name: file.name,
    size: file.size,
    url: imagePool[index % imagePool.length],
  }));
};
