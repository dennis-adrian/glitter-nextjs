"use server";

import { revalidatePath } from "next/cache";

import EmailChangedNewAddressEmail from "@/app/emails/email-changed-new-address";
import EmailChangedOldAddressEmail from "@/app/emails/email-changed-old-address";
import { IMPERSONATION_READ_ONLY_RESULT } from "@/app/lib/impersonation/definitions";
import {
  changeClerkUserEmail,
  revokeClerkSessionsBefore,
} from "@/app/lib/users/clerk";
import {
  ChangeUserEmailSchema,
  type ChangeUserEmailInput,
  type ChangeUserEmailResult,
} from "@/app/lib/users/email-change-definitions";
import {
  beginEmailChange,
  completeEmailChange,
  EMAIL_CHANGE_CLERK_BUDGET_MS,
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
  // The one case where Clerk may not hold this address: the newer run writes
  // there too.
  superseded:
    "Mientras tanto empezó otro cambio de correo para este perfil, así que no actualizamos el perfil con este. Puede que el correo de acceso haya cambiado en este intento: revisá el correo del perfil y, si hace falta, repetí el cambio.",
};

// A write may have landed after all: only a repeat can tell.
const DEADLINE_UNCONFIRMED =
  "No pudimos confirmar si el correo de acceso cambió. Volvé a hacer el cambio con el mismo correo para terminarlo; si te responde que ya hay un cambio en curso, esperá un par de minutos y repetilo.";

const UNCONFIRMED =
  "La cuenta de acceso no quedó con el correo nuevo como principal, así que no actualizamos el perfil. Volvé a hacer el cambio con el mismo correo; si te responde que ya hay un cambio en curso, esperá un par de minutos y repetilo.";

const UNCONFIRMED_UNLINKED =
  "Ya desvinculamos las cuentas conectadas al correo anterior.";

const SESSIONS_LEFT_OPEN =
  "No pudimos cerrar todas sus sesiones abiertas: volvé a hacer el cambio con el mismo correo para cerrarlas.";

const HALFWAY_RETRY =
  "El correo de acceso ya cambió, pero no pudimos terminar de actualizar el perfil. Volvé a hacer el cambio con el mismo correo para completarlo; si te responde que ya hay un cambio en curso, esperá un par de minutos y repetilo.";

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
 * Signs the person out of what they opened before the change began: the old
 * mailbox or Google account may not be theirs any more. False when some
 * session may still be open. The change is committed by now, so nothing but
 * the view guard's refusal is thrown.
 */
async function closeOldSessions(clerkId: string, cutoff: number | null) {
  // A resync with no change behind it: the address was never moved here.
  if (cutoff == null) return true;
  try {
    const { failed } = await revokeClerkSessionsBefore(clerkId, cutoff);
    return failed === 0;
  } catch (error) {
    // A view is refused like everywhere else in the action; the Clerk half
    // already refused it, so this one cannot be reached.
    if (isImpersonationReadOnlyError(error)) throw error;
    console.error(
      "Error closing sessions after email change",
      emailChangeErrorCode(error),
    );
    return false;
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
  googleOnNewAddress: boolean;
  sessionsClosed: boolean;
  /** Null when nobody was written to: a resync with no notice owed. */
  notices: { old: string; new: string } | null;
}) {
  const lines: string[] = [];
  // A way in was removed and neither a password nor a Google account of the
  // new address is known to replace it.
  const mayBeLockedOut =
    input.unlinkedProviders.length > 0 &&
    !input.passwordEnabled &&
    !input.googleOnNewAddress;
  // Clerk names the provider "oauth_google" in some payloads and "google" in
  // others.
  if (
    input.unlinkedProviders.some((p) => p === "oauth_google" || p === "google")
  ) {
    lines.push(
      input.googleOnNewAddress
        ? "Desvinculamos su cuenta de Google anterior; ya puede entrar con Google usando el correo nuevo."
        : input.passwordEnabled
          ? // A password says nothing about Google: only an account of the
            // new address, seen on the Clerk account, does.
            "Desvinculamos su cuenta de Google anterior. Para entrar con Google necesita una cuenta de Google del correo nuevo."
          : // Google was likely their only way in.
            // Whether a code by email is offered is Clerk's setting, which the
            // backend API does not show: it is not promised.
            "Desvinculamos su cuenta de Google anterior. No tiene contraseña: para entrar necesita una cuenta de Google del correo nuevo, o el código que le llega a ese correo si esa forma de ingreso está habilitada. Confirmá con la persona que pudo entrar.",
    );
  } else if (input.unlinkedProviders.length > 0) {
    lines.push(
      mayBeLockedOut
        ? // Not "connect an account": that takes being signed in.
          "Desvinculamos las cuentas conectadas al correo anterior. No tiene contraseña: para entrar necesita una cuenta de Google o de otro proveedor que sea del correo nuevo, o el código que le llega a ese correo si esa forma de ingreso está habilitada. Confirmá con la persona que pudo entrar."
        : "Desvinculamos las cuentas conectadas al correo anterior; puede volver a conectarlas con el correo nuevo.",
    );
  }
  if (!input.oldAddressesRemoved) {
    lines.push(
      // Unknown, not known bad: the read that would confirm it may have failed.
      "No pudimos confirmar que el correo anterior haya quedado fuera de la cuenta de acceso: volvé a hacer el cambio con el mismo correo para terminar de quitarlo.",
    );
  }
  if (!input.sessionsClosed) lines.push(SESSIONS_LEFT_OPEN);
  if (input.notices && input.notices.new !== "sent") {
    lines.push("No pudimos enviar el aviso al correo nuevo; avisale vos.");
  }
  return {
    description: lines.length > 0 ? lines.join(" ") : undefined,
    // Something only the admin can do next, so it must not scroll away.
    needsFollowUp:
      mayBeLockedOut ||
      !input.oldAddressesRemoved ||
      !input.sessionsClosed ||
      (input.notices != null && input.notices.new !== "sent"),
  };
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
 * clear whatever an earlier change left on the Clerk account. Nobody is
 * written to, unless the change that brought the profile here never got to
 * send its notices: then they go out now.
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
    // The reservation is not renewed, so Clerk stops being written to while
    // it still keeps a second attempt out. Counted from when the row was
    // reserved, not from now: the transaction may have been slow to return.
    const clerk = await changeClerkUserEmail(begun.clerkId, newEmail, {
      deadline: begun.reservedAt + EMAIL_CHANGE_CLERK_BUDGET_MS,
      // A connected account of the address they are leaving goes even when
      // an earlier attempt already took the address itself off the account.
      removedEmails: [begun.oldEmail, begun.arrivedFrom],
    });
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
      if (clerk.detail === "deadline_unconfirmed") {
        revalidatePath("/dashboard/users");
        return { success: false, message: DEADLINE_UNCONFIRMED };
      }
      return { success: false, message: GENERIC_FAILURE };
    }
    // Clerk does not sign in with the new address, so the profile, the queued
    // mail and the notices must not follow it.
    if (clerk.status === "unconfirmed") {
      await noteFailure(changeId, "clerk_unconfirmed");
      revalidatePath("/dashboard/users");
      return {
        success: false,
        message: UNCONFIRMED,
        ...(clerk.unlinkedProviders.length > 0
          ? { description: UNCONFIRMED_UNLINKED }
          : {}),
      };
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

    // Before the notices, so the old mailbox is told of a change that has
    // already shut it out. Counted from when the change began: what was
    // opened after it used the new address. On a resync, that is the change
    // that brought the profile here.
    const sessionsClosed = await closeOldSessions(
      begun.clerkId,
      begun.resync ? begun.arrivedAt : begun.reservedAt,
    );

    // On a resync, the notices belong to the earlier row that made the move.
    const noticesFor = begun.resync
      ? begun.owedNotices
      : { changeId, oldEmail: begun.oldEmail };
    const notices = noticesFor
      ? await sendNotices({
          ...noticesFor,
          newEmail,
          name: getUserName(begun) || null,
        })
      : null;

    revalidatePath("/dashboard/users");
    revalidatePath("/dashboard/users/[profileId]", "page");

    const { description, needsFollowUp } = describeOutcome({
      unlinkedProviders: clerk.unlinkedProviders,
      oldAddressesRemoved: clerk.oldAddressesRemoved,
      passwordEnabled: clerk.passwordEnabled,
      googleOnNewAddress: clerk.googleOnNewAddress,
      sessionsClosed,
      notices,
    });
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
