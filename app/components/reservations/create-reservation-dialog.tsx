"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import SearchInput from "@/app/components/ui/search-input/input";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { toast } from "sonner";
import { Loader2Icon, PlusCircleIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createReservation,
  NewStandReservation,
} from "@/app/api/user_requests/actions";
import { BaseProfile } from "@/app/api/users/definitions";

type Participant = BaseProfile;

type Stand = {
  id: number;
  label: string | null;
  standNumber: number;
  price: number;
  status: string;
  standCategory?: string;
};

export default function CreateReservationDialog({
  festivalId,
  participants,
  stands,
}: {
  festivalId: number;
  participants: Participant[];
  stands: Stand[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedPrimary, setSelectedPrimary] = useState<number | undefined>();
  const [selectedPartner, setSelectedPartner] = useState<number | undefined>();
  const [selectedStandId, setSelectedStandId] = useState<string>("");
  const [showPartnerInput, setShowPartnerInput] = useState(false);
  const [isPending, startTransition] = useTransition();

  const participantOptions: SearchOption[] = useMemo(
    () =>
      participants.map((p) => ({
        label: p.displayName || "Sin nombre",
        value: String(p.id),
        imageUrl: p.imageUrl || undefined,
      })),
    [participants],
  );

  const availableStands = useMemo(
    () => stands.filter((s) => s.status === "available"),
    [stands],
  );

  const selectedStand = useMemo(
    () => availableStands.find((s) => String(s.id) === selectedStandId),
    [availableStands, selectedStandId],
  );

  const primaryProfile = useMemo(
    () => participants.find((p) => p.id === selectedPrimary),
    [participants, selectedPrimary],
  );
  const primaryCategory = primaryProfile?.category;

  const standsForPrimaryCategory = useMemo(() => {
    if (!primaryCategory) return availableStands;
    return availableStands.filter((s) => s.standCategory === primaryCategory);
  }, [availableStands, primaryCategory]);

  useEffect(() => {
    setSelectedStandId("");
  }, [selectedPrimary]);

  useEffect(() => {
    if (primaryCategory !== "illustration") {
      setSelectedPartner(undefined);
      setShowPartnerInput(false);
    }
  }, [primaryCategory]);

  function resetState() {
    setSelectedPrimary(undefined);
    setSelectedPartner(undefined);
    setSelectedStandId("");
    setShowPartnerInput(false);
  }

  async function onSubmit() {
    if (!selectedPrimary) {
      toast.error("Selecciona al menos un participante");
      return;
    }
    if (!selectedStandId) {
      toast.error("Selecciona un stand");
      return;
    }

    const allowPartner = primaryCategory === "illustration";
    const participantIds = [
      selectedPrimary,
      allowPartner ? selectedPartner : undefined,
    ].filter(Boolean) as number[];

    if (!primaryProfile) {
      toast.error("Participante inválido");
      return;
    }

    startTransition(async () => {
      const reservation = {
        festivalId,
        standId: parseInt(selectedStandId),
        participantIds,
      } as NewStandReservation;
      const res = await createReservation(
        reservation,
        selectedStand?.price || 0,
        primaryProfile,
      );
      if (res?.success) {
        toast.success("Reserva creada correctamente");
        resetState();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res?.message || "No se pudo crear la reserva");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetState();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Agregar reserva</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva reserva</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="primary">Participante principal</Label>
            <SearchInput
              id="primary"
              options={participantOptions}
              selectedId={selectedPrimary}
              onSelect={(id) => setSelectedPrimary(id)}
              placeholder="Busca por nombre..."
            />

          </div>

          {selectedPartner ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Compañero</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedPartner(undefined);
                    setShowPartnerInput(false);
                  }}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
              <SearchInput
                id="partner"
                options={participantOptions}
                selectedId={selectedPartner}
                onSelect={(id) => setSelectedPartner(id)}
                placeholder="Busca por nombre..."
              />

            </div>
          ) : primaryCategory === "illustration" ? (
            <Button variant="link" className="p-0 justify-start w-fit" onClick={() => setShowPartnerInput(true)}>
              <PlusCircleIcon className="h-4 w-4 mr-2" /> Agregar compañero (opcional)
            </Button>
          ) : null}

          {showPartnerInput && !selectedPartner && primaryCategory === "illustration" && (
            <div className="grid gap-2">
              <Label htmlFor="partner">Compañero</Label>
              <SearchInput
                id="partner"
                options={participantOptions}
                onSelect={(id) => setSelectedPartner(id)}
                placeholder="Busca por nombre..."
              />
            </div>
          )}

          {selectedPrimary ? (
            <div className="grid gap-2">
              <Label htmlFor="stand">Stand</Label>
              <Select value={selectedStandId} onValueChange={setSelectedStandId}>
                <SelectTrigger id="stand">
                  <SelectValue placeholder="Elige un stand disponible" />
                </SelectTrigger>
                <SelectContent>
                  {standsForPrimaryCategory.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {(s.label || "Espacio ") + s.standNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={isPending || !selectedPrimary || !selectedStandId}>
            {isPending ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" /> Guardando
              </>
            ) : (
              <span>Crear</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}