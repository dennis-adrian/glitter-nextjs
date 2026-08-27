import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import type { ImageFit } from "@/stories/uploads/components/image-object-position";
import { SingleImageUploadField } from "@/stories/uploads/components/single-image-upload-field";
import { storybookUploadAdapter } from "@/stories/uploads/components/storybook-upload-adapter";
import type { UploadedImage } from "@/stories/uploads/components/upload-types";

function SingleImageStory({
  previewShape = "square",
  fit = "contain",
  initialImage,
}: {
  previewShape?: "circle" | "landscape" | "square";
  fit?: ImageFit;
  initialImage?: UploadedImage;
}) {
  const [image, setImage] = useState<UploadedImage | null>(
    initialImage ?? null,
  );
  return (
    <div className="grid w-full max-w-xl gap-3">
      <SingleImageUploadField
        value={image}
        onChange={setImage}
        upload={storybookUploadAdapter}
        label="Imagen del perfil"
        description="Control inmediato para avatares, logos y arte"
        previewShape={previewShape}
        fit={fit}
      />
      {fit === "cover" && image ? (
        <output className="text-sm text-muted-foreground">
          Recorte {Math.round(image.objectPosition?.x ?? 50)}% horizontal,{" "}
          {Math.round(image.objectPosition?.y ?? 50)}% vertical
        </output>
      ) : null}
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = canvas.getByRole("img", {
      name: "Vista previa de imagen del perfil",
    });
    await expect(image).toHaveAttribute("data-image-fit", "contain");
  },
};

export const CircularAvatarFill: Story = {
  render: () => (
    <SingleImageStory
      previewShape="circle"
      fit="cover"
      initialImage={existingImage}
    />
  ),
};

export const LandscapeArtwork: Story = {
  render: () => (
    <SingleImageStory previewShape="landscape" initialImage={existingImage} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).toHaveAttribute("data-image-fit", "contain");
  },
};

export const CoverReposition: Story = {
  render: () => (
    <SingleImageStory
      previewShape="square"
      fit="cover"
      initialImage={existingImage}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = canvas.getByRole("img", {
      name: "Vista previa de imagen del perfil",
    });
    await expect(image).toHaveAttribute("data-image-fit", "cover");
    await expect(image).toHaveAttribute("data-object-position", "50% 50%");
    image.focus();
    await expect(image).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(image).toHaveAttribute("data-object-position", "45% 50%");
    await expect(
      canvas.getByText("Recorte 45% horizontal, 50% vertical"),
    ).toBeVisible();
  },
};

export const InteractionTest: Story = {
  render: () => <SingleImageStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fileInput = canvas.getByLabelText("Seleccionar imagen del perfil");
    const originalClick = fileInput.click;
    const openSystemPicker = fn();
    fileInput.click = openSystemPicker;
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Seleccionar imagen del perfil desde la vista previa",
      }),
    );
    await expect(openSystemPicker).toHaveBeenCalledOnce();
    fileInput.click = originalClick;

    await userEvent.upload(
      fileInput,
      new File(["profile"], "nuevo-perfil.png", { type: "image/png" }),
    );
    const removeButton = await canvas.findByRole("button", { name: "Quitar" });
    await expect(
      canvas.getByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).toHaveAttribute("data-image-fit", "contain");
    await userEvent.click(removeButton);
    await expect(
      canvas.queryByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).not.toBeInTheDocument();
  },
};
