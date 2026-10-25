"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  type ComunicadoAudiencePreview,
  type ComunicadoSkippedPerson,
  previewComunicadoAudience,
  previewSkippedPeople,
} from "@/app/lib/comunicados/audience";
import {
  ComunicadoAudienceSchema,
  ComunicadoDraftSchema,
} from "@/app/lib/comunicados/definitions";
import {
  createComunicadoDraft,
  type DraftRefusalCode,
  discardComunicadoDraft,
  saveComunicadoDraft,
} from "@/app/lib/comunicados/drafts";
import {
  type ComunicadoPersonOption,
  searchComunicadoPeople,
} from "@/app/lib/comunicados/queries";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { serverEnv } from "@/env";

const COMUNICADOS_PATH = "/dashboard/communications";

type Failure = { success: false; message: string };

/**
 * `FORBIDDEN`: not a global admin, or the flag is off. `FAILED`: the
 * database did not answer; the composer retries.
 */
export type SaveComunicadoDraftFailureCode =
  | DraftRefusalCode
  | "INVALID"
  | "FORBIDDEN"
  | "FAILED";

export type SaveComunicadoDraftActionResult =
  | {
      success: true;
      version: number;
      savedAt: string;
      /** Shown inline under the text: it was not saved, the rest was. */
      contentError: string | null;
    }
  | { success: false; code: SaveComunicadoDraftFailureCode; message: string };

const ComunicadoIdSchema = ComunicadoDraftSchema.shape.comunicadoId;

const AudiencePreviewSchema = z.object({
  audience: ComunicadoAudienceSchema,
  essential: z.boolean(),
  sendEmail: z.boolean(),
});

const SkippedPreviewSchema = z.object({ audience: ComunicadoAudienceSchema });

/**
 * Global admins with the flag on, before anything else (G2). Festival admins
 * see nothing of Comunicaciones, so they are refused here too.
 */
async function comunicadosActor() {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return {
      actor: null,
      blocked: { success: false, message: "No autorizado." } as Failure,
    };
  }
  const blocked = await featureFlagGuard("comunicados", actor);
  if (blocked) return { actor: null, blocked };
  return { actor, blocked: null };
}

/** Lists in the composer and dialog are counted before a preview narrows. */
function narrowsAudience() {
  return serverEnv.VERCEL_ENV !== "production";
}

function logFailure(log: string, error: unknown) {
  console.error(log, {
    errorType: error instanceof Error ? error.name : typeof error,
  });
}

/** "Nuevo comunicado": an empty draft, for the composer to open. */
export async function createComunicadoDraftAction(): Promise<
  { success: true; comunicadoId: number } | Failure
> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return blocked;

  try {
    const comunicadoId = await createComunicadoDraft(actor.id);
    revalidatePath(COMUNICADOS_PATH);
    return { success: true, comunicadoId };
  } catch (error) {
    logFailure("Error creating a comunicado draft", error);
    return { success: false, message: "No se pudo crear el borrador." };
  }
}

/**
 * The composer's autosave. It does not revalidate: that would re-render the
 * composer in every response and hold the live counts behind each save, and
 * the list is read fresh when it is opened.
 */
export async function saveComunicadoDraftAction(
  input: unknown,
): Promise<SaveComunicadoDraftActionResult> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return { ...blocked, code: "FORBIDDEN" };
  const parsed = ComunicadoDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID",
      message:
        parsed.error.issues[0]?.message ?? "Revisá los datos del comunicado.",
    };
  }

  try {
    const saved = await saveComunicadoDraft(parsed.data, actor.id);
    if (!saved.ok) {
      return { success: false, code: saved.code, message: saved.message };
    }
    return {
      success: true,
      version: saved.version,
      savedAt: saved.savedAt.toISOString(),
      contentError: saved.contentError,
    };
  } catch (error) {
    logFailure("Error saving a comunicado draft", error);
    return {
      success: false,
      code: "FAILED",
      message: "No se pudo guardar el borrador.",
    };
  }
}

/** "Descartar borrador". Only a draft: never a scheduled or sent one. */
export async function discardComunicadoDraftAction(
  comunicadoId: unknown,
): Promise<{ success: true; message: string } | Failure> {
  const { blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = ComunicadoIdSchema.safeParse(comunicadoId);
  if (!parsed.success) {
    return { success: false, message: "Este borrador ya no existe." };
  }

  try {
    const discarded = await discardComunicadoDraft(parsed.data);
    if (!discarded.ok) return { success: false, message: discarded.message };
    revalidatePath(COMUNICADOS_PATH);
    return { success: true, message: "Descartamos el borrador." };
  } catch (error) {
    logFailure("Error discarding a comunicado draft", error);
    return { success: false, message: "No se pudo descartar el borrador." };
  }
}

/**
 * The composer's live summary (G4). Whether the lists narrow to the admins is
 * the server's own environment, never the client's (B6). Reads only.
 */
export async function previewComunicadoAudienceAction(
  input: unknown,
): Promise<{ success: true; preview: ComunicadoAudiencePreview } | Failure> {
  const { blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = AudiencePreviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisá los destinatarios.",
    };
  }

  try {
    const preview = await previewComunicadoAudience(parsed.data.audience, {
      narrow: narrowsAudience(),
      essential: parsed.data.essential,
      sendEmail: parsed.data.sendEmail,
    });
    if (!preview) return { success: false, message: "No autorizado." };
    return { success: true, preview };
  } catch (error) {
    logFailure("Error previewing a comunicado audience", error);
    return {
      success: false,
      message: "No pudimos contar los destinatarios. Probá de nuevo.",
    };
  }
}

/** "Ver por qué": the first people who would not receive it. Reads only. */
export async function previewSkippedPeopleAction(
  input: unknown,
): Promise<{ success: true; people: ComunicadoSkippedPerson[] } | Failure> {
  const { blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = SkippedPreviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisá los destinatarios.",
    };
  }

  try {
    const people = await previewSkippedPeople(parsed.data.audience, {
      narrow: narrowsAudience(),
    });
    if (!people) return { success: false, message: "No autorizado." };
    return { success: true, people };
  } catch (error) {
    logFailure("Error listing a comunicado's skipped people", error);
    return {
      success: false,
      message: "No pudimos cargar a quiénes no les llega. Probá de nuevo.",
    };
  }
}

/** "Agregar por nombre o correo". Nothing for anyone the guard refuses. */
export async function searchComunicadoPeopleAction(
  query: unknown,
): Promise<ComunicadoPersonOption[]> {
  const { blocked } = await comunicadosActor();
  if (blocked) return [];
  if (typeof query !== "string") return [];
  return searchComunicadoPeople(query);
}
