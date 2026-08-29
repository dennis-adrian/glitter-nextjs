import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

const reusableComponents = [
  {
    name: "SingleImageUploadField",
    useCases:
      "Avatares, logos, banners y arte; selección local, Subir para confirmar, cover con recorte y quitar en overlay",
  },
  {
    name: "ImageProofPicker",
    useCases: "Comprobantes de pago y evidencia con confirmación explícita",
  },
  {
    name: "MultiImageDropzone",
    useCases: "Carga por lote, arrastrar y soltar, y quitar desde el overlay",
  },
  {
    name: "ManagedImageGallery",
    useCases:
      "Galerías persistidas con imagen principal, overlay de eliminar y recorte cover",
  },
] as const;

const components = [
  {
    name: "UploadThingImageButton",
    kind: "Legacy primitive",
    endpoint: "6 single-image endpoints",
    location: "app/components/uploads/uploadthing-image-button.tsx",
  },
  {
    name: "ExternalParticipantImageUpload",
    kind: "Reusable form control",
    endpoint: "externalParticipantImage",
    location: "app/components/uploads/external-participant-image-upload.tsx",
  },
  {
    name: "BannerImageUpload",
    kind: "Reusable form control",
    endpoint: "bannerImage",
    location: "app/components/uploads/banner-image-upload.tsx",
  },
  {
    name: "ProfilePicUpload",
    kind: "Reusable form control",
    endpoint: "profilePicture",
    location: "app/components/user_profile/profile_pic/upload.tsx",
  },
  {
    name: "SectorImageUpload",
    kind: "Reusable form control",
    endpoint: "imageUploader",
    location: "app/components/festivals/sectors/sector-image-upload.tsx",
  },
  {
    name: "FileInput",
    kind: "Reusable form control",
    endpoint: "imageUploader / qrCode",
    location: "app/components/form/fields/file.tsx",
  },
  {
    name: "ProgramImageUpload",
    kind: "Reusable form control",
    endpoint: "programArtwork",
    location: "app/components/dashboard/programs/program-image-upload.tsx",
  },
  {
    name: "SpeakerImageUpload",
    kind: "Reusable form control",
    endpoint: "speakerImage",
    location: "app/components/dashboard/programs/speaker-image-upload.tsx",
  },
  {
    name: "Dropzone",
    kind: "Reusable multi-image control",
    endpoint: "festivalActivityParticipantProof",
    location: "app/components/organisms/dropzone/index.tsx",
  },
  {
    name: "PaymentProofUpload",
    kind: "Domain workflow",
    endpoint: "reservation / store / guest payment",
    location: "app/components/payments/payment-proof-upload.tsx",
  },
  {
    name: "VoucherUploadCard",
    kind: "Domain workflow",
    endpoint: "sessionPurchaseVoucher",
    location: "app/components/programs/voucher-upload-card.tsx",
  },
  {
    name: "MobilePaymentBar",
    kind: "Domain workflow",
    endpoint: "store / guest payment",
    location: "app/components/organisms/orders/mobile-payment-bar.tsx",
  },
  {
    name: "UploadProductModal",
    kind: "Domain workflow",
    endpoint: "imageUploader",
    location:
      "app/components/organisms/participant-products-upload/upload-product-modal.tsx",
  },
  {
    name: "ProductForm image gallery",
    kind: "Domain workflow",
    endpoint: "productImage",
    location: "app/components/organisms/products/product-form.tsx",
  },
] as const;

function UploadInventory() {
  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Component catalog
        </p>
        <h1 className="text-3xl font-bold">Image upload components</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Storybook showcases transport-agnostic components with an injected
          upload adapter. File selection, previews, progress, callbacks, and
          validation stay interactive without wiring auth, UploadThing, or
          server actions into stories.
        </p>
      </div>

      <section
        className="space-y-3"
        aria-labelledby="reusable-components-title"
      >
        <div>
          <h2 id="reusable-components-title" className="text-xl font-semibold">
            Four independent components
          </h2>
          <p className="text-sm text-muted-foreground">
            Self-contained UI under{" "}
            <code className="text-xs">stories/uploads/components</code>. Each
            takes state via props and an injected{" "}
            <code className="text-xs">upload</code> function — no auth, server
            actions, or upload transport inside the component.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {reusableComponents.map((component) => (
            <article key={component.name} className="rounded-xl border p-4">
              <h3 className="font-semibold">{component.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {component.useCases}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div>
        <h2 className="text-xl font-semibold">
          Application inventory (not showcased here)
        </h2>
        <p className="text-sm text-muted-foreground">
          Existing upload surfaces still coupled to UploadThing and server
          actions. These are consolidation targets, not Storybook stories.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted/70">
            <tr>
              <th className="p-3 font-semibold">Component</th>
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold">Endpoint</th>
              <th className="p-3 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {components.map((component) => (
              <tr key={component.name} className="border-t align-top">
                <th scope="row" className="p-3 font-medium">
                  {component.name}
                </th>
                <td className="p-3 text-muted-foreground">{component.kind}</td>
                <td className="p-3">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {component.endpoint}
                  </code>
                </td>
                <td className="p-3">
                  <code className="break-all text-xs text-muted-foreground">
                    {component.location}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const meta = {
  title: "Uploads/Inventory",
  component: UploadInventory,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof UploadInventory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllComponents: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Image upload components" }),
    ).toBeVisible();
    await expect(canvas.getAllByRole("row")).toHaveLength(
      components.length + 1,
    );
  },
};
