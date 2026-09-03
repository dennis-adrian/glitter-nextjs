"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  declareFullTablePair,
  dissolveFullTablePair,
  setStandGroupFullTable,
  type FullTableConfigResult,
} from "@/app/lib/stands/full-table-service";
import { updateStandPrices } from "@/app/lib/stands/pricing-service";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

type ActionResult = {
  success: boolean;
  message: string;
  /** Every reason the change was refused, so one fix pass is enough. */
  problems?: string[];
};

const moneySchema = z.coerce
  .number()
  .finite()
  .multipleOf(0.01)
  .min(0)
  .max(99_999_999.99);

const priceUpdatesSchema = z
  .array(
    z.object({
      standId: z.coerce.number().int().positive(),
      individualPrice: moneySchema,
      sharedPrice: moneySchema.nullable().optional(),
    }),
  )
  .min(1)
  .max(500);

const fullTableSchema = z.object({
  groupId: z.coerce.number().int().positive(),
  enabled: z.boolean(),
});

const declarePairSchema = z.object({
  standIds: z.array(z.coerce.number().int().positive()).length(2),
});

const dissolvePairSchema = z.object({
  groupId: z.coerce.number().int().positive(),
});

async function requireFestivalOrAdmin() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false as const, message: "Iniciá sesión para continuar." };
  }
  if (profile.role !== "festival_admin" && profile.role !== "admin") {
    return {
      ok: false as const,
      message: "No tenés permisos para realizar esta acción.",
    };
  }
  return { ok: true as const };
}

/**
 * Sets individual/shared prices for one stand or many. The browser sends the
 * amounts, but every rule — precision, ordering, category, and full-table pair
 * agreement — is enforced server-side.
 */
export async function updateStandPricesAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  const parsed = priceUpdatesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Revisá los montos: hasta dos decimales y 0 o más.",
    };
  }

  try {
    const result = await updateStandPrices(parsed.data);
    if (!result.ok) {
      return {
        success: false,
        message:
          result.code === "BREAKS_PAIR"
            ? "El cambio dejaría una mesa completa con mitades distintas."
            : result.code === "STANDS_NOT_FOUND"
              ? "No se encontraron todos los espacios."
              : result.code === "DUPLICATE_STANDS"
                ? "Hay espacios repetidos en el mismo cambio."
                : "Revisá los precios ingresados.",
        problems: result.problems.map((problem) => problem.message),
      };
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");
    return {
      success: true,
      message:
        result.updated === 1
          ? "Precio actualizado."
          : `Se actualizaron ${result.updated} espacios.`,
    };
  } catch (error) {
    console.error("Error updating stand prices", error);
    return { success: false, message: "Error al actualizar los precios." };
  }
}

function describeFullTableFailure(result: FullTableConfigResult) {
  if (result.ok) return null;
  if (result.code === "GROUP_NOT_FOUND") return "No se encontró el grupo.";
  if (result.code === "OCCUPIED") {
    return "No se puede reconfigurar: hay una reserva vigente en estos espacios.";
  }
  return "Los espacios no forman una mesa completa válida.";
}

/** Declares a stand group a full table, or returns it to a visual group. */
export async function setStandGroupFullTableAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  const parsed = fullTableSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  try {
    const result = await setStandGroupFullTable(parsed.data);
    if (!result.ok) {
      return {
        success: false,
        message: describeFullTableFailure(result)!,
        problems: result.problems?.map((problem) => problem.message),
      };
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");
    return {
      success: true,
      message: parsed.data.enabled
        ? "Mesa completa configurada."
        : "El grupo volvió a ser un grupo visual.",
    };
  } catch (error) {
    console.error("Error configuring full table", error);
    return { success: false, message: "Error al configurar la mesa completa." };
  }
}

/**
 * Declares two stands one full table from the stands table, where an admin can
 * see prices and categories but not map positions.
 *
 * Grouping and declaring happen together: the browser never issues the two
 * commands in sequence, so a refusal cannot leave a half-made group behind.
 */
export async function declareFullTablePairAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  const parsed = declarePairSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Seleccioná exactamente dos espacios.",
    };
  }

  try {
    const result = await declareFullTablePair(parsed.data);
    if (!result.ok) {
      return {
        success: false,
        message:
          result.code === "OCCUPIED"
            ? "No se puede declarar: hay una reserva vigente en estos espacios."
            : "Estos espacios no forman una mesa completa válida.",
        problems: result.problems.map((problem) => problem.message),
      };
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");
    return { success: true, message: "Mesa completa declarada." };
  } catch (error) {
    console.error("Error declaring full table pair", error);
    return { success: false, message: "Error al declarar la mesa completa." };
  }
}

/** Separates a declared pair: the stands stop being a table and stop being grouped. */
export async function dissolveFullTablePairAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  const parsed = dissolvePairSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  try {
    const result = await dissolveFullTablePair(parsed.data);
    if (!result.ok) {
      return {
        success: false,
        message:
          result.code === "OCCUPIED"
            ? "No se puede separar: hay una reserva vigente en estos espacios."
            : "No se encontró la mesa completa.",
      };
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");
    return { success: true, message: "Los espacios quedaron separados." };
  } catch (error) {
    console.error("Error dissolving full table pair", error);
    return { success: false, message: "Error al separar la mesa completa." };
  }
}
