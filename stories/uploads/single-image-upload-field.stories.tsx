import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { SingleImageUploadField } from "@/stories/uploads/components/single-image-upload-field";
import { storybookUploadAdapter } from "@/stories/uploads/components/storybook-upload-adapter";
import type { UploadedImage } from "@/stories/uploads/components/upload-types";

function SingleImageStory({
  previewShape = "square",
  initialImage,
}: {
  previewShape?: "circle" | "landscape" | "square";
  initialImage?: UploadedImage;
}) {
  const [image, setImage] = useState<UploadedImage | null>(
    initialImage ?? null,
  );
  return (
    <div className="w-full max-w-xl">
      <SingleImageUploadField
        value={image}
        onChange={setImage}
        upload={storybookUploadAdapter}
        label="Imagen del perfil"
        description="Control inmediato para avatares, logos y arte"
        previewShape={previewShape}
      />
    </div>
  );
}

const existingImage: UploadedImage = {
  id: "existing-profile",
  name: "perfil-actual.png",
  size: 184_000,
  url: "/img/glitter-mascot-with-stand.png",
};

const meta = {
  title: "Uploads/Reusable Components/Single Image Upload Field",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <SingleImageStory />,
};

export const CircularAvatar: Story = {
  render: () => (
    <SingleImageStory previewShape="circle" initialImage={existingImage} />
  ),
};

export const LandscapeArtwork: Story = {
  render: () => (
    <SingleImageStory previewShape="landscape" initialImage={existingImage} />
  ),
};

export const InteractionTest: Story = {
  render: () => <SingleImageStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText("Seleccionar imagen del perfil"),
      new File(["profile"], "nuevo-perfil.png", { type: "image/png" }),
    );
    const removeButton = await canvas.findByRole("button", { name: "Quitar" });
    await expect(
      canvas.getByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).toBeVisible();
    await userEvent.click(removeButton);
    await expect(
      canvas.queryByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).not.toBeInTheDocument();
  },
};
