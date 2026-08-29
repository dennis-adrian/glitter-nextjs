import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const uploadComplete = vi.hoisted(() => ({
  current: undefined as
    | ((res: Array<{ url?: string; key?: string; serverData?: { imageUrl?: string; fileKey?: string } }>) => void)
    | undefined,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

vi.mock("@/app/components/molecules/entity-thumbnail", () => ({
  default: ({ alt }: { alt: string }) => <div>{alt}</div>,
}));

vi.mock("@/app/vendors/uploadthing", () => ({
  UploadButton: ({
    onClientUploadComplete,
  }: {
    onClientUploadComplete?: typeof uploadComplete.current;
  }) => {
    uploadComplete.current = onClientUploadComplete;
    return <button type="button">upload</button>;
  },
}));

import ImageUploadField from "@/app/components/molecules/image-upload-field";

afterEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  uploadComplete.current = undefined;
  cleanup();
});

describe("ImageUploadField form state", () => {
  it("commits the new url and key on upload", () => {
    const onChange = vi.fn();

    render(
      <ImageUploadField
        value="https://ut.test/old.png"
        fileKey="old-key"
        onChange={onChange}
      />,
    );

    uploadComplete.current?.([{ url: "https://ut.test/new.png", key: "new-key" }]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("https://ut.test/new.png", "new-key");
    expect(toastSuccess).toHaveBeenCalledWith("Imagen subida");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("clears the field when remove is clicked", () => {
    const onChange = vi.fn();

    render(
      <ImageUploadField
        value="https://ut.test/old.png"
        fileKey="old-key"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Quitar/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null, null);
    expect(toastError).not.toHaveBeenCalled();
  });
});
