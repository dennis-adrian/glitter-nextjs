"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import SpeakerImageUpload from "@/app/components/dashboard/programs/speaker-image-upload";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Form } from "@/app/components/ui/form";
import {
  createSpeaker,
  updateSpeaker,
} from "@/app/lib/programs/catalog-actions";
import type { Speaker } from "@/app/lib/programs/definitions";
import {
  speakerFormSchema,
  textOrNull,
  type SpeakerFormValues,
} from "@/app/lib/programs/form-schemas";

type Props = {
  speakers: Speaker[];
};

const EMPTY = { publicName: "", occupation: "", imageUrl: "", bio: "" };

export default function SpeakersManager({ speakers }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Speaker | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<SpeakerFormValues>({
    resolver: zodResolver(speakerFormSchema),
    defaultValues: EMPTY,
  });
  const imageUrl = useWatch({ control: form.control, name: "imageUrl" });
  const publicName = useWatch({ control: form.control, name: "publicName" });

  function startEditing(speaker: Speaker) {
    setEditing(speaker);
    form.reset({
      publicName: speaker.publicName,
      occupation: speaker.occupation ?? "",
      imageUrl: speaker.imageUrl ?? "",
      bio: speaker.bio ?? "",
    });
  }

  function stopEditing() {
    setEditing(null);
    setIsUploadingImage(false);
    form.reset(EMPTY);
  }

  const action = form.handleSubmit(async (values) => {
    const payload = {
      publicName: values.publicName,
      occupation: textOrNull(values.occupation),
      imageUrl: textOrNull(values.imageUrl),
      bio: textOrNull(values.bio),
    };

    try {
      const result = editing
        ? await updateSpeaker(editing.id, payload)
        : await createSpeaker(payload);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      stopEditing();
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el expositor");
    }
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? "Editar expositor" : "Nuevo expositor"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={action}>
              <TextInput label="Nombre público" name="publicName" required />
              <TextInput
                label="Ocupación"
                name="occupation"
                placeholder="Ej. Ilustradora y directora de arte"
              />
              <SpeakerImageUpload
                imageUrl={imageUrl}
                speakerName={publicName}
                onChange={(imageUrl) =>
                  form.setValue("imageUrl", imageUrl, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                onUploading={setIsUploadingImage}
              />
              <TextInput
                label="Foto (URL opcional)"
                name="imageUrl"
                description="También puedes pegar una URL permitida."
              />
              <TextareaInput
                formControl={form.control}
                label="Biografía"
                name="bio"
                placeholder="Breve presentación"
              />
              <div className="flex gap-2">
                <SubmitButton
                  disabled={form.formState.isSubmitting || isUploadingImage}
                  label={editing ? "Guardar" : "Crear expositor"}
                />
                {editing ? (
                  <Button type="button" variant="ghost" onClick={stopEditing}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expositores</CardTitle>
        </CardHeader>
        <CardContent>
          {speakers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay expositores. No necesitan cuenta en Glitter.
            </p>
          ) : (
            <ul className="space-y-2">
              {speakers.map((speaker) => (
                <li
                  key={speaker.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {speaker.publicName}
                    </p>
                    {speaker.occupation ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {speaker.occupation}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing(speaker)}
                  >
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
