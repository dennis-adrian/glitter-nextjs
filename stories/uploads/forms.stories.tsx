import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { expect, userEvent, within } from "storybook/test";

import type { BaseProfile } from "@/app/api/users/definitions";
import ProgramImageUpload from "@/app/components/dashboard/programs/program-image-upload";
import SpeakerImageUpload from "@/app/components/dashboard/programs/speaker-image-upload";
import SectorImageUpload from "@/app/components/festivals/sectors/sector-image-upload";
import FileInput from "@/app/components/form/fields/file";
import { Dropzone } from "@/app/components/organisms/dropzone";
import { BannerImageUpload } from "@/app/components/uploads/banner-image-upload";
import { ExternalParticipantImageUpload } from "@/app/components/uploads/external-participant-image-upload";
import { Form } from "@/app/components/ui/form";
import ProfilePicUpload from "@/app/components/user_profile/profile_pic/upload";
import type { ProgramFormValues } from "@/app/lib/programs/form-schemas";

const mockImageUrl = "/img/banner-caceria-de-sellos.png";

function ExternalParticipantStory() {
  const [imageUrl, setImageUrl] = useState("");
  return (
    <div className="w-full max-w-md">
      <ExternalParticipantImageUpload
        imageUrl={imageUrl}
        onChange={setImageUrl}
        onRemove={() => setImageUrl("")}
      />
    </div>
  );
}

function BannerStory() {
  const [imageUrl, setImageUrl] = useState("");
  return (
    <div className="w-full max-w-2xl">
      <BannerImageUpload
        title="Escritorio"
        recommendation="Recomendado: 2400 × 600 px (aprox. 4:1)"
        imageUrl={imageUrl}
        onChange={setImageUrl}
        previewClassName="aspect-4/1"
        required
      />
    </div>
  );
}

const profile = {
  firstName: "María",
  lastName: "Flores",
  displayName: "María Flores",
} as BaseProfile;

function ProfileStory() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  return (
    <ProfilePicUpload
      profile={profile}
      imageUrl={imageUrl}
      setImageUrl={setImageUrl}
      size="sm"
    />
  );
}

function SectorStory() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  return (
    <div className="w-80">
      <SectorImageUpload
        imageUrl={imageUrl}
        setImageUrl={setImageUrl}
        sectorName="Ilustración"
      />
    </div>
  );
}

function FileInputStory() {
  const form = useForm<{ imageUrl: string }>({
    defaultValues: { imageUrl: "" },
  });
  return (
    <Form {...form}>
      <form className="w-96">
        <FileInput
          formControl={form.control}
          name="imageUrl"
          label="Imagen"
          description="Control genérico usado por insignias, infracciones y QR."
        />
      </form>
    </Form>
  );
}

function ProgramArtworkStory() {
  const form = useForm<ProgramFormValues>({
    defaultValues: {
      bannerUrl: "",
      thumbnailUrl: "",
    } as ProgramFormValues,
  });
  return (
    <Form {...form}>
      <form className="w-full max-w-lg">
        <ProgramImageUpload
          control={form.control}
          name="bannerUrl"
          label="Imagen de portada"
          description="Recomendado: 1600 × 1200 px (4:3)."
          previewClassName="aspect-4/3"
          previewSizes="512px"
          onUploading={() => undefined}
        />
      </form>
    </Form>
  );
}

function SpeakerStory() {
  const [imageUrl, setImageUrl] = useState("");
  return (
    <div className="w-full max-w-md">
      <SpeakerImageUpload
        imageUrl={imageUrl}
        speakerName="Ana Pérez"
        onChange={setImageUrl}
        onUploading={() => undefined}
      />
    </div>
  );
}

function DropzoneStory() {
  const [uploaded, setUploaded] = useState(0);
  return (
    <div className="w-full max-w-xl space-y-3">
      <Dropzone
        maxFiles={3}
        maxSize={4 * 1024 * 1024}
        accept={["image/*"]}
        onUploadComplete={(files) => setUploaded(files.length)}
      />
      <output className="block text-sm" aria-live="polite">
        Carga completada: {uploaded}
      </output>
    </div>
  );
}

const meta = {
  title: "Uploads/Forms",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExternalParticipantImage: Story = {
  render: () => <ExternalParticipantStory />,
};

export const ExternalParticipantInteractionTest: Story = {
  render: () => <ExternalParticipantStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText(
        "Seleccionar archivo para externalParticipantImage",
      ),
      new File(["logo"], "logo.png", { type: "image/png" }),
    );
    await expect(
      await canvas.findByRole("img", { name: "Vista previa" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Quitar" }));
    await expect(
      canvas.queryByRole("img", { name: "Vista previa" }),
    ).not.toBeInTheDocument();
  },
};

export const BannerImage: Story = {
  render: () => <BannerStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const urlInput = canvas.getByLabelText("O pega la URL");
    await userEvent.type(urlInput, mockImageUrl);
    await expect(
      canvas.getByRole("img", { name: "Vista previa escritorio" }),
    ).toBeVisible();
  },
};

export const ProfilePicture: Story = {
  render: () => <ProfileStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "avatar" })).toBeVisible();
    await expect(
      canvas.getByText("Elige una imagen", { exact: false }),
    ).toBeVisible();
  },
};

export const SectorImage: Story = {
  render: () => <SectorStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: "Imagen del sector Ilustración" }),
    ).toBeVisible();
  },
};

export const GenericFileInput: Story = {
  render: () => <FileInputStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText("Seleccionar archivo para imageUploader"),
      new File(["badge"], "insignia.png", { type: "image/png" }),
    );
    await expect(await canvas.findByText(mockImageUrl)).toBeVisible();
  },
};

export const ProgramArtwork: Story = {
  render: () => <ProgramArtworkStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText("Seleccionar archivo para programArtwork"),
      new File(["cover"], "portada.png", { type: "image/png" }),
    );
    await expect(
      await canvas.findByRole("img", {
        name: "Vista previa: imagen de portada",
      }),
    ).toBeVisible();
  },
};

export const SpeakerImage: Story = {
  render: () => <SpeakerStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("A")).toBeVisible();
    await userEvent.upload(
      canvas.getByLabelText("Seleccionar archivo para speakerImage"),
      new File(["speaker"], "ana.png", { type: "image/png" }),
    );
    await expect(
      await canvas.findByRole("img", { name: "Foto de Ana Pérez" }),
    ).toBeVisible();
  },
};

export const MultiImageDropzone: Story = {
  render: () => <DropzoneStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input =
      canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    await expect(input).not.toBeNull();
    await userEvent.upload(
      input!,
      new File(["proof"], "diseño.png", { type: "image/png" }),
    );
    await expect(canvas.getByText("diseño.png")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Subir archivos" }),
    );
    await expect(await canvas.findByText("Carga completada: 1")).toBeVisible();
  },
};
