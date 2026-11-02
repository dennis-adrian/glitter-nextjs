// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMUNICADO_IMAGE_SIZE_MESSAGE,
  COMUNICADO_IMAGE_TYPE_MESSAGE,
  COMUNICADO_IMAGE_UPLOAD_FAILED,
  comunicadoImageFileProblem,
  useComunicadoImageUpload,
} from "@/app/components/comunicados/admin/use-comunicado-image-upload";
import { COMUNICADO_IMAGE_MAX_BYTES } from "@/app/lib/comunicados/definitions";

const mocks = vi.hoisted(() => ({
  endpoint: null as string | null,
  startUpload: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/app/vendors/uploadthing", () => ({
  useUploadThing: (endpoint: string) => {
    mocks.endpoint = endpoint;
    return { startUpload: mocks.startUpload, isUploading: false };
  },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

function file(type: string, size = 10) {
  return new File([new Uint8Array(size)], "plano", { type });
}

function upload() {
  return renderHook(() => useComunicadoImageUpload()).result.current;
}

describe("comunicadoImageFileProblem", () => {
  it("takes a JPEG or a PNG up to 4 MB", () => {
    expect(comunicadoImageFileProblem(file("image/jpeg"))).toBeNull();
    expect(
      comunicadoImageFileProblem(file("image/png", COMUNICADO_IMAGE_MAX_BYTES)),
    ).toBeNull();
  });

  it.each(["image/webp", "image/svg+xml", "image/gif", "application/pdf", ""])(
    "refuses %j, which Outlook or Gmail would break",
    (type) => {
      expect(comunicadoImageFileProblem(file(type))).toBe(
        "Subí una imagen JPG o PNG.",
      );
    },
  );

  it("refuses a byte over 4 MB", () => {
    expect(
      comunicadoImageFileProblem(
        file("image/jpeg", COMUNICADO_IMAGE_MAX_BYTES + 1),
      ),
    ).toBe("La imagen pesa más de 4 MB.");
  });
});

describe("useComunicadoImageUpload", () => {
  beforeEach(() => {
    mocks.endpoint = null;
    mocks.startUpload.mockReset();
    mocks.toastError.mockReset();
  });

  it("uploads to the comunicado route and answers its address", async () => {
    mocks.startUpload.mockResolvedValue([
      { serverData: { imageUrl: "https://abc.ufs.sh/f/PLANO" } },
    ]);
    const png = file("image/png");

    await expect(upload()(png)).resolves.toBe("https://abc.ufs.sh/f/PLANO");
    expect(mocks.endpoint).toBe("comunicadoImage");
    expect(mocks.startUpload).toHaveBeenCalledWith([png]);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it.each([
    ["a WebP", file("image/webp"), COMUNICADO_IMAGE_TYPE_MESSAGE],
    [
      "a large photo",
      file("image/jpeg", COMUNICADO_IMAGE_MAX_BYTES + 1),
      COMUNICADO_IMAGE_SIZE_MESSAGE,
    ],
  ])(
    "refuses %s before sending anything, and toasts why",
    async (_what, refused, message) => {
      await expect(upload()(refused)).rejects.toThrow(message);
      expect(mocks.startUpload).not.toHaveBeenCalled();
      expect(mocks.toastError).toHaveBeenCalledWith(message);
    },
  );

  it.each([
    ["the route refused it", async () => undefined],
    ["no address came back", async () => [{ serverData: null }]],
    [
      "the network failed",
      async () => {
        throw new Error("offline");
      },
    ],
  ])("says it could not upload when %s", async (_what, answer) => {
    mocks.startUpload.mockImplementation(answer);

    await expect(upload()(file("image/png"))).rejects.toThrow(
      COMUNICADO_IMAGE_UPLOAD_FAILED,
    );
    expect(COMUNICADO_IMAGE_UPLOAD_FAILED).toBe("No se pudo subir la imagen.");
    expect(mocks.toastError).toHaveBeenCalledWith(
      COMUNICADO_IMAGE_UPLOAD_FAILED,
    );
  });
});
