import { describe, expect, it } from "vitest";

import {
  matchesAccept,
  validateImage,
} from "@/stories/uploads/components/upload-types";

function file(name: string, type: string, size = 10) {
  return new File([new Uint8Array(size)], name, { type });
}

const JPEG_OR_PNG = "image/jpeg,image/png";

describe("matchesAccept", () => {
  it("matches exact types, wildcards and extensions", () => {
    expect(matchesAccept(file("a.png", "image/png"), JPEG_OR_PNG)).toBe(true);
    expect(matchesAccept(file("a.jpg", "image/jpeg"), JPEG_OR_PNG)).toBe(true);
    expect(matchesAccept(file("a.webp", "image/webp"), JPEG_OR_PNG)).toBe(
      false,
    );
    expect(matchesAccept(file("a.webp", "image/webp"), "image/*")).toBe(true);
    expect(matchesAccept(file("a.PNG", "image/png"), ".png")).toBe(true);
    expect(matchesAccept(file("a.svg", "image/svg+xml"), " .png , .jpg ")).toBe(
      false,
    );
  });

  it("accepts anything when the list is empty", () => {
    expect(matchesAccept(file("a.webp", "image/webp"), "")).toBe(true);
  });
});

describe("validateImage", () => {
  it("names the allowed formats when a type is left out", () => {
    expect(validateImage(file("a.webp", "image/webp"), 1024, JPEG_OR_PNG)).toBe(
      "Usá una imagen en formato JPG o PNG.",
    );
    expect(
      validateImage(file("a.svg", "image/svg+xml"), 1024, JPEG_OR_PNG),
    ).toBe("Usá una imagen en formato JPG o PNG.");
  });

  it("keeps accepting any image by default", () => {
    expect(validateImage(file("a.webp", "image/webp"), 1024)).toBeUndefined();
  });

  it("still refuses what is not an image, and what is too big", () => {
    expect(validateImage(file("a.pdf", "application/pdf"), 1024)).toBe(
      "Seleccioná un archivo de imagen.",
    );
    expect(
      validateImage(file("a.png", "image/png", 2048), 1024, JPEG_OR_PNG),
    ).toBe("La imagen supera el máximo de 1 KB.");
  });
});
