"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { toastActionError } from "@/app/lib/errors/action-error";
import { setFestivalActivityVisibility } from "@/app/lib/festival_activites/admin-actions";

type ActivityVisibilityButtonProps = {
  activityId: number;
  festivalId: number;
  isVisible: boolean;
};

/** Publishes a draft activity, or turns a published one back into a draft. */
export default function ActivityVisibilityButton({
  activityId,
  festivalId,
  isVisible,
}: ActivityVisibilityButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);
  const router = useRouter();

  const handleClick = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
    try {
      const result = await setFestivalActivityVisibility(
        activityId,
        festivalId,
        !isVisible,
      );
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toastActionError(
        error,
        "No se pudo cambiar la visibilidad. Intentá nuevamente.",
      );
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  };

  const Icon = isPending ? Loader2Icon : isVisible ? EyeOffIcon : EyeIcon;

  return (
    <Button
      variant={isVisible ? "outline" : "default"}
      size="sm"
      disabled={isPending}
      onClick={handleClick}
    >
      <Icon
        className={`w-4 h-4 mr-1${isPending ? " animate-spin" : ""}`}
        aria-hidden
      />
      {isVisible ? "Ocultar" : "Publicar"}
    </Button>
  );
}
