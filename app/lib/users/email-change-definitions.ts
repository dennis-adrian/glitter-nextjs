import { z } from "zod";

/**
 * The address as it is stored and compared: trimmed and lowercased, the same
 * form the opt-out tables key on.
 */
export function normalizeEmail(address: string) {
  return address.trim().toLowerCase();
}

const emailField = z
  .string()
  .trim()
  .min(1, { error: "Escribí el correo" })
  .max(254, { error: "El correo es demasiado largo" })
  .pipe(z.email({ error: "El correo no es válido" }))
  .transform(normalizeEmail);

/** What the server action accepts. Shared with the dialog's form. */
export const ChangeUserEmailSchema = z.object({
  userId: z.number().int().positive(),
  email: emailField,
});

export type ChangeUserEmailInput = z.input<typeof ChangeUserEmailSchema>;

/**
 * The dialog's own shape: the address is typed twice, since nothing verifies
 * it and a typo would lock the person out of their account.
 */
export const ChangeUserEmailFormSchema = z
  .object({
    email: emailField,
    confirmEmail: z.string().trim().transform(normalizeEmail),
  })
  .refine((value) => value.email === value.confirmEmail, {
    path: ["confirmEmail"],
    error: "Los correos no coinciden",
  });

export type ChangeUserEmailResult = {
  success: boolean;
  message: string;
  /** Extra line for the toast: what else changed, or what is left to do. */
  description?: string;
  /** The change went through but the admin still has something to do. */
  needsFollowUp?: boolean;
};

/**
 * What the Clerk side of a change reports. `changed` covers a retry that found
 * the work already done. Once the primary address has moved, the result is
 * `changed` even when tidying up failed, so the database can follow Clerk.
 * `not_found` can also come after that, when the account was deleted meanwhile.
 */
export type ChangeClerkEmailResult =
  | {
      status: "changed";
      /** Providers of the accounts this run unlinked, e.g. "oauth_google". */
      unlinkedProviders: string[];
      /**
       * False when an address other than the new one, or a connected account
       * tied to one, is still on the account, or when that is unknown.
       */
      oldAddressesRemoved: boolean;
      /** Without one, a connected account or an emailed code is the way in. */
      passwordEnabled: boolean;
      /**
       * A verified Google account of the new address is connected, so Google
       * sign-in is known to work. False says nothing either way.
       */
      googleOnNewAddress: boolean;
    }
  | { status: "email_taken" }
  | { status: "not_found" }
  | {
      status: "request_failed";
      /** Log-safe: a step name and Clerk's error code, never an address. */
      detail: string;
    };
