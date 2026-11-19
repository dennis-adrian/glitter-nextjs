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

import { changeClerkUserEmail } from "@/app/lib/users/clerk";

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
    verification: { status: "verified" },
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
      googleOnNewAddress: false,
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
        externalAccounts: [kept, google(OLD, { id: "idn_a", eac: "eac_a" })],
      }),
      settledUser({ externalAccounts: [kept] }),
    );

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: ["oauth_google"],
      // The kept account is on the new address: it is not a leftover.
      oldAddressesRemoved: true,
      passwordEnabled: true,
      googleOnNewAddress: true,
    });

    expect(unlinkedIds()).toEqual(["eac_a"]);
  });

  describe("which connected accounts go with the old address", () => {
    const THIRD = "otra@example.com";

    it.each([
      ["of a mailbox that is not on the account", THIRD],
      ["with no address at all", ""],
    ])("keeps one %s", async (_label, email) => {
      const unrelated = google(email, { id: "idn_x", eac: "eac_x" });
      seeUser(
        clerkUser({ externalAccounts: [unrelated] }),
        settledUser({ externalAccounts: [unrelated] }),
      );

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "changed",
        unlinkedProviders: [],
        // Kept on purpose: it is not a leftover.
        oldAddressesRemoved: true,
        passwordEnabled: true,
        googleOnNewAddress: false,
      });

      expect(users.deleteUserExternalAccount).not.toHaveBeenCalled();
      expect(deletedIds()).toEqual(["idn_old"]);
    });

    it("writes nothing when one of another mailbox is all that is left", async () => {
      users.getUser.mockResolvedValueOnce(
        settledUser({
          externalAccounts: [google(THIRD, { id: "idn_x", eac: "eac_x" })],
        }),
      );

      await expect(
        changeClerkUserEmail("user_ana", NEW),
      ).resolves.toMatchObject({
        status: "changed",
        oldAddressesRemoved: true,
      });
      expect(calls).toEqual([]);
      expect(users.getUser).toHaveBeenCalledTimes(1);
    });

    it("unlinks one on another of the account's addresses, which is removed too", async () => {
      seeUser(
        clerkUser({
          emailAddresses: [
            address("idn_old", OLD),
            address("idn_third", " Otra@Example.com "),
          ],
          externalAccounts: [google(THIRD, { id: "idn_t", eac: "eac_t" })],
        }),
      );

      await expect(
        changeClerkUserEmail("user_ana", NEW),
      ).resolves.toMatchObject({
        status: "changed",
        unlinkedProviders: ["oauth_google"],
        oldAddressesRemoved: true,
      });

      expect(unlinkedIds()).toEqual(["eac_t"]);
      expect(deletedIds()).toEqual(["idn_old", "idn_third"]);
    });

    it.each([
      ["id", { id: "idn_l", externalAccountId: "eac_l" }],
      ["identificationId", { id: "eac_l", identificationId: "idn_l" }],
    ])(
      "unlinks one the old address only links to, by its %s",
      async (_label, ids) => {
        seeUser(
          clerkUser({
            emailAddresses: [
              {
                ...address("idn_old", OLD),
                linkedTo: [{ id: "idn_l", type: "oauth_google" }],
              },
            ],
            // No address of its own to match on.
            externalAccounts: [
              { provider: "oauth_google", emailAddress: "", ...ids },
            ],
          }),
        );

        await expect(
          changeClerkUserEmail("user_ana", NEW),
        ).resolves.toMatchObject({
          status: "changed",
          unlinkedProviders: ["oauth_google"],
          oldAddressesRemoved: true,
        });
        expect(unlinkedIds()).toEqual(["eac_l"]);
      },
    );

    it("still counts as a leftover one that outlived the address it was tied to", async () => {
      const linked = {
        provider: "oauth_google",
        emailAddress: "",
        id: "idn_l",
      };
      seeUser(
        clerkUser({
          emailAddresses: [
            {
              ...address("idn_old", OLD),
              linkedTo: [{ id: "idn_l", type: "oauth_google" }],
            },
          ],
          externalAccounts: [linked],
        }),
        // The address is gone, and with it the link that named the account.
        settledUser({ externalAccounts: [linked] }),
      );

      await expect(
        changeClerkUserEmail("user_ana", NEW),
      ).resolves.toMatchObject({
        status: "changed",
        oldAddressesRemoved: false,
      });
      // Tried once, in the first pass.
      expect(unlinkedIds()).toEqual(["idn_l"]);
    });

    describe("on a retry, once the old address is already off the account", () => {
      const survivor = google(` ${OLD.toUpperCase()} `, {
        id: "idn_a",
        eac: "eac_a",
      });

      it("keeps the survivor of an address nobody named", async () => {
        users.getUser.mockResolvedValueOnce(
          settledUser({ externalAccounts: [survivor] }),
        );

        await changeClerkUserEmail("user_ana", NEW);

        expect(calls).toEqual([]);
      });

      it("unlinks the survivor of an address the caller says was removed", async () => {
        seeUser(settledUser({ externalAccounts: [survivor] }));

        await expect(
          changeClerkUserEmail("user_ana", NEW, { removedEmails: [OLD, null] }),
        ).resolves.toMatchObject({
          status: "changed",
          unlinkedProviders: ["oauth_google"],
          oldAddressesRemoved: true,
        });

        expect(calls).toEqual(["unlink"]);
        expect(unlinkedIds()).toEqual(["eac_a"]);
      });

      it("reports it as a leftover when it will not go", async () => {
        seeUser(
          settledUser({ externalAccounts: [survivor] }),
          settledUser({ externalAccounts: [survivor] }),
        );
        users.deleteUserExternalAccount.mockRejectedValueOnce(
          clerkError(500, "internal_error"),
        );

        await expect(
          changeClerkUserEmail("user_ana", NEW, { removedEmails: [OLD] }),
        ).resolves.toMatchObject({
          status: "changed",
          unlinkedProviders: [],
          oldAddressesRemoved: false,
        });
        expectNoAddressLogged();
      });

      it("still writes nothing when no account of that address is left", async () => {
        users.getUser.mockResolvedValueOnce(
          settledUser({
            externalAccounts: [
              google("otra@example.com", { id: "idn_x", eac: "eac_x" }),
            ],
          }),
        );

        await expect(
          changeClerkUserEmail("user_ana", NEW, {
            // The new address among them is not something to remove.
            removedEmails: [OLD, NEW, "", null],
          }),
        ).resolves.toMatchObject({
          status: "changed",
          oldAddressesRemoved: true,
        });
        expect(calls).toEqual([]);
        expect(users.getUser).toHaveBeenCalledTimes(1);
      });
    });

    it("never unlinks one on the new address, even when the old address links to it", async () => {
      const onNew = google(NEW, { id: "idn_n", eac: "eac_n" });
      seeUser(
        clerkUser({
          emailAddresses: [
            {
              ...address("idn_old", OLD),
              linkedTo: [{ id: "idn_n", type: "oauth_google" }],
            },
          ],
          externalAccounts: [onNew],
        }),
        settledUser({ externalAccounts: [onNew] }),
      );

      await expect(
        changeClerkUserEmail("user_ana", NEW, { removedEmails: [NEW] }),
      ).resolves.toMatchObject({
        status: "changed",
        unlinkedProviders: [],
        oldAddressesRemoved: true,
        googleOnNewAddress: true,
      });
      expect(users.deleteUserExternalAccount).not.toHaveBeenCalled();
    });
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
      googleOnNewAddress: true,
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
        googleOnNewAddress: false,
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
      googleOnNewAddress: false,
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
      googleOnNewAddress: false,
    });
    expect(unlinkedIds()).toEqual(["eac_g", "eac_f"]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  describe("when every removal answered that it was already gone", () => {
    const halfDone = () =>
      clerkUser({
        primaryEmailAddressId: "idn_new",
        emailAddresses: [address("idn_old", OLD), address("idn_new", NEW)],
        externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
      });

    beforeEach(() => {
      users.deleteUserExternalAccount.mockRejectedValue(
        clerkError(404, "external_account_not_found"),
      );
      emailAddresses.deleteEmailAddress.mockRejectedValue(
        clerkError(404, "resource_not_found"),
      );
    });

    it("still reads the account back before vouching for it", async () => {
      seeUser(halfDone());

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "changed",
        unlinkedProviders: [],
        oldAddressesRemoved: true,
        passwordEnabled: true,
        googleOnNewAddress: false,
      });
      expect(users.getUser).toHaveBeenCalledTimes(2);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("does not vouch for it when the read cannot be made", async () => {
      users.getUser
        .mockResolvedValueOnce(halfDone())
        .mockRejectedValueOnce(clerkError(500, "oops"));

      await expect(
        changeClerkUserEmail("user_ana", NEW),
      ).resolves.toMatchObject({
        status: "changed",
        oldAddressesRemoved: false,
      });
    });

    it("finds what was added since the first read", async () => {
      // A 404 for what the first read had says nothing about this one.
      seeUser(
        halfDone(),
        settledUser({
          emailAddresses: [
            address("idn_new", NEW),
            address("idn_late", "tarde@example.com"),
          ],
        }),
      );
      users.getUser.mockResolvedValueOnce(settledUser());

      await changeClerkUserEmail("user_ana", NEW);

      expect(deletedIds()).toEqual(["idn_old", "idn_late"]);
    });
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
      googleOnNewAddress: false,
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
      googleOnNewAddress: false,
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

  it("does not vouch for the cleanup when the second read fails", async () => {
    users.getUser
      .mockResolvedValueOnce(clerkUser())
      .mockRejectedValueOnce(clerkError(500, "oops"));

    await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
      status: "changed",
      unlinkedProviders: [],
      oldAddressesRemoved: false,
      passwordEnabled: true,
      googleOnNewAddress: false,
    });
    expect(calls).toEqual(["create", "delete"]);
    expectNoAddressLogged();
  });

  it.each([
    [
      "answers 404",
      () => Promise.reject(clerkError(404, "resource_not_found")),
    ],
    ["finds no account", () => Promise.resolve(null)],
  ])(
    "reports the account as gone when the second read %s",
    async (_label, second) => {
      // Deleted while this ran: there is no change for the database to follow.
      users.getUser
        .mockResolvedValueOnce(clerkUser())
        .mockImplementationOnce(second);

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "not_found",
      });
      expect(calls).toEqual(["create", "delete"]);
    },
  );

  describe("what the result says about Google on the new address", () => {
    it("is true for a verified Google account of the new address, read last", async () => {
      seeUser(
        clerkUser({
          externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
        }),
        // Linked while this ran: the read-back is what counts.
        settledUser({
          externalAccounts: [google(NEW, { id: "idn_n", eac: "eac_n" })],
        }),
      );

      await expect(
        changeClerkUserEmail("user_ana", NEW),
      ).resolves.toMatchObject({ status: "changed", googleOnNewAddress: true });
    });

    it.each([
      ["of another provider", { provider: "oauth_facebook" }],
      ["not verified", { verification: { status: "unverified" } }],
      ["without a verification", { verification: null }],
    ])("is false for an account on the new address %s", async (_label, as) => {
      const account = { ...google(NEW, { id: "idn_n", eac: "eac_n" }), ...as };
      seeUser(
        clerkUser({ externalAccounts: [account] }),
        settledUser({ externalAccounts: [account] }),
      );

      await expect(
        changeClerkUserEmail("user_ana", NEW),
      ).resolves.toMatchObject({
        status: "changed",
        googleOnNewAddress: false,
      });
    });

    it("is false when the only Google account was the one unlinked", async () => {
      seeUser(
        clerkUser({
          passwordEnabled: false,
          externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
        }),
      );

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "changed",
        unlinkedProviders: ["oauth_google"],
        oldAddressesRemoved: true,
        passwordEnabled: false,
        googleOnNewAddress: false,
      });
    });
  });

  describe("what appeared since the first read", () => {
    const withLateSignIns = () =>
      settledUser({
        emailAddresses: [
          address("idn_new", NEW),
          address("idn_late", "tarde@example.com"),
        ],
        externalAccounts: [
          google("tarde@example.com", { id: "idn_lg", eac: "eac_lg" }),
        ],
      });

    it("is removed in one extra pass, and confirmed with one last read", async () => {
      seeUser(clerkUser(), withLateSignIns());
      users.getUser.mockResolvedValueOnce(settledUser());

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "changed",
        unlinkedProviders: ["oauth_google"],
        oldAddressesRemoved: true,
        passwordEnabled: true,
        googleOnNewAddress: false,
      });

      expect(calls).toEqual(["create", "delete", "unlink", "delete"]);
      expect(unlinkedIds()).toEqual(["eac_lg"]);
      expect(deletedIds()).toEqual(["idn_old", "idn_late"]);
      expect(users.getUser).toHaveBeenCalledTimes(3);
    });

    it.each([
      // A delete that answered ok is no more to be believed here than before.
      ["still shows it", () => Promise.resolve(withLateSignIns())],
      [
        "shows yet another one",
        () =>
          Promise.resolve(
            settledUser({
              emailAddresses: [
                address("idn_new", NEW),
                address("idn_later", "mas-tarde@example.com"),
              ],
            }),
          ),
      ],
      ["fails", () => Promise.reject(clerkError(500, "oops"))],
    ])(
      "is not vouched for when the last read %s, and nothing more is tried",
      async (_label, last) => {
        seeUser(clerkUser(), withLateSignIns());
        users.getUser.mockImplementationOnce(last);

        await expect(
          changeClerkUserEmail("user_ana", NEW),
        ).resolves.toMatchObject({
          status: "changed",
          oldAddressesRemoved: false,
        });

        // One pass, not a loop.
        expect(calls).toEqual(["create", "delete", "unlink", "delete"]);
        expect(users.getUser).toHaveBeenCalledTimes(3);
        expectNoAddressLogged();
      },
    );

    it("reports the account as gone when the last read answers 404", async () => {
      seeUser(clerkUser(), withLateSignIns());
      users.getUser.mockRejectedValueOnce(
        clerkError(404, "resource_not_found"),
      );

      await expect(changeClerkUserEmail("user_ana", NEW)).resolves.toEqual({
        status: "not_found",
      });
    });
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

  describe("with a deadline", () => {
    const withGoogle = () =>
      clerkUser({
        externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
      });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Each call of `mock` takes `ms` of the clock. */
    function takes(mock: typeof users.getUser, name: string, ms: number) {
      mock.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + ms);
        calls.push(name);
        return {};
      });
    }

    it("writes nothing once it has passed before the primary moved", async () => {
      users.getUser.mockResolvedValue(withGoogle());
      // The reads used the time up.
      users.getUserList.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 1_000);
        return { data: [], totalCount: 0 };
      });

      await expect(
        changeClerkUserEmail("user_ana", NEW, { deadline: Date.now() + 1_000 }),
      ).resolves.toEqual({ status: "request_failed", detail: "deadline" });

      expect(calls).toEqual([]);
      expectNoAddressLogged();
    });

    it("stops removing once it has passed after the primary moved", async () => {
      users.getUser.mockResolvedValue(
        clerkUser({
          emailAddresses: [
            address("idn_old", OLD),
            address("idn_older", "otra@example.com"),
          ],
          externalAccounts: [google(OLD, { id: "idn_g", eac: "eac_g" })],
        }),
      );
      takes(users.deleteUserExternalAccount, "unlink", 1_000);

      await expect(
        changeClerkUserEmail("user_ana", NEW, { deadline: Date.now() + 1_000 }),
      ).resolves.toEqual({
        status: "changed",
        // What was done before it is still reported.
        unlinkedProviders: ["oauth_google"],
        oldAddressesRemoved: false,
        passwordEnabled: true,
        googleOnNewAddress: false,
      });

      // A newer attempt may own the account now: not one more write, and no
      // read to wait for either.
      expect(calls).toEqual(["create", "unlink"]);
      expect(users.getUser).toHaveBeenCalledTimes(1);
      expectNoAddressLogged();
    });

    it("stops the extra pass too", async () => {
      seeUser(
        clerkUser(),
        settledUser({
          emailAddresses: [
            address("idn_new", NEW),
            address("idn_late", "tarde@example.com"),
            address("idn_later", "mas-tarde@example.com"),
          ],
        }),
      );
      emailAddresses.deleteEmailAddress
        .mockImplementationOnce(trackedCall("delete"))
        .mockImplementationOnce(async () => {
          vi.setSystemTime(Date.now() + 1_000);
          calls.push("delete");
          return {};
        });

      await expect(
        changeClerkUserEmail("user_ana", NEW, { deadline: Date.now() + 1_000 }),
      ).resolves.toMatchObject({
        status: "changed",
        oldAddressesRemoved: false,
      });

      expect(deletedIds()).toEqual(["idn_old", "idn_late"]);
      expect(users.getUser).toHaveBeenCalledTimes(2);
    });

    it("finishes as usual while there is time left", async () => {
      seeUser(withGoogle());

      await expect(
        changeClerkUserEmail("user_ana", NEW, { deadline: Date.now() + 1_000 }),
      ).resolves.toMatchObject({
        status: "changed",
        oldAddressesRemoved: true,
      });
      expect(calls).toEqual(["create", "unlink", "delete"]);
    });

    it("leaves a settled account alone whatever the time", async () => {
      users.getUser.mockResolvedValue(settledUser());

      await expect(
        changeClerkUserEmail("user_ana", NEW, { deadline: Date.now() - 1 }),
      ).resolves.toMatchObject({
        status: "changed",
        oldAddressesRemoved: true,
      });
    });

    it("removes nothing, and says so, when the primary had moved already", async () => {
      // A retry that arrives late: the change itself is done in Clerk.
      users.getUser.mockResolvedValue(
        clerkUser({
          primaryEmailAddressId: "idn_new",
          emailAddresses: [address("idn_old", OLD), address("idn_new", NEW)],
        }),
      );

      await expect(
        changeClerkUserEmail("user_ana", NEW, { deadline: Date.now() - 1 }),
      ).resolves.toMatchObject({
        status: "changed",
        oldAddressesRemoved: false,
      });
      expect(calls).toEqual([]);
    });
  });
});
