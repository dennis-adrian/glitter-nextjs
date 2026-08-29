import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SingleImageUploadField } from "@/stories/uploads/components/single-image-upload-field";
import type { UploadedImage } from "@/stories/uploads/components/upload-types";

const existingImage: UploadedImage = {
  id: "existing",
  name: "existing.png",
  size: 12,
  url: "https://example.test/existing.png",
};

function fakeImage(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("SingleImageUploadField remove", () => {
  it("clears the committed value when no staged file is present", () => {
    const onChange = vi.fn();

    render(
      <SingleImageUploadField
        value={existingImage}
        onChange={onChange}
        upload={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quitar imagen" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("cancels a staged replacement without clearing the existing value", () => {
    const onChange = vi.fn();

    render(
      <SingleImageUploadField
        value={existingImage}
        onChange={onChange}
        upload={vi.fn()}
      />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [fakeImage("next.png")] },
    });
    expect(screen.getByText("next.png")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Quitar imagen" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("next.png")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Vista previa de imagen" }),
    ).toBeTruthy();
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      existingImage.url,
    );
  });

  it("clears a staged file without committing null when the field is empty", () => {
    const onChange = vi.fn();

    render(<SingleImageUploadField onChange={onChange} upload={vi.fn()} />);

    fireEvent.change(fileInput(), {
      target: { files: [fakeImage("draft.png")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quitar imagen" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("draft.png")).toBeNull();
  });
});

describe("SingleImageUploadField poster variant", () => {
  it("renders a portrait preview and reports upload state", async () => {
    const onUploadingChange = vi.fn();
    const upload = vi.fn().mockResolvedValue([
      {
        id: "poster",
        name: "poster.png",
        size: 3,
        url: "https://example.test/poster.png",
      },
    ]);

    render(
      <SingleImageUploadField
        onChange={vi.fn()}
        upload={upload}
        previewShape="portrait"
        onUploadingChange={onUploadingChange}
      />,
    );

    expect(document.querySelector('[class*="aspect-[3/4]"]')).toBeTruthy();

    fireEvent.change(fileInput(), {
      target: { files: [fakeImage("poster.png")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Subir imagen" }));

    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(onUploadingChange).toHaveBeenNthCalledWith(2, false),
    );
    expect(onUploadingChange).toHaveBeenNthCalledWith(1, true);
  });
});
