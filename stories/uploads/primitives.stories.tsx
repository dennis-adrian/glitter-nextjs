import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";

const meta = {
  title: "Uploads/Primitives/UploadThingImageButton",
  component: UploadThingImageButton,
  args: {
    endpoint: "imageUploader",
    onUploadComplete: fn(),
    onUploading: fn(),
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof UploadThingImageButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Outline: Story = {
  args: {
    buttonLabel: "Elegí una imagen",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText(
      "Seleccionar archivo para imageUploader",
    );
    await userEvent.upload(
      input,
      new File(["storybook"], "portada.png", { type: "image/png" }),
    );
    await expect(args.onUploading).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(args.onUploadComplete).toHaveBeenCalledWith(
        "/img/banner-caceria-de-sellos.png",
      ),
    );
    await waitFor(() =>
      expect(args.onUploading).toHaveBeenLastCalledWith(false),
    );
  },
};

export const PrimaryWithExistingImage: Story = {
  args: {
    variant: "primary",
    hasImage: true,
    changeLabel: "Cambiar portada",
    allowedContent: "JPG, PNG o WebP · máximo 4 MB",
  },
};

export const UploadFailure: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText(
      "Seleccionar archivo para imageUploader",
    );
    await userEvent.upload(
      input,
      new File(["storybook"], "error.png", { type: "image/png" }),
    );
    await waitFor(() =>
      expect(args.onUploading).toHaveBeenLastCalledWith(false),
    );
    await expect(args.onUploadComplete).not.toHaveBeenCalled();
  },
};
