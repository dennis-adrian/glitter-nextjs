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
  .min(1, { error: "Escribe el correo" })
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
};

/**
 * What the Clerk side of a change reports. `changed` covers a retry that found
 * the work already done. Once the primary address has moved, the result is
 * `changed` even when tidying up failed, so the database can follow Clerk.
 */
export type ChangeClerkEmailResult =
  | {
      status: "changed";
      /** Providers of the connected accounts removed, e.g. "oauth_google". */
      unlinkedProviders: string[];
      /** False when an address other than the new one is still on the account. */
      oldAddressesRemoved: boolean;
    }
  | { status: "email_taken" }
  | { status: "not_found" }
  | {
      status: "request_failed";
      /** Log-safe: a step name and Clerk's error code, never an address. */
      detail: string;
    };
