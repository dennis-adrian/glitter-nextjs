import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const uploadButtonProps = vi.hoisted(() => ({
  current: null as null | {
    onClientUploadComplete: (results: unknown[]) => void;
  },
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

// Only UploadThing's own button is stubbed, so the shared
// UploadThingImageButton completion handling runs for real.
vi.mock("@/app/vendors/uploadthing", () => ({
  UploadButton: (props: {
    onClientUploadComplete: (results: unknown[]) => void;
  }) => {
    uploadButtonProps.current = props;
    return null;
  },
}));

import ProfilePicUpload from "@/app/components/user_profile/profile_pic/upload";

const PROFILE = {
  id: 7,
  displayName: "Ana",
  firstName: "Ana",
  lastName: "Quiroga",
} as never;

function renderUpload() {
  const setImageUrl = vi.fn();
  const setUploadReceipt = vi.fn();
  render(
    <ProfilePicUpload
      imageUrl="https://utfs.io/f/current-key"
      setImageUrl={setImageUrl}
      setUploadReceipt={setUploadReceipt}
      profile={PROFILE}
    />,
  );
  return { setImageUrl, setUploadReceipt };
}

function completeUpload(serverData: unknown) {
  act(() => {
    uploadButtonProps.current!.onClientUploadComplete([
      { url: "https://utfs.io/f/response-url", serverData },
    ]);
  });
}

afterEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  uploadButtonProps.current = null;
  cleanup();
});

describe("ProfilePicUpload", () => {
  it("previews the signed URL and keeps its receipt", () => {
    const { setImageUrl, setUploadReceipt } = renderUpload();

    completeUpload({
      results: { imageUrl: "https://utfs.io/f/signed-url", receipt: "r1" },
    });

    expect(setImageUrl).toHaveBeenCalledWith("https://utfs.io/f/signed-url");
    expect(setUploadReceipt).toHaveBeenCalledWith("r1");
    expect(toastSuccess).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it.each([
    ["no server data", null],
    ["no receipt", { results: { imageUrl: "https://utfs.io/f/signed-url" } }],
    ["no signed URL", { results: { receipt: "r1" } }],
  ])(
    "reports an upload with %s as failed and keeps the prior state",
    (_case, serverData) => {
      const { setImageUrl, setUploadReceipt } = renderUpload();

      completeUpload(serverData);

      expect(setImageUrl).not.toHaveBeenCalled();
      expect(setUploadReceipt).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith(
        "No se pudo obtener la imagen subida",
      );
      expect(toastSuccess).not.toHaveBeenCalled();
    },
  );
});
