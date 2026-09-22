import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SectorImageUpload from "./sector-image-upload";

vi.mock("@/app/components/uploads/uploadthing-image-button", () => ({
  UploadThingImageButton: ({
    onUploading,
  }: {
    onUploading?: (uploading: boolean) => void;
  }) => <button onClick={() => onUploading?.(true)}>Upload</button>,
}));

afterEach(cleanup);

const props = {
  imageUrl: null,
  setImageUrl: vi.fn(),
  sectorName: "Cabecera",
  compact: true,
};

describe("SectorImageUpload cleanup", () => {
  it("calls only the latest callback once on unmount, not on rerender", () => {
    const original = vi.fn();
    const latest = vi.fn();
    const { rerender, unmount } = render(
      <SectorImageUpload {...props} onUploading={original} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(original).toHaveBeenCalledExactlyOnceWith(true);

    rerender(<SectorImageUpload {...props} onUploading={latest} />);
    expect(original).toHaveBeenCalledTimes(1);
    expect(latest).not.toHaveBeenCalled();

    unmount();
    expect(original).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("releases the save button when a conditional uploader disappears", () => {
    function Form() {
      const [visible, setVisible] = useState(true);
      const [uploading, setUploading] = useState(false);
      return (
        <>
          {visible && (
            <SectorImageUpload
              {...props}
              onUploading={(value) => setUploading(value)}
            />
          )}
          <button onClick={() => setVisible(false)}>Hide uploader</button>
          <button disabled={uploading}>Save</button>
        </>
      );
    }

    render(<Form />);
    const save = screen.getByRole("button", {
      name: "Save",
    }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hide uploader" }));
    expect(save.disabled).toBe(false);
  });
});
