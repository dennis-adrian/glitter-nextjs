import { describe, expect, it } from "vitest";

import {
  COMUNICADO_IMAGE_CAP_MESSAGE,
  countComunicadoImages,
  foreignComunicadoImageUrls,
} from "@/app/lib/comunicados/images";

const OURS = "https://x7a9.ufs.sh/f/plano";
const OLD_OURS = "https://utfs.io/f/afiche";
const PASTED = "https://www.instagram.com/p/afiche.jpg";

function image(url: unknown, children: unknown[] = []) {
  return { type: "image", props: { url }, children };
}

function paragraph(children: unknown[] = []) {
  return { type: "paragraph", props: {}, content: [], children };
}

describe("countComunicadoImages", () => {
  it("counts image blocks at any depth", () => {
    const doc = [
      image(OURS),
      paragraph([image(OLD_OURS), paragraph([image(PASTED)])]),
      {
        type: "bulletListItem",
        content: [],
        children: [image(OURS, [image(OURS)])],
      },
    ];
    expect(countComunicadoImages(doc)).toBe(5);
  });

  it("leaves out an image with no address yet, which shows nothing", () => {
    expect(
      countComunicadoImages([
        image(""),
        image("   "),
        image(undefined),
        image(3),
        { type: "image" },
        { type: "image", props: null },
        image(OURS),
      ]),
    ).toBe(1);
  });

  it("counts only images", () => {
    expect(
      countComunicadoImages([
        { type: "paragraph", props: { url: OURS }, content: [] },
        { type: "divider" },
      ]),
    ).toBe(0);
  });

  it("reads anything without throwing", () => {
    for (const input of [undefined, null, "x", 3, {}, [null, "x", 3, []]]) {
      expect(countComunicadoImages(input)).toBe(0);
    }
    expect(countComunicadoImages([{ ...image(OURS), children: "x" }])).toBe(1);
  });
});

describe("foreignComunicadoImageUrls", () => {
  it("names each image not uploaded to Glitter, at any depth, in order", () => {
    const doc = [
      image(OURS),
      image(` ${PASTED} `),
      paragraph([image("http://x7a9.ufs.sh/f/plano")]),
      image(OLD_OURS),
      image(PASTED),
    ];
    expect(foreignComunicadoImageUrls(doc)).toEqual([
      PASTED,
      // Not https: as foreign as any other host.
      "http://x7a9.ufs.sh/f/plano",
      // One per image, so the composer can say how many to upload again.
      PASTED,
    ]);
  });

  it("finds none in a document of uploaded images, or of no images", () => {
    expect(foreignComunicadoImageUrls([image(OURS), image(OLD_OURS)])).toEqual(
      [],
    );
    expect(foreignComunicadoImageUrls([paragraph(), image("")])).toEqual([]);
    expect(foreignComunicadoImageUrls(undefined)).toEqual([]);
  });

  it("reads an address as the server stores it, without the control characters it strips", () => {
    const doc = [image(`\u0001${OURS}\u0007`), image("\u0002 \u001f")];
    expect(foreignComunicadoImageUrls(doc)).toEqual([]);
    expect(countComunicadoImages(doc)).toBe(1);
    // A tab or a newline is kept, as the server keeps it: no parser would
    // write it back the same, so it stays foreign.
    expect(foreignComunicadoImageUrls([image(`${OURS}\tx`)])).toHaveLength(1);
  });

  it("flags a query or a look-alike host", () => {
    expect(
      foreignComunicadoImageUrls([
        image(`${OURS}?w=1200`),
        image("https://ufs.sh.example.com/f/plano"),
      ]),
    ).toHaveLength(2);
  });
});

describe("COMUNICADO_IMAGE_CAP_MESSAGE", () => {
  it("names the cap", () => {
    expect(COMUNICADO_IMAGE_CAP_MESSAGE).toBe(
      "Un comunicado puede tener hasta 6 imágenes.",
    );
  });
});
