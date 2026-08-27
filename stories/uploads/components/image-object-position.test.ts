import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_OBJECT_POSITION,
  imageObjectPositionCss,
  nudgeImageObjectPosition,
  panCoverObjectPosition,
} from "@/stories/uploads/components/image-object-position";

describe("panCoverObjectPosition", () => {
  it("moves object-position left when the image is dragged right", () => {
    const next = panCoverObjectPosition({
      position: DEFAULT_IMAGE_OBJECT_POSITION,
      deltaX: 25,
      deltaY: 0,
      containerWidth: 100,
      containerHeight: 100,
      naturalWidth: 200,
      naturalHeight: 100,
    });

    expect(next.x).toBe(25);
    expect(next.y).toBe(50);
  });

  it("clamps to the image edges", () => {
    const next = panCoverObjectPosition({
      position: DEFAULT_IMAGE_OBJECT_POSITION,
      deltaX: 1000,
      deltaY: -1000,
      containerWidth: 100,
      containerHeight: 100,
      naturalWidth: 200,
      naturalHeight: 400,
    });

    expect(next.x).toBe(0);
    expect(next.y).toBe(100);
  });

  it("keeps the current position when the image does not overflow an axis", () => {
    const next = panCoverObjectPosition({
      position: { x: 40, y: 60 },
      deltaX: 30,
      deltaY: 30,
      containerWidth: 100,
      containerHeight: 100,
      naturalWidth: 100,
      naturalHeight: 100,
    });

    expect(next).toEqual({ x: 40, y: 60 });
  });
});

describe("nudgeImageObjectPosition", () => {
  it("moves the image in the arrow direction", () => {
    expect(
      nudgeImageObjectPosition(DEFAULT_IMAGE_OBJECT_POSITION, "ArrowRight"),
    ).toEqual({ x: 45, y: 50 });
    expect(
      nudgeImageObjectPosition(DEFAULT_IMAGE_OBJECT_POSITION, "ArrowDown"),
    ).toEqual({ x: 50, y: 45 });
  });

  it("clamps keyboard nudges to 0–100", () => {
    expect(nudgeImageObjectPosition({ x: 2, y: 98 }, "ArrowRight")).toEqual({
      x: 0,
      y: 98,
    });
    expect(nudgeImageObjectPosition({ x: 2, y: 98 }, "ArrowUp")).toEqual({
      x: 2,
      y: 100,
    });
  });
});

describe("imageObjectPositionCss", () => {
  it("serializes percentages for object-position", () => {
    expect(imageObjectPositionCss({ x: 20, y: 80 })).toBe("20% 80%");
  });
});
