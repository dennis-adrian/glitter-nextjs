import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import type { ImageFit } from "@/stories/uploads/components/image-object-position";
import { SingleImageUploadField } from "@/stories/uploads/components/single-image-upload-field";
import { storybookUploadAdapter } from "@/stories/uploads/storybook-upload-adapter";
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
        description="Seleccioná una imagen y confirmá con Subir"
        previewShape={previewShape}
        fit={fit}
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
  parameters: { layout: "padded" },
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
    const image = canvas.getByRole("group", {
      name: "Vista previa de imagen del perfil",
    });
    await expect(image).toHaveAttribute("data-image-fit", "cover");
    await expect(image).toHaveAttribute("data-object-position", "50% 50%");
    await expect(image).toHaveAttribute("data-image-zoom", "1");
    image.focus();
    await expect(image).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect(image).toHaveAttribute("data-object-position", "40% 50%");
    await userEvent.click(canvas.getByRole("button", { name: "Acercar" }));
    await expect(image).toHaveAttribute("data-image-zoom", "1.1");
    await expect(canvas.getByText("Zoom 1,1×")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Quitar imagen del perfil" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Cambiar imagen" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /^Quitar$/ }),
    ).not.toBeInTheDocument();
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
    await expect(
      canvas.getByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).toHaveAttribute("data-image-fit", "contain");
    await expect(canvas.getByText("nuevo-perfil.png")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Subir imagen" }));
    await expect(
      canvas.findByRole("button", { name: "Quitar imagen del perfil" }),
    ).resolves.toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Subir imagen" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Quitar imagen del perfil" }),
    );
    await expect(
      canvas.queryByRole("img", { name: "Vista previa de imagen del perfil" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Seleccionar imagen" }),
    ).toBeVisible();
  },
};
