import type { ImageContent } from "./definitions";

export const CENTERED_IMAGE_FOCAL_POINT = { x: 50, y: 50 } as const;
export const DEFAULT_IMAGE_ZOOM = 1;

export function getImageObjectPosition(focalPoint: ImageContent["focalPoint"]) {
  const point = focalPoint ?? CENTERED_IMAGE_FOCAL_POINT;
  return `${point.x}% ${point.y}%`;
}

export function getImageZoom(zoom: ImageContent["zoom"]) {
  return zoom ?? DEFAULT_IMAGE_ZOOM;
}

const COMMUNITY_GALLERY_LAYOUT = [
  {
    frame: "col-span-2 aspect-video md:col-span-7 md:aspect-[7/4]",
    preview: "aspect-video md:aspect-[7/4]",
    modal: "max-w-2xl",
    sizes: "(max-width: 767px) 100vw, 58vw",
  },
  {
    frame: "aspect-[3/4] md:col-span-5 md:aspect-[5/4]",
    preview: "aspect-[3/4] md:aspect-[5/4]",
    modal: "max-w-sm md:max-w-2xl",
    sizes: "(max-width: 767px) 50vw, 42vw",
  },
  ...Array.from({ length: 3 }, () => ({
    frame: "aspect-[3/4] md:col-span-3",
    preview: "aspect-[3/4]",
    modal: "max-w-sm",
    sizes: "(max-width: 767px) 50vw, 25vw",
  })),
  {
    frame: "col-span-2 aspect-video md:col-span-3 md:aspect-[3/4]",
    preview: "aspect-video md:aspect-[3/4]",
    modal: "max-w-2xl md:max-w-sm",
    sizes: "(max-width: 767px) 100vw, 25vw",
  },
  {
    frame: "aspect-[3/4] md:col-span-5 md:aspect-[5/4]",
    preview: "aspect-[3/4] md:aspect-[5/4]",
    modal: "max-w-sm md:max-w-2xl",
    sizes: "(max-width: 767px) 50vw, 42vw",
  },
  {
    frame: "aspect-[3/4] md:col-span-7 md:aspect-[7/4]",
    preview: "aspect-[3/4] md:aspect-[7/4]",
    modal: "max-w-sm md:max-w-2xl",
    sizes: "(max-width: 767px) 50vw, 58vw",
  },
] as const;

export function getCommunityGalleryLayout(index: number) {
  return COMMUNITY_GALLERY_LAYOUT[index % COMMUNITY_GALLERY_LAYOUT.length];
}
