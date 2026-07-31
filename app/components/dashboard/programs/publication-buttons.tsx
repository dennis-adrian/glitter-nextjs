"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  publishProgram,
  publishProgramWithSessions,
  publishSession,
  unpublishProgram,
  unpublishSession,
} from "@/app/lib/programs/admin-actions";
import type { ProgramStatus } from "@/app/lib/programs/definitions";

type ProgramProps = {
  scope: "program";
  programId: number;
  status: ProgramStatus;
};

type SessionProps = {
  scope: "session";
  sessionId: number;
  status: ProgramStatus;
};

type Props = ProgramProps | SessionProps;

/**
 * Publication controls. For a program, "publish everything" runs the bulk
 * action, which skips sessions it cannot publish and reports each one — so an
 * admin learns what is missing instead of wondering why a session stayed hidden.
 */
export default function PublicationButtons(props: Props) {
  const [isPending, startTransition] = useTransition();

  function run(
    promise: Promise<{
      success: boolean;
      message: string;
      skipped?: { title: string; reason: string }[];
    }>,
  ) {
    startTransition(async () => {
      try {
        const result = await promise;

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);

        for (const skipped of result.skipped ?? []) {
          toast.warning(`${skipped.title}: ${skipped.reason}`);
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo cambiar la publicación");
      }
    });
  }

  if (props.scope === "session") {
    return props.status === "published" ? (
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => run(unpublishSession(props.sessionId))}
      >
        Ocultar sesión
      </Button>
    ) : (
      <Button
        disabled={isPending}
        onClick={() => run(publishSession(props.sessionId))}
      >
        Publicar sesión
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {props.status === "published" ? (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => run(unpublishProgram(props.programId))}
        >
          Ocultar programa
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => run(publishProgram(props.programId))}
        >
          Publicar solo el programa
        </Button>
      )}
      <Button
        disabled={isPending}
        onClick={() => run(publishProgramWithSessions(props.programId))}
      >
        Publicar programa y sesiones
      </Button>
    </div>
  );
}
