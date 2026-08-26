import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";

import MobilePaymentBar from "@/app/components/organisms/orders/mobile-payment-bar";
import ProductForm from "@/app/components/organisms/products/product-form";
import { UploadProductFormSchema } from "@/app/components/organisms/participant-products-upload";
import UploadProductModal from "@/app/components/organisms/participant-products-upload/upload-product-modal";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import VoucherUploadCard from "@/app/components/programs/voucher-upload-card";

function PaymentProofStory() {
  const [voucherImageUrl, setVoucherImageUrl] = useState("");
  return (
    <div className="w-full max-w-sm">
      <PaymentProofUpload
        voucherImageUrl={voucherImageUrl}
        onUploadComplete={setVoucherImageUrl}
        onUploading={() => undefined}
      />
    </div>
  );
}

function ParticipantProductStory() {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const form = useForm<z.infer<typeof UploadProductFormSchema>>({
    defaultValues: { name: "", description: "" },
  });
  const file = new File(["product"], "producto.png", { type: "image/png" });

  return (
    <UploadProductModal
      show
      participationId={42}
      currentImage={file}
      onOpenChange={() => undefined}
      onClose={() => undefined}
      uploadedImageUrl={uploadedImageUrl}
      setUploadedImageUrl={setUploadedImageUrl}
      form={form}
    />
  );
}

const meta = {
  title: "Uploads/Workflows",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PaymentProof: Story = {
  render: () => <PaymentProofStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input =
      canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    await expect(input).not.toBeNull();
    await userEvent.upload(
      input!,
      new File(["payment"], "comprobante.png", { type: "image/png" }),
    );
    await expect(
      canvas.getByRole("img", { name: "Vista previa del comprobante" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Subir comprobante" }),
    );
    await expect(
      await canvas.findByRole("img", { name: "Comprobante de pago" }),
    ).toBeVisible();
  },
};

export const ProgramVoucher: Story = {
  render: () => (
    <div className="w-full max-w-xl">
      <VoucherUploadCard
        purchaseId={24}
        totalAmount={150}
        bankQrImageUrl={null}
        qrCoversAmount={false}
        holdExpiresAt={new Date(Date.now() + 15 * 60 * 1000)}
        vouchers={[]}
        changesRequested={false}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Paga y sube tu comprobante" }),
    ).toBeVisible();
    const input =
      canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    await expect(input).not.toBeNull();
    await userEvent.upload(
      input!,
      new File(["voucher"], "voucher.png", { type: "image/png" }),
    );
    await expect(
      canvas.getByRole("img", { name: "Vista previa del comprobante" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Enviar comprobante" }),
    ).toBeEnabled();
  },
};

export const MobileOrderPayment: Story = {
  render: () => (
    <div className="w-[375px] [&>div]:!static [&>div]:!block">
      <MobilePaymentBar orderId={73} expectedRevision={2} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input =
      canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    await expect(input).not.toBeNull();
    await userEvent.upload(
      input!,
      new File(["mobile"], "pago-móvil.png", { type: "image/png" }),
    );
    await waitFor(() =>
      expect(canvas.getByText("pago-móvil.png")).toBeVisible(),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Confirmar pago" }),
      ).toBeEnabled(),
    );
  },
};

export const ParticipantProductModal: Story = {
  render: () => <ParticipantProductStory />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(
        body.getByRole("heading", { name: "Agregar Producto" }),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(body.getByAltText("Product image")).toBeVisible(),
    );
  },
};

export const StoreProductGallery: Story = {
  render: () => (
    <div className="w-[min(1100px,90vw)]">
      <ProductForm />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Imágenes del producto")).toBeVisible();
    const input = canvasElement.querySelector<HTMLInputElement>(
      'input[type="file"][multiple]',
    );
    await expect(input).not.toBeNull();
    await userEvent.upload(
      input!,
      new File(["catalog"], "producto-tienda.png", { type: "image/png" }),
    );
    await expect(
      await canvas.findByRole("img", { name: "Imagen del producto" }),
    ).toBeVisible();
  },
};
