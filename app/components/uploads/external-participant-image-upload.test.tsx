import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: vi.fn(),
  },
}));

vi.mock("@/app/components/uploads/uploadthing-image-button", () => ({
  UploadThingImageButton: () => <div>upload</div>,
}));

import { ExternalParticipantImageUpload } from "@/app/components/uploads/external-participant-image-upload";

afterEach(() => {
  toastError.mockReset();
  cleanup();
});

describe("ExternalParticipantImageUpload remove", () => {
  it("keeps the preview and hides Quitar when onRemove is omitted", () => {
    render(
      <ExternalParticipantImageUpload
        imageUrl="https://example.test/logo.png"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByAltText("Vista previa").getAttribute("src")).toBe(
      "https://example.test/logo.png",
    );
    expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull();
  });

  it("toasts when onRemove rejects", async () => {
    render(
      <ExternalParticipantImageUpload
        imageUrl="https://example.test/logo.png"
        onChange={() => undefined}
        onRemove={() => Promise.reject(new Error("delete failed"))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Error al eliminar la imagen");
    });
  });
});
