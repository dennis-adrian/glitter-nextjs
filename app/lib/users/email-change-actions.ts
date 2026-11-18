"use server";

import { revalidatePath } from "next/cache";

import EmailChangedNewAddressEmail from "@/app/emails/email-changed-new-address";
import EmailChangedOldAddressEmail from "@/app/emails/email-changed-old-address";
import { IMPERSONATION_READ_ONLY_RESULT } from "@/app/lib/impersonation/definitions";
import { changeClerkUserEmail } from "@/app/lib/users/clerk";
import {
  ChangeUserEmailSchema,
  type ChangeUserEmailInput,
  type ChangeUserEmailResult,
} from "@/app/lib/users/email-change-definitions";
import {
  beginEmailChange,
  completeEmailChange,
  emailChangeErrorCode,
  markEmailChangeClerkDone,
  markEmailChangeFailed,
  recordEmailChangeNotices,
  type BeginEmailChangeResult,
  type CompleteEmailChangeResult,
} from "@/app/lib/users/email-changes";
import { requireAdmin } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent, sendFailureType } from "@/app/vendors/resend-result";
import { db } from "@/db";
import { isImpersonationReadOnlyError } from "@/db/write-guard";

const NOTICE_FROM = "Perfiles Glitter <perfiles@productoraglitter.com>";

const GENERIC_FAILURE =
  "No pudimos cambiar el correo. Intentá de nuevo en unos minutos.";

const REFUSALS: Record<
  Exclude<BeginEmailChangeResult["status"], "ok">,
  string
> = {
  not_found: "No encontramos ese perfil.",
  deletion_pending:
    "Este perfil está en proceso de eliminación; no se puede cambiar su correo.",
  in_progress:
    "Ya hay un cambio de correo en curso para este perfil. Esperá un momento y volvé a intentar.",
  email_taken: "Ese correo ya pertenece a otra cuenta.",
  suppressed:
    "Ese correo está bloqueado por rebotes o reportes de spam y no recibiría nuestros avisos. Desbloquealo primero en /dashboard/emails.",
};

// Clerk has already changed by the time any of these is shown.
const HALFWAY: Record<
  Exclude<CompleteEmailChangeResult["status"], "ok">,
  string
> = {
  user_gone:
    "El correo de acceso ya cambió, pero el perfil fue eliminado mientras tanto. No queda nada por actualizar.",
  deletion_pending:
    "El correo de acceso ya cambió, pero el perfil entró en proceso de eliminación y no lo actualizamos.",
  email_taken:
    "El correo de acceso ya cambió, pero otro perfil tiene ese correo en nuestra base de datos y no pudimos actualizar este. Avisá al equipo técnico.",
};

const HALFWAY_RETRY =
  "El correo de acceso ya cambió, pero no pudimos terminar de actualizar el perfil. Volvé a hacer el cambio con el mismo correo para completarlo.";

/** The audit row is a courtesy here: failing to write it changes no answer. */
async function noteFailure(changeId: number, code: string) {
  try {
    await markEmailChangeFailed(changeId, code);
  } catch (error) {
    console.error(
      "Error recording email change failure",
      changeId,
      emailChangeErrorCode(error),
    );
  }
}

/** `sent`, or the log-safe type of the failure. Never throws. */
async function sendNotice(
  which: "old" | "new",
  changeId: number,
  send: () => ReturnType<typeof sendEmail>,
) {
  try {
    assertSent(await send());
    return "sent";
  } catch (error) {
    // The message can echo the recipient; the type cannot.
    const type = sendFailureType(error);
    console.error("Error sending email change notice", which, changeId, type);
    return type;
  }
}

/**
 * Tells both mailboxes. The change is committed by now, so a failed notice
 * is recorded and never reported as a failed change.
 */
async function sendNotices(input: {
  changeId: number;
  oldEmail: string;
  newEmail: string;
  name: string | null;
}) {
  const { changeId, oldEmail, newEmail, name } = input;
  // Two sends, never one with both recipients: a shared `to` would show the
  // old mailbox the full new address.
  const notices = {
    old: await sendNotice("old", changeId, () =>
      sendEmail(
        {
          to: [oldEmail],
          from: NOTICE_FROM,
          subject: "Cambiamos el correo de tu cuenta Glitter",
          react: EmailChangedOldAddressEmail({
            name,
            newEmail,
          }) as React.ReactElement,
        },
        { idempotencyKey: `email-change-${changeId}-old` },
      ),
    ),
    new: await sendNotice("new", changeId, () =>
      sendEmail(
        {
          to: [newEmail],
          from: NOTICE_FROM,
          subject: "Este es ahora tu correo de acceso a Glitter",
          react: EmailChangedNewAddressEmail({
            name,
            newEmail,
          }) as React.ReactElement,
        },
        { idempotencyKey: `email-change-${changeId}-new` },
      ),
    ),
  };
  try {
    await recordEmailChangeNotices(changeId, notices);
  } catch (error) {
    console.error(
      "Error recording email change notices",
      changeId,
      emailChangeErrorCode(error),
    );
  }
  return notices;
}

function describeOutcome(input: {
  unlinkedProviders: string[];
  oldAddressesRemoved: boolean;
  passwordEnabled: boolean;
  /** Null on a resync, which writes to nobody. */
  notices: { old: string; new: string } | null;
}) {
  const lines: string[] = [];
  // Clerk names the provider "oauth_google" in some payloads and "google" in
  // others.
  if (
    input.unlinkedProviders.some((p) => p === "oauth_google" || p === "google")
  ) {
    lines.push(
      input.passwordEnabled
        ? "Desvinculamos su cuenta de Google anterior; ya puede entrar con Google usando el correo nuevo."
        : // Google was likely their only way in, and nothing here can tell
          // whether a Google account exists for the new address.
          "Desvinculamos su cuenta de Google anterior. No tiene contraseña: para entrar necesita una cuenta de Google del correo nuevo o el código que le llega a ese correo. Confirmá con la persona que pudo entrar.",
    );
  } else if (input.unlinkedProviders.length > 0) {
    lines.push(
      "Desvinculamos las cuentas conectadas al correo anterior; puede volver a conectarlas con el correo nuevo.",
    );
  }
  if (!input.oldAddressesRemoved) {
    lines.push(
      "El correo anterior todavía sirve para entrar: volvé a hacer el cambio con el mismo correo para quitarlo.",
    );
  }
  if (input.notices && input.notices.new !== "sent") {
    lines.push("No pudimos enviar el aviso al correo nuevo; avisale vos.");
  }
  return lines.length > 0 ? lines.join(" ") : undefined;
}

/**
 * Changes the address a person signs in with: Clerk first, then the profile
 * and whatever mail is already queued for them. Admins only; nothing verifies
 * the new address, so the admin vouches for it.
 *
 * Clerk and the database cannot change together. If it stops in between, the
 * profile still shows the old address, and running the same change again
 * finishes it: the Clerk half answers `changed` when it is already done.
 *
 * Asking for the address the profile already has is a resync: the same steps
 * clear whatever an earlier change left on the Clerk account, and nobody is
 * written to.
 */
export async function changeUserEmail(
  input: ChangeUserEmailInput,
): Promise<ChangeUserEmailResult> {
  const actor = await requireAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  const parsed = ChangeUserEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "El correo no es válido",
    };
  }
  const { userId, email: newEmail } = parsed.data;

  let changeId: number | null = null;
  let clerkChanged = false;
  try {
    const begun = await db.transaction((tx) =>
      beginEmailChange(tx, { userId, newEmail, actorId: actor.id }),
    );
    if (begun.status !== "ok") {
      return { success: false, message: REFUSALS[begun.status] };
    }
    changeId = begun.changeId;

    // Outside any transaction: a network call must not hold the user lock.
    const clerk = await changeClerkUserEmail(begun.clerkId, newEmail);
    if (clerk.status === "email_taken") {
      await noteFailure(changeId, "clerk_email_taken");
      return { success: false, message: REFUSALS.email_taken };
    }
    if (clerk.status === "not_found") {
      await noteFailure(changeId, "clerk_user_not_found");
      return {
        success: false,
        message:
          "La cuenta de acceso de este perfil ya no existe en Clerk; no hay correo que cambiar.",
      };
    }
    if (clerk.status === "request_failed") {
      await noteFailure(changeId, `clerk_failed: ${clerk.detail}`);
      return { success: false, message: GENERIC_FAILURE };
    }
    clerkChanged = true;

    await markEmailChangeClerkDone(changeId, clerk.unlinkedProviders);
    const completed = await db.transaction((tx) =>
      completeEmailChange(tx, {
        changeId: begun.changeId,
        userId,
        oldEmail: begun.oldEmail,
        newEmail,
        unlinkedProviders: clerk.unlinkedProviders,
      }),
    );
    if (completed.status !== "ok") {
      revalidatePath("/dashboard/users");
      return { success: false, message: HALFWAY[completed.status] };
    }

    const notices = begun.resync
      ? null
      : await sendNotices({
          changeId,
          oldEmail: begun.oldEmail,
          newEmail,
          name: getUserName(begun) || null,
        });

    revalidatePath("/dashboard/users");
    revalidatePath("/dashboard/users/[profileId]", "page");

    const description = describeOutcome({
      unlinkedProviders: clerk.unlinkedProviders,
      oldAddressesRemoved: clerk.oldAddressesRemoved,
      passwordEnabled: clerk.passwordEnabled,
      notices,
    });
    const needsFollowUp =
      !clerk.oldAddressesRemoved || (notices != null && notices.new !== "sent");
    return {
      success: true,
      message: begun.resync
        ? "La cuenta de acceso quedó sincronizada con ese correo."
        : "Correo actualizado.",
      ...(description ? { description } : {}),
      ...(needsFollowUp ? { needsFollowUp } : {}),
    };
  } catch (error) {
    if (isImpersonationReadOnlyError(error)) {
      return IMPERSONATION_READ_ONLY_RESULT;
    }
    // A code, not the error: drizzle's carries the query's parameters and the
    // driver's quotes the row, and both hold the addresses.
    const code = emailChangeErrorCode(error);
    console.error("Error changing user email", userId, code);
    if (changeId !== null) {
      await noteFailure(
        changeId,
        `${clerkChanged ? "complete_failed" : "change_failed"}: ${code}`,
      );
    }
    return {
      success: false,
      message: clerkChanged ? HALFWAY_RETRY : GENERIC_FAILURE,
    };
  }
}
