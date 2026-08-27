import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_OBJECT_POSITION,
  formatImageZoom,
  imageObjectPositionCss,
  imageZoom,
  nudgeImageObjectPosition,
  nudgeImageZoom,
  panCoverObjectPosition,
  roundZoom,
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
    const nextX = panCoverObjectPosition({
      position: DEFAULT_IMAGE_OBJECT_POSITION,
      deltaX: 1000,
      deltaY: 0,
      containerWidth: 100,
      containerHeight: 100,
      naturalWidth: 200,
      naturalHeight: 100,
    });
    const nextY = panCoverObjectPosition({
      position: DEFAULT_IMAGE_OBJECT_POSITION,
      deltaX: 0,
      deltaY: -1000,
      containerWidth: 100,
      containerHeight: 100,
      naturalWidth: 100,
      naturalHeight: 400,
    });

    expect(nextX.x).toBe(0);
    expect(nextX.y).toBe(50);
    expect(nextY.x).toBe(50);
    expect(nextY.y).toBe(100);
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

    expect(next).toEqual({ x: 40, y: 60, zoom: 1 });
  });
});

describe("nudgeImageObjectPosition", () => {
  it("moves the image in the arrow direction", () => {
    expect(
      nudgeImageObjectPosition(DEFAULT_IMAGE_OBJECT_POSITION, "ArrowRight"),
    ).toEqual({ x: 45, y: 50, zoom: 1 });
    expect(
      nudgeImageObjectPosition(DEFAULT_IMAGE_OBJECT_POSITION, "ArrowDown"),
    ).toEqual({ x: 50, y: 45, zoom: 1 });
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

describe("image zoom", () => {
  it("clamps and rounds extra magnification", () => {
    expect(roundZoom(0.2)).toBe(1);
    expect(roundZoom(4)).toBe(3);
    expect(imageZoom({ x: 50, y: 50 })).toBe(1);
    expect(formatImageZoom(1.1)).toBe("1,1×");
    expect(nudgeImageZoom({ x: 50, y: 50, zoom: 1 }, "in")).toEqual({
      x: 50,
      y: 50,
      zoom: 1.1,
    });
    expect(nudgeImageZoom({ x: 50, y: 50, zoom: 1 }, "out")).toEqual({
      x: 50,
      y: 50,
      zoom: 1,
    });
  });

  it("uses zoomed overflow when panning a cover crop", () => {
    const next = panCoverObjectPosition({
      position: { x: 50, y: 50, zoom: 2 },
      deltaX: 25,
      deltaY: 0,
      containerWidth: 100,
      containerHeight: 100,
      naturalWidth: 200,
      naturalHeight: 100,
      zoom: 2,
    });

    expect(next.x).toBeLessThan(50);
    expect(next.zoom).toBe(2);
  });
});

describe("imageObjectPositionCss", () => {
  it("serializes percentages for object-position", () => {
    expect(imageObjectPositionCss({ x: 20, y: 80 })).toBe("20% 80%");
  });
});
