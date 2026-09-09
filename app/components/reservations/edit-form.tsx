"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { rejectReservation } from "@/app/api/reservations/actions";
import { ReservationWithParticipantsAndUsersAndStandAndFestival } from "@/app/api/reservations/definitions";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import { Form } from "@/components/ui/form";
import { adminConfirmReservationByReservationIdAction } from "@/app/lib/reservations/payment-actions";
import { updateReservationPartner } from "@/app/lib/reservations/admin-actions";
import { planReservationEditSubmit } from "@/app/components/reservations/edit-form-submit";
import ReservationParticipantsSection from "@/app/components/reservations/reservation-participants-section";
import ReservationStatusSection from "@/app/components/reservations/reservation-status-section";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BaseProfile } from "@/app/api/users/definitions";

type Artist = Omit<BaseProfile, "userRequests" | "participations">;
export default function EditReservationForm({
  artists,
  artistsOptions,
  reservation,
}: {
  artists: Artist[];
  artistsOptions: SearchOption[];
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival;
}) {
  const router = useRouter();
  const [confirmIntentKey] = useState(() => crypto.randomUUID());
  const [partner, setPartner] = useState<Artist | undefined>(
    reservation.participants[1]?.user,
  );
  const [showInput, setShowInput] = useState(false);

  const form = useForm({
    defaultValues: {
      status: reservation.status,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const updatedPartner = {
      participationId: reservation.participants[1]?.id,
      userId: partner?.id,
    };
    const originalPartnerUserId = reservation.participants[1]?.user.id;
    const partnerChanged = updatedPartner.userId !== originalPartnerUserId;
    const statusChanged = data.status !== reservation.status;
    const plan = planReservationEditSubmit({
      statusChanged,
      partnerChanged,
      nextStatus: data.status,
    });

    if (
      plan.kind === "unsupported_combination" ||
      plan.kind === "unsupported_status"
    ) {
      toast.error(plan.message);
      return;
    }

    if (plan.kind === "noop") {
      toast.success("No hay cambios para guardar.");
      return;
    }

    if (plan.kind === "reject") {
      const res = await rejectReservation({
        reservationId: reservation.id,
        reason: "Actualización administrativa",
      });
      if (res.success) {
        toast.success(res.message);
        router.replace(
          `/dashboard/festivals/${reservation.festivalId}/reservations`,
        );
      } else {
        toast.error(res.message);
      }
      return;
    }

    if (plan.kind === "confirm") {
      const res = await adminConfirmReservationByReservationIdAction({
        reservationId: reservation.id,
        idempotencyKey: confirmIntentKey,
      });
      if (res.success) {
        toast.success(res.message);
        router.replace(
          `/dashboard/festivals/${reservation.festivalId}/reservations`,
        );
      } else {
        toast.error(res.message);
      }
      return;
    }

    const res = await updateReservationPartner({
      reservationId: reservation.id,
      partnerUserId: updatedPartner.userId ?? null,
    });
    if (res.success) {
      toast.success(res.message, {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
      router.replace(
        `/dashboard/festivals/${reservation.festivalId}/reservations`,
      );
    } else {
      toast.error(res.message, {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
    }
  });

  function handleAddPartner(userId: number) {
    setPartner(artists.find((a) => a.id === userId));
  }

  function removePartner() {
    setPartner(undefined);
    setShowInput(false);
  }

  return (
    <Form {...form}>
      <form action={action} className="space-y-6">
        <ReservationParticipantsSection
          owner={reservation.participants[0].user}
          partner={partner}
          artistsOptions={artistsOptions}
          showPartnerSearch={showInput}
          onShowPartnerSearch={() => setShowInput(true)}
          onAddPartner={handleAddPartner}
          onRemovePartner={removePartner}
        />
        <ReservationStatusSection
          form={form}
          submitting={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}
