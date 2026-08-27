import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { MultiImageDropzone } from "@/stories/uploads/components/multi-image-dropzone";
import { storybookUploadAdapter } from "@/stories/uploads/components/storybook-upload-adapter";

function DropzoneStory({ maxFiles = 5 }: { maxFiles?: number }) {
  const [uploadedCount, setUploadedCount] = useState(0);
  return (
    <div className="grid w-full max-w-2xl gap-3">
      <MultiImageDropzone
        upload={storybookUploadAdapter}
        onUploaded={(images) => setUploadedCount(images.length)}
        maxFiles={maxFiles}
        title="Galería del evento"
      />
      <output className="text-sm text-muted-foreground">
        Último lote: {uploadedCount} imágenes
      </output>
    </div>
  );
}

const meta = {
  title: "Uploads/Reusable Components/Multi Image Dropzone",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <DropzoneStory />,
};

export const ThreeFileLimit: Story = {
  render: () => <DropzoneStory maxFiles={3} />,
};

export const InteractionTest: Story = {
  render: () => <DropzoneStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Seleccionar galería del evento");
    await userEvent.upload(input, [
      new File(["one"], "escenario.png", { type: "image/png" }),
      new File(["two"], "público.png", { type: "image/png" }),
    ]);
    await expect(canvas.getByText("escenario.png")).toBeVisible();
    await expect(canvas.getByText("público.png")).toBeVisible();
    await expect(
      canvas.getByRole("img", { name: "escenario.png" }),
    ).toHaveAttribute("data-image-fit", "contain");
    await expect(
      canvas.queryByRole("button", { name: /^Quitar$/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Quitar público.png" }),
    );
    await expect(canvas.queryByText("público.png")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Subir 1 imagen" }),
    );
    await waitFor(() =>
      expect(canvas.getByText("1 imagen subida")).toBeVisible(),
    );
    await expect(canvas.getByText("Último lote: 1 imágenes")).toBeVisible();
  },
};
