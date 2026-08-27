import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ImageProofPicker } from "@/stories/uploads/components/image-proof-picker";
import { storybookUploadAdapter } from "@/stories/uploads/components/storybook-upload-adapter";
import type { UploadedImage } from "@/stories/uploads/components/upload-types";

const existingProof: UploadedImage = {
  id: "existing-proof",
  name: "comprobante.png",
  size: 245_000,
  url: "/img/banner-caceria-de-sellos.png",
};

function ProofStory({ initialImage }: { initialImage?: UploadedImage }) {
  const [image, setImage] = useState<UploadedImage | null>(
    initialImage ?? null,
  );
  return (
    <ImageProofPicker
      uploadedImage={image}
      onUploaded={setImage}
      onClear={() => setImage(null)}
      upload={storybookUploadAdapter}
      title="Comprobante de pago"
      instructions="Verifica que el monto y la referencia sean legibles."
    />
  );
}

const meta = {
  title: "Uploads/Reusable Components/Image Proof Picker",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <ProofStory />,
};

export const Uploaded: Story = {
  render: () => <ProofStory initialImage={existingProof} />,
};

export const InteractionTest: Story = {
  render: () => <ProofStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText("Seleccionar comprobante de pago"),
      new File(["proof"], "pago.png", { type: "image/png" }),
    );
    await expect(
      canvas.getByRole("img", {
        name: "Vista previa de comprobante de pago",
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Subir comprobante" }),
    );
    await waitFor(() => expect(canvas.getByText("Cargado")).toBeVisible());
    await expect(
      canvas.getByRole("button", { name: "Reemplazar" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Quitar" }));
    await expect(
      canvas.getByRole("button", { name: /^Elegir una imagen/ }),
    ).toBeVisible();
  },
};
