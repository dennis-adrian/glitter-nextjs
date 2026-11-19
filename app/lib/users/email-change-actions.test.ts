// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentClerkUserMock = vi.hoisted(() => vi.fn());
const fetchProfileByClerkIdMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const beginMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const clerkDoneMock = vi.hoisted(() => vi.fn());
const markFailedMock = vi.hoisted(() => vi.fn());
const recordNoticesMock = vi.hoisted(() => vi.fn());
const changeClerkEmailMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const oldTemplateMock = vi.hoisted(() => vi.fn());
const newTemplateMock = vi.hoisted(() => vi.fn());

// `requireAdmin` itself stays real: only the Clerk session and the profile
// lookup behind it are faked, so these tests exercise the actual gate.
vi.mock("@/app/lib/users/queries", () => ({
  getCurrentClerkUser: currentClerkUserMock,
  cachedFetchUserProfileByClerkId: fetchProfileByClerkIdMock,
  cachedFetchBaseUserProfileByClerkId: vi.fn(),
}));
vi.mock("@/app/lib/impersonation/viewer", () => ({
  getViewerClerkId: async () =>
    ((await currentClerkUserMock()) as { id: string } | null)?.id ?? null,
}));
vi.mock("@/app/lib/users/navbar-profile", () => ({
  cachedFetchNavbarProfileByClerkId: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: transactionMock } }));

vi.mock("@/app/lib/users/email-changes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/users/email-changes")>();
  return {
    // Real: what it lets through is what reaches the log and the audit row.
    emailChangeErrorCode: actual.emailChangeErrorCode,
    EMAIL_CHANGE_WINDOW_MS: actual.EMAIL_CHANGE_WINDOW_MS,
    EMAIL_CHANGE_CLERK_BUDGET_MS: actual.EMAIL_CHANGE_CLERK_BUDGET_MS,
    beginEmailChange: beginMock,
    completeEmailChange: completeMock,
    markEmailChangeClerkDone: clerkDoneMock,
    markEmailChangeFailed: markFailedMock,
    recordEmailChangeNotices: recordNoticesMock,
  };
});
vi.mock("@/app/lib/users/clerk", () => ({
  changeClerkUserEmail: changeClerkEmailMock,
}));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/app/emails/email-changed-old-address", () => ({
  default: oldTemplateMock,
}));
vi.mock("@/app/emails/email-changed-new-address", () => ({
  default: newTemplateMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { changeUserEmail } from "@/app/lib/users/email-change-actions";
import {
  EMAIL_CHANGE_CLERK_BUDGET_MS,
  EMAIL_CHANGE_WINDOW_MS,
  emailChangeErrorCode,
} from "@/app/lib/users/email-changes";

const ADMIN = { id: 1, role: "admin" };
const FESTIVAL_ADMIN = { id: 2, role: "festival_admin" };
const PARTICIPANT = { id: 7, role: "user" };
const UNAUTHORIZED = { success: false, message: "No autorizado" };

const OLD_EMAIL = "Ana.Vieja@example.com";
const NEW_EMAIL = "ana.nueva@example.com";
const INPUT = { userId: 7, email: NEW_EMAIL };

const BEGUN = {
  status: "ok",
  resync: false,
  changeId: 31,
  clerkId: "user_ana",
  oldEmail: OLD_EMAIL,
  displayName: "Ana Ilustra",
  firstName: null,
  lastName: null,
};
const CHANGED = {
  status: "changed",
  unlinkedProviders: [] as string[],
  oldAddressesRemoved: true,
  passwordEnabled: true,
  googleOnNewAddress: false,
};

const REJECTED_SEND = {
  data: null,
  error: {
    name: "validation_error",
    statusCode: 422,
    message: `Invalid \`to\` field: ${OLD_EMAIL}`,
  },
  headers: null,
};

function signedInAs(profile: unknown) {
  currentClerkUserMock.mockResolvedValue({ id: "clerk_1" });
  fetchProfileByClerkIdMock.mockResolvedValue(profile);
}

/** Everything the console and the audit row were given, as one string. */
function everythingRecorded(consoleError: { mock: { calls: unknown[][] } }) {
  return JSON.stringify([
    consoleError.mock.calls.map((call) => call.map(String)),
    markFailedMock.mock.calls,
    recordNoticesMock.mock.calls,
  ]);
}

const TX = { tx: true };

beforeEach(() => {
  for (const mock of [
    currentClerkUserMock,
    fetchProfileByClerkIdMock,
    transactionMock,
    beginMock,
    completeMock,
    clerkDoneMock,
    markFailedMock,
    recordNoticesMock,
    changeClerkEmailMock,
    sendEmailMock,
    revalidatePathMock,
    oldTemplateMock,
    newTemplateMock,
  ]) {
    mock.mockReset();
  }
  transactionMock.mockImplementation((run: (tx: unknown) => unknown) =>
    run(TX),
  );
  beginMock.mockResolvedValue(BEGUN);
  changeClerkEmailMock.mockResolvedValue(CHANGED);
  completeMock.mockResolvedValue({ status: "ok" });
  sendEmailMock.mockResolvedValue({
    data: { id: "email-1" },
    error: null,
    headers: null,
  });
  oldTemplateMock.mockReturnValue("old-template");
  newTemplateMock.mockReturnValue("new-template");
});

describe("changeUserEmail authorization", () => {
  function expectNothingHappened() {
    expect(transactionMock).not.toHaveBeenCalled();
    expect(changeClerkEmailMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  }

  it("refuses an unauthenticated caller", async () => {
    currentClerkUserMock.mockResolvedValue(null);

    await expect(changeUserEmail(INPUT)).resolves.toEqual(UNAUTHORIZED);
    expectNothingHappened();
  });

  it("refuses a festival admin, who reaches the dashboard but is not an admin", async () => {
    signedInAs(FESTIVAL_ADMIN);

    await expect(changeUserEmail(INPUT)).resolves.toEqual(UNAUTHORIZED);
    expectNothingHappened();
  });

  it("refuses a participant, also for their own profile", async () => {
    signedInAs(PARTICIPANT);

    await expect(changeUserEmail(INPUT)).resolves.toEqual(UNAUTHORIZED);
    expectNothingHappened();
  });
});

describe("changeUserEmail", () => {
  beforeEach(() => signedInAs(ADMIN));

  it.each([
    ["not an address", "El correo no es válido"],
    ["   ", "Escribí el correo"],
  ])("refuses %j before touching anything", async (email, message) => {
    await expect(changeUserEmail({ userId: 7, email })).resolves.toEqual({
      success: false,
      message,
    });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(changeClerkEmailMock).not.toHaveBeenCalled();
  });

  it("refuses a user id that is not one", async () => {
    const result = await changeUserEmail({ userId: 0, email: NEW_EMAIL });

    expect(result.success).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("hands the normalized address and the admin to the first transaction", async () => {
    await changeUserEmail({ userId: 7, email: "  Ana.Nueva@Example.com " });

    expect(beginMock).toHaveBeenCalledWith(TX, {
      userId: 7,
      newEmail: NEW_EMAIL,
      actorId: ADMIN.id,
    });
    expect(changeClerkEmailMock).toHaveBeenCalledWith("user_ana", NEW_EMAIL, {
      deadline: expect.any(Number),
    });
  });

  it("gives Clerk a deadline inside the window that keeps a second attempt out", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
      // The reservation exists from here on.
      const reservedAt = Date.now();
      beginMock.mockImplementation(async () => {
        vi.setSystemTime(reservedAt + 250);
        return BEGUN;
      });

      await changeUserEmail(INPUT);

      const [, , options] = changeClerkEmailMock.mock.calls[0];
      expect(options.deadline).toBe(
        reservedAt + 250 + EMAIL_CHANGE_CLERK_BUDGET_MS,
      );
      // Room for a request already on its way when the deadline passes.
      expect(EMAIL_CHANGE_WINDOW_MS - EMAIL_CHANGE_CLERK_BUDGET_MS).toBe(
        30_000,
      );
      expect(options.deadline).toBeLessThan(
        reservedAt + EMAIL_CHANGE_WINDOW_MS,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["not_found", "No encontramos ese perfil."],
    [
      "deletion_pending",
      "Este perfil está en proceso de eliminación; no se puede cambiar su correo.",
    ],
    [
      "in_progress",
      "Ya hay un cambio de correo en curso para este perfil. Esperá un momento y volvé a intentar.",
    ],
    ["email_taken", "Ese correo ya pertenece a otra cuenta."],
  ])("refuses %s without asking Clerk", async (status, message) => {
    beginMock.mockResolvedValue({ status });

    await expect(changeUserEmail(INPUT)).resolves.toEqual({
      success: false,
      message,
    });
    expect(changeClerkEmailMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends the admin to unblock a suppressed address first", async () => {
    beginMock.mockResolvedValue({ status: "suppressed" });

    const result = await changeUserEmail(INPUT);

    expect(result.success).toBe(false);
    expect(result.message).toContain("bloqueado por rebotes o reportes");
    expect(result.message).toContain("/dashboard/emails");
    expect(changeClerkEmailMock).not.toHaveBeenCalled();
  });

  describe("when Clerk does not change", () => {
    it("says the address is taken when Clerk has it on another account", async () => {
      changeClerkEmailMock.mockResolvedValue({ status: "email_taken" });

      await expect(changeUserEmail(INPUT)).resolves.toEqual({
        success: false,
        message: "Ese correo ya pertenece a otra cuenta.",
      });
      expect(markFailedMock).toHaveBeenCalledWith(31, "clerk_email_taken");
      expect(completeMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("notes a deadline that passed before Clerk changed as any failed request", async () => {
      changeClerkEmailMock.mockResolvedValue({
        status: "request_failed",
        detail: "deadline",
      });

      const result = await changeUserEmail(INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Intentá de nuevo");
      expect(markFailedMock).toHaveBeenCalledWith(31, "clerk_failed: deadline");
      expect(completeMock).not.toHaveBeenCalled();
    });

    it("says the Clerk account is gone", async () => {
      changeClerkEmailMock.mockResolvedValue({ status: "not_found" });

      const result = await changeUserEmail(INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toContain("ya no existe en Clerk");
      expect(markFailedMock).toHaveBeenCalledWith(31, "clerk_user_not_found");
      expect(completeMock).not.toHaveBeenCalled();
    });

    it("keeps Clerk's log-safe detail and asks to retry", async () => {
      changeClerkEmailMock.mockResolvedValue({
        status: "request_failed",
        detail: "create_email_address:form_param_format_invalid",
      });

      const result = await changeUserEmail(INPUT);

      expect(result).toEqual({
        success: false,
        message:
          "No pudimos cambiar el correo. Intentá de nuevo en unos minutos.",
      });
      expect(markFailedMock).toHaveBeenCalledWith(
        31,
        "clerk_failed: create_email_address:form_param_format_invalid",
      );
      expect(completeMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("still answers when the failure cannot be written down", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      changeClerkEmailMock.mockResolvedValue({ status: "email_taken" });
      markFailedMock.mockRejectedValue(new Error("db down"));

      await expect(changeUserEmail(INPUT)).resolves.toEqual({
        success: false,
        message: "Ese correo ya pertenece a otra cuenta.",
      });
      consoleError.mockRestore();
    });

    it("answers with the view's own message when the guard refuses", async () => {
      changeClerkEmailMock.mockRejectedValue(
        Object.assign(new Error("solo lectura"), {
          code: "IMPERSONATION_READ_ONLY",
        }),
      );

      await expect(changeUserEmail(INPUT)).resolves.toEqual({
        success: false,
        message: "Estás viendo la app como otra cuenta: solo lectura.",
      });
      expect(completeMock).not.toHaveBeenCalled();
    });
  });

  describe("once Clerk has changed", () => {
    it("completes in a second transaction, after noting that Clerk is done", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        unlinkedProviders: ["oauth_google"],
      });

      await changeUserEmail(INPUT);

      expect(clerkDoneMock).toHaveBeenCalledWith(31, ["oauth_google"]);
      expect(completeMock).toHaveBeenCalledWith(TX, {
        changeId: 31,
        userId: 7,
        oldEmail: OLD_EMAIL,
        newEmail: NEW_EMAIL,
        unlinkedProviders: ["oauth_google"],
      });
      expect(transactionMock).toHaveBeenCalledTimes(2);
      expect(clerkDoneMock.mock.invocationCallOrder[0]).toBeLessThan(
        completeMock.mock.invocationCallOrder[0],
      );
    });

    it("tells the admin to run it again when the second transaction fails", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      // What drizzle throws: the parameters, addresses included, ride along.
      completeMock.mockRejectedValue(
        Object.assign(
          new Error(`Failed query: update users\nparams: ${NEW_EMAIL}`),
          {
            cause: Object.assign(
              new Error(`Key (email)=(${NEW_EMAIL}) is locked`),
              { code: "40P01" },
            ),
          },
        ),
      );

      const result = await changeUserEmail(INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toContain("El correo de acceso ya cambió");
      expect(result.message).toContain(
        "Volvé a hacer el cambio con el mismo correo para completarlo",
      );
      // The failure may not have been written down, and then the open row
      // keeps the retry out until the window passes.
      expect(result.message).toContain(
        "si te responde que ya hay un cambio en curso, esperá un par de minutos y repetilo",
      );
      expect(markFailedMock).toHaveBeenCalledWith(
        31,
        "complete_failed: sqlstate=40P01",
      );
      expect(sendEmailMock).not.toHaveBeenCalled();

      const recorded = everythingRecorded(consoleError);
      expect(recorded).not.toContain("example.com");
      expect(JSON.stringify(result)).not.toContain("example.com");
      consoleError.mockRestore();
    });

    it.each([
      ["user_gone", "el perfil fue eliminado"],
      ["deletion_pending", "proceso de eliminación"],
      ["email_taken", "otro perfil tiene ese correo"],
    ])("explains %s instead of reporting success", async (status, fragment) => {
      completeMock.mockResolvedValue({ status });

      const result = await changeUserEmail(INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toContain("El correo de acceso ya cambió");
      expect(result.message).toContain(fragment);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("says another change started meanwhile, without claiming Clerk changed", async () => {
      completeMock.mockResolvedValue({ status: "superseded" });

      const result = await changeUserEmail(INPUT);

      expect(result).toEqual({
        success: false,
        message:
          "Mientras tanto empezó otro cambio de correo para este perfil, así que no actualizamos el perfil con este. Puede que el correo de acceso haya cambiado en este intento: revisá el correo del perfil y, si hace falta, repetí el cambio.",
      });
      // The newer run tells the person; this one has nothing true to say.
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/users");
    });

    it("gives the same advice when not even the failure could be written down", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      clerkDoneMock.mockRejectedValue(new Error("db down"));
      markFailedMock.mockRejectedValue(new Error("db down"));

      const result = await changeUserEmail(INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toContain("El correo de acceso ya cambió");
      expect(result.message).toContain("esperá un par de minutos");
      expect(completeMock).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("converges on a second run after the first stopped halfway", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      completeMock.mockRejectedValueOnce(new Error("connection lost"));

      const first = await changeUserEmail(INPUT);
      // The profile still has the old address, so the second run starts a
      // new audit row; Clerk answers `changed` for work already done.
      beginMock.mockResolvedValue({ ...BEGUN, changeId: 32 });
      const second = await changeUserEmail(INPUT);

      expect(first.success).toBe(false);
      expect(second).toEqual({ success: true, message: "Correo actualizado." });
      expect(changeClerkEmailMock).toHaveBeenCalledTimes(2);
      expect(completeMock).toHaveBeenLastCalledWith(
        TX,
        expect.objectContaining({ changeId: 32 }),
      );
      consoleError.mockRestore();
    });
  });

  describe("notices", () => {
    it("writes to each address on its own, old one first", async () => {
      await changeUserEmail(INPUT);

      expect(sendEmailMock).toHaveBeenCalledTimes(2);
      const [oldSend, newSend] = sendEmailMock.mock.calls;
      expect(oldSend[0]).toMatchObject({
        to: [OLD_EMAIL],
        from: "Perfiles Glitter <perfiles@productoraglitter.com>",
        subject: "Cambiamos el correo de tu cuenta Glitter",
        react: "old-template",
      });
      expect(oldSend[1]).toEqual({ idempotencyKey: "email-change-31-old" });
      expect(newSend[0]).toMatchObject({
        to: [NEW_EMAIL],
        from: "Perfiles Glitter <perfiles@productoraglitter.com>",
        subject: "Este es ahora tu correo de acceso a Glitter",
        react: "new-template",
      });
      expect(newSend[1]).toEqual({ idempotencyKey: "email-change-31-new" });

      // A shared `to`, a cc or a bcc would show one mailbox the other.
      for (const [payload] of sendEmailMock.mock.calls) {
        expect(payload.to).toHaveLength(1);
        expect(payload).not.toHaveProperty("cc");
        expect(payload).not.toHaveProperty("bcc");
      }
    });

    it("renders both with the person's name and the new address", async () => {
      await changeUserEmail(INPUT);

      const props = { name: "Ana Ilustra", newEmail: NEW_EMAIL };
      expect(oldTemplateMock).toHaveBeenCalledWith(props);
      expect(newTemplateMock).toHaveBeenCalledWith(props);
    });

    it("greets without a name when the profile has none", async () => {
      beginMock.mockResolvedValue({ ...BEGUN, displayName: null });

      await changeUserEmail(INPUT);

      expect(oldTemplateMock).toHaveBeenCalledWith({
        name: null,
        newEmail: NEW_EMAIL,
      });
    });

    it("sends them only after the database has followed Clerk", async () => {
      await changeUserEmail(INPUT);

      expect(completeMock.mock.invocationCallOrder[0]).toBeLessThan(
        sendEmailMock.mock.invocationCallOrder[0],
      );
      expect(recordNoticesMock).toHaveBeenCalledWith(31, {
        old: "sent",
        new: "sent",
      });
    });

    it("reports success when the old address rejects its notice", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      sendEmailMock.mockResolvedValueOnce(REJECTED_SEND);

      const result = await changeUserEmail(INPUT);

      expect(result).toEqual({ success: true, message: "Correo actualizado." });
      expect(sendEmailMock).toHaveBeenCalledTimes(2);
      expect(recordNoticesMock).toHaveBeenCalledWith(31, {
        old: "resend:validation_error",
        new: "sent",
      });
      expect(everythingRecorded(consoleError)).not.toContain("example.com");
      consoleError.mockRestore();
    });

    it("reports success and says so when the new address's notice fails", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      sendEmailMock
        .mockResolvedValueOnce({ data: { id: "1" }, error: null })
        .mockRejectedValueOnce(new TypeError("fetch failed"));

      const result = await changeUserEmail(INPUT);

      expect(result.success).toBe(true);
      expect(result.needsFollowUp).toBe(true);
      expect(result.description).toContain(
        "No pudimos enviar el aviso al correo nuevo",
      );
      expect(recordNoticesMock).toHaveBeenCalledWith(31, {
        old: "sent",
        new: "TypeError",
      });
      consoleError.mockRestore();
    });

    it("reports success when the outcomes cannot be written down", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      recordNoticesMock.mockRejectedValue(new Error("db down"));

      await expect(changeUserEmail(INPUT)).resolves.toMatchObject({
        success: true,
      });
      consoleError.mockRestore();
    });
  });

  describe("what the admin is told", () => {
    it("adds nothing when there was nothing else to do", async () => {
      await expect(changeUserEmail(INPUT)).resolves.toEqual({
        success: true,
        message: "Correo actualizado.",
      });
    });

    const NEEDS_GOOGLE_ACCOUNT =
      "Desvinculamos su cuenta de Google anterior. Para entrar con Google necesita una cuenta de Google del correo nuevo.";
    const CAN_USE_GOOGLE =
      "Desvinculamos su cuenta de Google anterior; ya puede entrar con Google usando el correo nuevo.";

    it.each(["oauth_google", "google"])(
      "says the old Google account was unlinked (%s), and what Google needs now",
      async (provider) => {
        changeClerkEmailMock.mockResolvedValue({
          ...CHANGED,
          unlinkedProviders: [provider],
        });

        const result = await changeUserEmail(INPUT);

        // A password is no evidence that Google works with the new address.
        expect(result.description).toBe(NEEDS_GOOGLE_ACCOUNT);
        expect(result.description).not.toContain("ya puede entrar con Google");
      },
    );

    it.each([true, false])(
      "says Google works only when a Google account of the new address is connected (password %s)",
      async (passwordEnabled) => {
        changeClerkEmailMock.mockResolvedValue({
          ...CHANGED,
          unlinkedProviders: ["oauth_google"],
          passwordEnabled,
          googleOnNewAddress: true,
        });

        const result = await changeUserEmail(INPUT);

        // With that account they have a way in: no warning, password or not.
        expect(result).toEqual({
          success: true,
          message: "Correo actualizado.",
          description: CAN_USE_GOOGLE,
        });
      },
    );

    it("does not promise Google to someone without a password", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        unlinkedProviders: ["oauth_google"],
        passwordEnabled: false,
      });

      const result = await changeUserEmail(INPUT);

      expect(result).toEqual({
        success: true,
        message: "Correo actualizado.",
        description:
          "Desvinculamos su cuenta de Google anterior. No tiene contraseña: para entrar necesita una cuenta de Google del correo nuevo o el código que le llega a ese correo. Confirmá con la persona que pudo entrar.",
      });
    });

    it("says nothing about Google when none was unlinked, connected or not", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        googleOnNewAddress: true,
      });

      await expect(changeUserEmail(INPUT)).resolves.toEqual({
        success: true,
        message: "Correo actualizado.",
      });
    });

    it("says nothing about a password when no Google account was unlinked", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        passwordEnabled: false,
      });

      await expect(changeUserEmail(INPUT)).resolves.toEqual({
        success: true,
        message: "Correo actualizado.",
      });
    });

    it("says so for other connected accounts too", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        unlinkedProviders: ["oauth_facebook"],
      });

      const result = await changeUserEmail(INPUT);

      expect(result.description).toContain(
        "Desvinculamos las cuentas conectadas al correo anterior",
      );
    });

    it("says the cleanup could not be confirmed, and how to finish it", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        unlinkedProviders: ["oauth_google"],
        oldAddressesRemoved: false,
      });

      const result = await changeUserEmail(INPUT);

      expect(result.success).toBe(true);
      expect(result.needsFollowUp).toBe(true);
      expect(result.description).toContain("Desvinculamos su cuenta de Google");
      expect(result.description).toContain(
        "No pudimos confirmar que el correo anterior haya quedado fuera de la cuenta de acceso: volvé a hacer el cambio con el mismo correo para terminar de quitarlo.",
      );
      // Unknown is not "still works": the read that confirms it may have failed.
      expect(result.description).not.toContain("todavía sirve");
      // The way out is this same dialog, never Clerk's own panel.
      expect(JSON.stringify(result)).not.toMatch(/clerk/i);
    });

    it("refreshes the users list and every profile page", async () => {
      await changeUserEmail(INPUT);

      expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/users");
      expect(revalidatePathMock).toHaveBeenCalledWith(
        "/dashboard/users/[profileId]",
        "page",
      );
    });
  });

  describe("repeating the address the profile already has", () => {
    const RESYNC_INPUT = { userId: 7, email: OLD_EMAIL };
    const RESYNCED = "La cuenta de acceso quedó sincronizada con ese correo.";

    beforeEach(() => beginMock.mockResolvedValue({ ...BEGUN, resync: true }));

    it("runs the same Clerk and database steps and writes to nobody", async () => {
      await expect(changeUserEmail(RESYNC_INPUT)).resolves.toEqual({
        success: true,
        message: RESYNCED,
      });

      const normalized = OLD_EMAIL.toLowerCase();
      expect(changeClerkEmailMock).toHaveBeenCalledWith(
        "user_ana",
        normalized,
        { deadline: expect.any(Number) },
      );
      expect(clerkDoneMock).toHaveBeenCalledWith(31, []);
      expect(completeMock).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ changeId: 31, newEmail: normalized }),
      );
      // Nothing changed for the person: a notice would only alarm them.
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(recordNoticesMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/users");
    });

    it("still says what Clerk removed", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        unlinkedProviders: ["oauth_google"],
      });

      const result = await changeUserEmail(RESYNC_INPUT);

      expect(result.message).toBe(RESYNCED);
      expect(result.description).toContain("Desvinculamos su cuenta de Google");
      expect(result.needsFollowUp).toBeUndefined();
    });

    it("asks for another run when something is still left", async () => {
      changeClerkEmailMock.mockResolvedValue({
        ...CHANGED,
        oldAddressesRemoved: false,
      });

      await expect(changeUserEmail(RESYNC_INPUT)).resolves.toEqual({
        success: true,
        message: RESYNCED,
        description:
          "No pudimos confirmar que el correo anterior haya quedado fuera de la cuenta de acceso: volvé a hacer el cambio con el mismo correo para terminar de quitarlo.",
        needsFollowUp: true,
      });
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("reports a Clerk failure like any other change", async () => {
      changeClerkEmailMock.mockResolvedValue({
        status: "request_failed",
        detail: "get_user:500",
      });

      const result = await changeUserEmail(RESYNC_INPUT);

      expect(result.success).toBe(false);
      expect(markFailedMock).toHaveBeenCalledWith(
        31,
        "clerk_failed: get_user:500",
      );
      expect(completeMock).not.toHaveBeenCalled();
    });
  });

  it("answers generically when the first transaction fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    beginMock.mockRejectedValue(new Error(`boom ${NEW_EMAIL}`));

    const result = await changeUserEmail(INPUT);

    expect(result).toEqual({
      success: false,
      message:
        "No pudimos cambiar el correo. Intentá de nuevo en unos minutos.",
    });
    expect(changeClerkEmailMock).not.toHaveBeenCalled();
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(everythingRecorded(consoleError)).not.toContain("example.com");
    consoleError.mockRestore();
  });

  it("answers generically, and notes it, when Clerk throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    changeClerkEmailMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await changeUserEmail(INPUT);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Intentá de nuevo");
    expect(markFailedMock).toHaveBeenCalledWith(31, "change_failed: TypeError");
    expect(completeMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("emailChangeErrorCode", () => {
  it("keeps the SQLSTATE and constraint of a wrapped driver error, never its text", () => {
    const driver = Object.assign(
      new Error("Key (email)=(ana@example.com) already exists."),
      { code: "23505", constraint: "users_email_unique" },
    );
    const wrapped = Object.assign(
      new Error("Failed query: update users\nparams: ana@example.com"),
      { cause: driver },
    );

    expect(emailChangeErrorCode(wrapped)).toBe(
      "sqlstate=23505 constraint=users_email_unique",
    );
    expect(
      emailChangeErrorCode(Object.assign(new Error("x"), { code: "40P01" })),
    ).toBe("sqlstate=40P01");
    // Node's own codes are not SQLSTATEs.
    for (const code of ["ECONNREFUSED", "EPIPE"]) {
      expect(
        emailChangeErrorCode(
          Object.assign(new TypeError("ana@example.com"), { code }),
        ),
      ).toBe("TypeError");
    }
    expect(emailChangeErrorCode("ana@example.com")).toBe("string");
  });
});
