import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import {
  ManagedImageGallery,
  type ManagedGalleryImage,
} from "@/stories/uploads/components/managed-image-gallery";
import { storybookUploadAdapter } from "@/stories/uploads/components/storybook-upload-adapter";

const initialImages: ManagedGalleryImage[] = [
  {
    id: "cover",
    name: "Portada del festival",
    size: 410_000,
    url: "/img/banner-caceria-de-sellos.png",
    isPrimary: true,
  },
  {
    id: "mascot",
    name: "Mascota",
    size: 220_000,
    url: "/img/glitter-mascot-with-stand.png",
    isPrimary: false,
  },
  {
    id: "comic",
    name: "Ilustración",
    size: 310_000,
    url: "/img/landing/mascot-comic.png",
    isPrimary: false,
  },
];

function GalleryStory({
  images = initialImages,
}: {
  images?: ManagedGalleryImage[];
}) {
  const [count, setCount] = useState(images.length);
  return (
    <div className="grid w-full max-w-4xl gap-3">
      <ManagedImageGallery
        initialImages={images}
        upload={storybookUploadAdapter}
        onChange={(nextImages) => setCount(nextImages.length)}
        onDelete={async () => undefined}
        title="Imágenes del producto"
      />
      <output className="text-sm text-muted-foreground">
        Imágenes persistidas: {count}
      </output>
    </div>
  );
}

const meta = {
  title: "Uploads/Reusable Components/Managed Image Gallery",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithImages: Story = {
  render: () => <GalleryStory />,
};

export const Empty: Story = {
  render: () => <GalleryStory images={[]} />,
};

export const InteractionTest: Story = {
  render: () => <GalleryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Establecer Mascota como principal",
      }),
    );
    const mascotCard = canvas
      .getByRole("img", { name: "Mascota" })
      .closest("article");
    await expect(mascotCard).not.toBeNull();
    await expect(within(mascotCard!).getByText("Principal")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Eliminar Portada del festival",
      }),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("img", { name: "Portada del festival" }),
      ).not.toBeInTheDocument(),
    );

    await userEvent.upload(
      canvas.getByLabelText("Añadir imágenes a la galería"),
      new File(["new"], "producto-nuevo.png", { type: "image/png" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("img", { name: "producto-nuevo.png" }),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(canvas.getByText("Imágenes persistidas: 3")).toBeVisible(),
    );
  },
};
