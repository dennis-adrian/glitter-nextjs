import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ManagedImageGallery,
  type ManagedGalleryImage,
} from "@/stories/uploads/components/managed-image-gallery";

afterEach(cleanup);

function galleryImage(id: string, isPrimary: boolean): ManagedGalleryImage {
  return {
    id,
    name: id,
    size: 100,
    url: `/${id}.png`,
    isPrimary,
  };
}

function primaryIds(images: ManagedGalleryImage[]) {
  return images.filter((image) => image.isPrimary).map((image) => image.id);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const threeImages = [
  galleryImage("cover", true),
  galleryImage("mascot", false),
  galleryImage("comic", false),
];

describe("ManagedImageGallery delete primary promotion", () => {
  it("promotes remaining[0] when the deleted image is still primary", async () => {
    const onChange = vi.fn();
    const { promise, resolve } = deferred();

    render(
      <ManagedImageGallery
        initialImages={threeImages}
        upload={async () => []}
        onChange={onChange}
        onDelete={() => promise}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar cover" }));
    resolve();

    await waitFor(() => {
      const latest = onChange.mock.calls.at(-1)?.[0] as ManagedGalleryImage[];
      expect(primaryIds(latest)).toEqual(["mascot"]);
    });
  });

  it("does not promote remaining[0] when primary moved off the deleted image", async () => {
    const onChange = vi.fn();
    const { promise, resolve } = deferred();

    render(
      <ManagedImageGallery
        initialImages={threeImages}
        upload={async () => []}
        onChange={onChange}
        onDelete={() => promise}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar cover" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Establecer comic como principal" }),
    );
    resolve();

    await waitFor(() => {
      const latest = onChange.mock.calls.at(-1)?.[0] as ManagedGalleryImage[];
      expect(latest.map((image) => image.id)).toEqual(["mascot", "comic"]);
      expect(primaryIds(latest)).toEqual(["comic"]);
    });
  });

  it("promotes remaining[0] when the deleted image became primary during delete", async () => {
    const onChange = vi.fn();
    const { promise, resolve } = deferred();

    render(
      <ManagedImageGallery
        initialImages={threeImages}
        upload={async () => []}
        onChange={onChange}
        onDelete={() => promise}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar mascot" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Establecer mascot como principal" }),
    );
    resolve();

    await waitFor(() => {
      const latest = onChange.mock.calls.at(-1)?.[0] as ManagedGalleryImage[];
      expect(latest.map((image) => image.id)).toEqual(["cover", "comic"]);
      expect(primaryIds(latest)).toEqual(["cover"]);
    });
  });
});
