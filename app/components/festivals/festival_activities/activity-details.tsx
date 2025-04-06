"use client";

import StickerPrintDesignSelectable from "@/app/components/festivals/festival_activities/sticker-print-design-selectable";
import { BaseProfile } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import {
  ActivityDetailsWithParticipants,
  FestivalActivityWithDetailsAndParticipants,
} from "@/app/data/festivals/definitions";
import { enrollInActivity } from "@/app/lib/festival_sectors/actions";
import { ArrowDownToLineIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type ActivityDetailsProps = {
  activity: FestivalActivityWithDetailsAndParticipants;
  user: BaseProfile;
};

export default function ActivityDetails({
  activity,
  user,
}: ActivityDetailsProps) {
  const [selectedDesign, setSelectedDesign] =
    useState<ActivityDetailsWithParticipants | null>(null);

  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    if (!selectedDesign) return;

    const result = await enrollInActivity(
      user.id,
      activity.festivalId,
      selectedDesign,
    );

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  });

  const disabled = !selectedDesign;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        {activity.details.map((detail) => (
          <StickerPrintDesignSelectable
            key={detail.id}
            detail={detail}
            selected={selectedDesign?.id === detail.id}
            setSelected={setSelectedDesign}
          />
        ))}
      </div>
      <Form {...form}>
        <form onSubmit={action}>
          <div className="flex flex-col gap-1 items-center justify-center mt-4">
            <SubmitButton
              className="w-full md:max-w-[400px]"
              disabled={disabled || form.formState.isSubmitting}
              loading={form.formState.isSubmitting}
            >
              <span>Guardar selección</span>
              <ArrowDownToLineIcon className="ml-2 w-4 h-4" />
            </SubmitButton>
            <p className="text-sm text-muted-foreground">
              {disabled && "Debes seleccionar un diseño para continuar"}
            </p>
          </div>
        </form>
      </Form>
    </div>
  );
}
