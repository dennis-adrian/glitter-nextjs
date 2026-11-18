// @vitest-environment node
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { users, emailAddresses, refuseMock, calls } = vi.hoisted(() => {
  const calls: string[] = [];
  type ClerkCall = (...args: unknown[]) => Promise<unknown>;
  const tracked = (name: string) =>
    vi.fn<ClerkCall>(async () => {
      calls.push(name);
      return {};
    });
  return {
    calls,
    refuseMock: vi.fn(async () => {}),
    users: {
      getUser: vi.fn<ClerkCall>(async () => null),
      deleteUser: tracked("deleteUser"),
      getUserList: vi.fn<ClerkCall>(async () => ({ data: [], totalCount: 0 })),
      deleteUserExternalAccount: tracked("unlink"),
    },
    emailAddresses: {
      createEmailAddress: tracked("create"),
      updateEmailAddress: tracked("update"),
      deleteEmailAddress: tracked("delete"),
    },
  };
});

vi.mock("@/db/write-guard", () => ({ refuseDuringView: refuseMock }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users, emailAddresses }),
}));

import { changeClerkUserEmail, deleteClerkUser } from "@/app/lib/users/clerk";

const OLD = "vieja@example.com";
const NEW = "nueva@example.com";

function address(id: string, emailAddress: string, verified = true) {
  return {
    id,
    emailAddress,
    verification: { status: verified ? "verified" : "unverified" },
  };
}

function google(emailAddress: string, ids: { id: string; eac?: string }) {
  return {
    id: ids.id,
    externalAccountId: ids.eac,
    provider: "oauth_google",
    emailAddress,
  };
}

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_ana",
    passwordEnabled: true,
    primaryEmailAddressId: "idn_old",
    emailAddresses: [address("idn_old", OLD)],
    externalAccounts: [] as unknown[],
    ...overrides,
  };
}

/** The account with nothing but the new address on it. */
function settledUser(overrides: Record<string, unknown> = {}) {
  return clerkUser({
    primaryEmailAddressId: "idn_new",
    emailAddresses: [address("idn_new", NEW)],
    ...overrides,
  });
}

/** A Clerk failure whose message quotes an address, as the real ones can. */
function clerkError(status: number, code: string) {
  return new ClerkAPIResponseError(`${OLD} could not be processed`, {
    status,
    data: [
      { code, message: `${OLD} is invalid`, long_message: `${NEW} is taken` },
    ],
  });
}

function trackedCall(name: string) {
  return async () => {
    calls.push(name);
    return {};
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls.length = 0;
  refuseMock.mockClear();
  users.getUser.mockReset();
  users.getUserList.mockReset();
  users.getUserList.mockResolvedValue({ data: [], totalCount: 0 });
  users.deleteUser.mockReset().mockImplementation(trackedCall("deleteUser"));
  users.deleteUserExternalAccount
    .mockReset()
    .mockImplementation(trackedCall("unlink"));
  emailAddresses.createEmailAddress.mockReset().mockImplementation(async () => {
    calls.push("create");
    return { id: "idn_new" };
  });
  emailAddresses.updateEmailAddress
    .mockReset()
    .mockImplementation(trackedCall("update"));
  emailAddresses.deleteEmailAddress
    .mockReset()
    .mockImplementation(trackedCall("delete"));
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

/** Nothing that reached the log may carry an address. */
function expectNoAddressLogged() {
  for (const args of errorSpy.mock.calls) {
    for (const arg of args) {
      expect(typeof arg).toBe("string");
      expect(arg).not.toContain("@");
    }
  }
}

/** The first read, then what the account looks like once the work is done. */
function seeUser(first: unknown, after: unknown = settledUser()) {
  users.getUser.mockResolvedValueOnce(first).mockResolvedValueOnce(after);
}

function unlinkedIds() {
  return users.deleteUserExternalAccount.mock.calls.map(
    ([params]) => (params as { externalAccountId: string }).externalAccountId,
  );
}

function deletedIds() {
  return emailAddresses.deleteEmailAddress.mock.calls.map(([id]) => id);
}

describe("changeClerkUserEmail", () => {
  it("adds the new address as primary, then unlinks, then drops the old", async () => {
    seeUser(
      clerkUser({
        externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
      }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: ["oauth_google"],
      oldAddressesRemoved: true,
      passwordEnabled: true,
    });

    expect(refuseMock).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["create", "unlink", "delete"]);
    expect(users.getUserList).toHaveBeenCalledWith({ emailAddress: [NEW] });
    expect(users.deleteUserExternalAccount).toHaveBeenCalledWith({
      userId: "user_ana",
      externalAccountId: "eac_g",
    });
    expect(emailAddresses.createEmailAddress).toHaveBeenCalledWith({
      userId: "user_ana",
      emailAddress: NEW,
      verified: true,
      primary: true,
    });
    expect(emailAddresses.deleteEmailAddress).toHaveBeenCalledWith("idn_old");
    // Once before, once to confirm what is left.
    expect(users.getUser).toHaveBeenCalledTimes(2);
  });

  it.each([
    [true, true],
    [false, false],
    [undefined, false],
  ])("reports passwordEnabled %s as %s", async (onAccount, reported) => {
    seeUser(clerkUser({ passwordEnabled: onAccount }));

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toMatchObject({
      status: "changed",
      passwordEnabled: reported,
    });
  });

  it("falls back to the account id when there is no eac_ id", async () => {
    seeUser(
      clerkUser({ externalAccounts: [google(OLD, { id: "eac_plain" })] }),
    );

    await changeClerkUserEmail("user_ana", NEW);

    expect(users.deleteUserExternalAccount).toHaveBeenCalledWith({
      userId: "user_ana",
      externalAccountId: "eac_plain",
    });
  });

  it("keeps a connected account that is already on the new address", async () => {
    const kept = google(" Nueva@Example.com ", {
      id: "idn_keep",
      eac: "eac_keep",
    });
    seeUser(
      clerkUser({
        externalAccounts: [
          kept,
          google(OLD, { id: "idn_a", eac: "eac_a" }),
          google("otra@example.com", { id: "idn_b", eac: "eac_b" }),
        ],
      }),
      settledUser({ externalAccounts: [kept] }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: ["oauth_google"],
      // The kept account is on the new address: it is not a leftover.
      oldAddressesRemoved: true,
      passwordEnabled: true,
    });

    expect(unlinkedIds()).toEqual(["eac_a", "eac_b"]);
  });

  it("reports an address that another account holds, before any write", async () => {
    users.getUser.mockResolvedValue(
      clerkUser({ externalAccounts: [google(OLD, { id: "idn_g" })] }),
    );
    users.getUserList.mockResolvedValue({
      data: [{ id: "user_otra" }],
      totalCount: 1,
    });

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "email_taken",
    });
    expect(calls).toEqual([]);
    expect(users.getUser).toHaveBeenCalledTimes(1);
  });

  it("does not count the account itself as a holder", async () => {
    seeUser(clerkUser());
    users.getUserList.mockResolvedValue({
      data: [{ id: "user_ana" }],
      totalCount: 1,
    });

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toMatchObject({
      status: "changed",
    });
  });

  it.each([
    ["create", () => clerkUser()],
    [
      "update",
      () =>
        clerkUser({
          emailAddresses: [
            address("idn_old", OLD),
            address("idn_new", NEW, false),
          ],
        }),
    ],
  ] as const)(
    "maps form_identifier_exists on %s to email_taken",
    async (step, user) => {
      users.getUser.mockResolvedValue({
        ...user(),
        externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
      });
      const failure = clerkError(422, "form_identifier_exists");
      if (step === "create") {
        emailAddresses.createEmailAddress.mockRejectedValue(failure);
      } else {
        emailAddresses.updateEmailAddress.mockRejectedValue(failure);
      }

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "email_taken",
      });
      expect(emailAddresses.deleteEmailAddress).not.toHaveBeenCalled();
      expect(users.deleteUserExternalAccount).not.toHaveBeenCalled();
    },
  );

  it("reports an account Clerk no longer has", async () => {
    users.getUser.mockRejectedValue(clerkError(404, "resource_not_found"));

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "not_found",
    });
    expect(users.getUserList).not.toHaveBeenCalled();
  });

  it("writes nothing, and reads once, when the change is already done", async () => {
    users.getUser.mockResolvedValue(
      clerkUser({
        primaryEmailAddressId: "idn_new",
        emailAddresses: [address("idn_new", "Nueva@Example.com")],
        externalAccounts: [google(NEW, { id: "idn_g", eac: "eac_g" })],
      }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: [],
      oldAddressesRemoved: true,
      passwordEnabled: true,
    });
    expect(calls).toEqual([]);
    expect(users.getUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unverified", "idn_new", false],
    ["not primary", "idn_old", true],
  ] as const)(
    "promotes a new address that is on the account but %s",
    async (_label, primaryId, verified) => {
      seeUser(
        clerkUser({
          primaryEmailAddressId: primaryId,
          emailAddresses: [
            address("idn_old", OLD),
            address("idn_new", NEW, verified),
          ],
        }),
      );

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "changed",
        unlinkedProviders: [],
        oldAddressesRemoved: true,
        passwordEnabled: true,
      });

      expect(calls).toEqual(["update", "delete"]);
      expect(emailAddresses.updateEmailAddress).toHaveBeenCalledWith(
        "idn_new",
        { verified: true, primary: true },
      );
      expect(emailAddresses.createEmailAddress).not.toHaveBeenCalled();
      expect(emailAddresses.deleteEmailAddress).toHaveBeenCalledWith("idn_old");
    },
  );

  it("finishes a half-done attempt: only the leftovers are removed", async () => {
    seeUser(
      clerkUser({
        primaryEmailAddressId: "idn_new",
        emailAddresses: [address("idn_old", OLD), address("idn_new", NEW)],
        externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
      }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: ["oauth_google"],
      oldAddressesRemoved: true,
      passwordEnabled: true,
    });
    expect(calls).toEqual(["unlink", "delete"]);
  });

  it("does not count as unlinked an account that was already gone", async () => {
    seeUser(
      clerkUser({
        externalAccounts: [
          google(OLD, { id: "idn_g", eac: "eac_g" }),
          {
            id: "idn_f",
            externalAccountId: "eac_f",
            provider: "oauth_facebook",
            emailAddress: OLD,
          },
        ],
      }),
    );
    // Clerk answers 404 for the idn_ id of an account it has already dropped.
    users.deleteUserExternalAccount.mockRejectedValueOnce(
      clerkError(404, "external_account_not_found"),
    );
    emailAddresses.deleteEmailAddress.mockRejectedValue(
      clerkError(404, "resource_not_found"),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      // Only the one this run removed.
      unlinkedProviders: ["oauth_facebook"],
      oldAddressesRemoved: true,
      passwordEnabled: true,
    });
    expect(unlinkedIds()).toEqual(["eac_g", "eac_f"]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("makes no second read when everything left over was already gone", async () => {
    users.getUser.mockResolvedValue(
      clerkUser({
        primaryEmailAddressId: "idn_new",
        emailAddresses: [address("idn_old", OLD), address("idn_new", NEW)],
        externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
      }),
    );
    users.deleteUserExternalAccount.mockRejectedValue(
      clerkError(404, "external_account_not_found"),
    );
    emailAddresses.deleteEmailAddress.mockRejectedValue(
      clerkError(404, "resource_not_found"),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: [],
      oldAddressesRemoved: true,
      passwordEnabled: true,
    });
    expect(users.getUser).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    [
      "get_user:500",
      () => users.getUser.mockRejectedValue(clerkError(500, "not a code")),
    ],
    [
      "list_users:rate_limit_exceeded",
      () =>
        users.getUserList.mockRejectedValue(
          clerkError(429, "rate_limit_exceeded"),
        ),
    ],
    [
      "create_email_address:form_param_format_invalid",
      () =>
        emailAddresses.createEmailAddress.mockRejectedValue(
          clerkError(422, "form_param_format_invalid"),
        ),
    ],
    [
      "create_email_address:unknown",
      () =>
        emailAddresses.createEmailAddress.mockRejectedValue(
          new Error(`fetch failed for ${NEW}`),
        ),
    ],
  ] as const)(
    "fails with %s before the primary moves, without an address",
    async (detail, arrange) => {
      users.getUser.mockResolvedValue(
        clerkUser({
          externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
        }),
      );
      arrange();

      const result = await changeClerkUserEmail("user_ana", NEW);

      expect(result).toEqual({ status: "request_failed", detail });
      expect(detail).not.toContain("@");
      expect(emailAddresses.deleteEmailAddress).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      expectNoAddressLogged();
    },
  );

  it("leaves connected accounts alone when the new address cannot be added", async () => {
    // Unlinking first left a Google-only person with no way in at all.
    users.getUser.mockResolvedValue(
      clerkUser({
        passwordEnabled: false,
        externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
      }),
    );
    emailAddresses.createEmailAddress.mockRejectedValue(
      clerkError(500, "oops"),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "request_failed",
      detail: "create_email_address:oops",
    });

    expect(users.deleteUserExternalAccount).not.toHaveBeenCalled();
    expect(emailAddresses.deleteEmailAddress).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("reports a failed unlink as a leftover once the primary has moved", async () => {
    const linked = google(OLD, { id: "idn_g", eac: "eac_g" });
    seeUser(
      clerkUser({ externalAccounts: [linked] }),
      settledUser({
        emailAddresses: [address("idn_old", OLD), address("idn_new", NEW)],
        externalAccounts: [linked],
      }),
    );
    users.deleteUserExternalAccount.mockRejectedValue(
      clerkError(403, "forbidden"),
    );
    emailAddresses.deleteEmailAddress.mockRejectedValue(
      clerkError(422, "linked_external_account"),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: [],
      oldAddressesRemoved: false,
      passwordEnabled: true,
    });

    // The address is still tried, and neither is tried twice.
    expect(unlinkedIds()).toEqual(["eac_g"]);
    expect(deletedIds()).toEqual(["idn_old"]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      "unlink_external_account:forbidden",
    );
    expectNoAddressLogged();
  });

  it("counts a connected account left on the old address as a leftover", async () => {
    const linked = google(OLD, { id: "idn_g", eac: "eac_g" });
    seeUser(
      clerkUser({ externalAccounts: [linked] }),
      // The address went; the account Clerk said it removed is still there.
      settledUser({ externalAccounts: [linked] }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toMatchObject({
      status: "changed",
      oldAddressesRemoved: false,
    });
  });

  it("still reports the change when the old address cannot be removed", async () => {
    seeUser(
      clerkUser({
        emailAddresses: [
          address("idn_old", OLD),
          address("idn_older", "otra@example.com"),
        ],
      }),
      settledUser({
        emailAddresses: [address("idn_old", OLD), address("idn_new", NEW)],
      }),
    );
    emailAddresses.deleteEmailAddress.mockRejectedValueOnce(
      clerkError(409, "conflict"),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: [],
      oldAddressesRemoved: false,
      passwordEnabled: true,
    });

    // The rest of the cleanup still runs, and the failed one is not retried.
    expect(deletedIds()).toEqual(["idn_old", "idn_older"]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      "delete_email_address:conflict",
    );
    expectNoAddressLogged();
  });

  it("believes the account over a delete that answered ok", async () => {
    seeUser(
      clerkUser(),
      settledUser({
        emailAddresses: [address("idn_old", OLD), address("idn_new", NEW)],
      }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toMatchObject({
      status: "changed",
      oldAddressesRemoved: false,
    });
    expect(deletedIds()).toEqual(["idn_old"]);
  });

  it.each([
    ["fails", () => Promise.reject(clerkError(500, "oops"))],
    ["finds no account", () => Promise.resolve(null)],
  ])(
    "does not vouch for the cleanup when the second read %s",
    async (_label, second) => {
      users.getUser
        .mockResolvedValueOnce(clerkUser())
        .mockImplementationOnce(second);

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "changed",
        unlinkedProviders: [],
        oldAddressesRemoved: false,
        passwordEnabled: true,
      });
      expect(calls).toEqual(["create", "delete"]);
      expectNoAddressLogged();
    },
  );

  it("removes, in one extra pass, what appeared since the first read", async () => {
    seeUser(
      clerkUser(),
      settledUser({
        emailAddresses: [
          address("idn_new", NEW),
          address("idn_late", "tarde@example.com"),
        ],
        externalAccounts: [
          google("tarde@example.com", { id: "idn_lg", eac: "eac_lg" }),
        ],
      }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: ["oauth_google"],
      oldAddressesRemoved: true,
      passwordEnabled: true,
    });

    expect(calls).toEqual(["create", "delete", "unlink", "delete"]);
    expect(unlinkedIds()).toEqual(["eac_lg"]);
    expect(deletedIds()).toEqual(["idn_old", "idn_late"]);
    // One pass, not a loop: no third read.
    expect(users.getUser).toHaveBeenCalledTimes(2);
  });

  it("reports a late leftover the extra pass could not remove", async () => {
    seeUser(
      clerkUser(),
      settledUser({
        emailAddresses: [
          address("idn_new", NEW),
          address("idn_late", "tarde@example.com"),
        ],
      }),
    );
    emailAddresses.deleteEmailAddress
      .mockImplementationOnce(trackedCall("delete"))
      .mockRejectedValueOnce(clerkError(409, "conflict"));

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toMatchObject({
      status: "changed",
      oldAddressesRemoved: false,
    });
    expect(deletedIds()).toEqual(["idn_old", "idn_late"]);
    expectNoAddressLogged();
  });
});

describe("deleteClerkUser", () => {
  it("deletes an account Clerk has", async () => {
    users.getUser.mockResolvedValue(clerkUser());

    await expect(deleteClerkUser("user_ana")).resolves.toMatchObject({
      success: true,
      status: "deleted",
    });
    expect(users.deleteUser).toHaveBeenCalledWith("user_ana");
  });

  it("counts a 404 as already deleted", async () => {
    users.getUser.mockRejectedValue(clerkError(404, "resource_not_found"));

    await expect(deleteClerkUser("user_ana")).resolves.toMatchObject({
      success: true,
      status: "already_deleted",
    });
    expect(users.deleteUser).not.toHaveBeenCalled();
  });

  it("reports any other failure", async () => {
    users.getUser.mockResolvedValue(clerkUser());
    users.deleteUser.mockRejectedValue(clerkError(500, "oops"));

    await expect(deleteClerkUser("user_ana")).resolves.toMatchObject({
      success: false,
      status: "request_failed",
    });
  });
});
