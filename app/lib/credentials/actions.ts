"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { isDefaultRule } from "@/app/lib/credentials/calculate";
import {
  CREDENTIAL_GROUPS,
  CREDENTIALS_COPY,
  isCategoryGroup,
  type CredentialGroup,
  type CredentialRule,
  type CredentialsResult,
} from "@/app/lib/credentials/definitions";
import {
  festivalOnlySchema,
  saveCredentialRulesSchema,
  type FestivalOnlyInput,
  type SaveCredentialRulesInput,
} from "@/app/lib/credentials/schema";
import { loggableError } from "@/app/lib/errors/loggable-error";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { IMPERSONATION_READ_ONLY_RESULT } from "@/app/lib/impersonation/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { isImpersonationReadOnlyError } from "@/db/write-guard";
import { festivalCredentialRules, festivals } from "@/db/schema";

/**
 * The credentials page's writes (docs/PLAN-credenciales.md §6.3). Admins and
 * festival admins alike, behind the `festival_credentials` flag; every write
 * is scoped by the festival in the URL. Shaped like the volunteer admin's
 * actions: refusals inside a transaction throw a `Refusal`, which rolls it
 * back and becomes the returned message.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A refusal decided inside a transaction; rolls it back. */
class Refusal extends Error {}

const UNAUTHORIZED: CredentialsResult = {
  success: false,
  message: CREDENTIALS_COPY.unauthorized,
};

function refused(message: string): CredentialsResult {
  return { success: false, message };
}

function invalid(error: { issues: { message: string }[] }): CredentialsResult {
  return refused(error.issues[0]?.message ?? "Revisá los datos e intentá de nuevo.");
}

function failure(error: unknown, context: string, festivalId: number): CredentialsResult {
  if (error instanceof Refusal) return refused(error.message);
  if (isImpersonationReadOnlyError(error)) return IMPERSONATION_READ_ONLY_RESULT;
  console.error(context, { festivalId, ...loggableError(error) });
  return refused(CREDENTIALS_COPY.genericError);
}

/** Every festival's credentials page: a typed path names the route's folder. */
function revalidateCredentials() {
  revalidatePath("/(site)/dashboard/festivals/[id]/credentials", "layout");
}

/** Auth, then the flag: both before reading any input. */
async function authorize() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { blocked: UNAUTHORIZED } as const;
  const blocked = await featureFlagGuard("festival_credentials", profile);
  if (blocked) return { blocked } as const;
  return { profile } as const;
}

async function assertFestival(tx: Tx, festivalId: number) {
  const [festival] = await tx
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) throw new Refusal(CREDENTIALS_COPY.festivalNotFound);
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/**
 * Upserts the festival's rule rows. A group whose quantity and naming mode
 * both equal the default loses its row, so "no row" keeps meaning "default".
 */
export async function saveCredentialRules(
  input: SaveCredentialRulesInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = saveCredentialRulesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, rules } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await assertFestival(tx, festivalId);
      const defaults: CredentialGroup[] = [];
      for (const group of CREDENTIAL_GROUPS) {
        const value = rules[group];
        const rule: CredentialRule = {
          quantity: value.quantity,
          namingMode: "namingMode" in value ? value.namingMode : "all_named",
        };
        if (isDefaultRule(group, rule)) {
          defaults.push(group);
          continue;
        }
        const namingMode = isCategoryGroup(group) ? rule.namingMode : null;
        await tx
          .insert(festivalCredentialRules)
          .values({
            festivalId,
            group,
            quantity: rule.quantity,
            namingMode,
            updatedByUserId: auth.profile.id,
          })
          .onConflictDoUpdate({
            target: [festivalCredentialRules.festivalId, festivalCredentialRules.group],
            set: {
              quantity: rule.quantity,
              namingMode,
              updatedByUserId: auth.profile.id,
              updatedAt: sql`now()`,
            },
          });
      }
      if (defaults.length > 0) {
        await tx
          .delete(festivalCredentialRules)
          .where(
            and(
              eq(festivalCredentialRules.festivalId, festivalId),
              inArray(festivalCredentialRules.group, defaults),
            ),
          );
      }
    });
  } catch (error) {
    return failure(error, "Error saving credential rules", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: "Reglas guardadas." };
}

/** Back to the code defaults: the festival's rule rows go. */
export async function resetCredentialRules(
  input: FestivalOnlyInput,
): Promise<CredentialsResult> {
  const auth = await authorize();
  if (auth.blocked) return auth.blocked;
  const parsed = festivalOnlySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await assertFestival(tx, festivalId);
      await tx
        .delete(festivalCredentialRules)
        .where(eq(festivalCredentialRules.festivalId, festivalId));
    });
  } catch (error) {
    return failure(error, "Error resetting credential rules", festivalId);
  }

  revalidateCredentials();
  return { success: true, message: "Volvimos a los valores por defecto." };
}
