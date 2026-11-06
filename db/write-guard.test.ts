import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, isImpersonatingMock, getImpersonationMock, recordMock } =
  vi.hoisted(() => ({
    cookiesMock: vi.fn(),
    isImpersonatingMock: vi.fn(),
    getImpersonationMock: vi.fn(),
    recordMock: vi.fn(),
  }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if ((error as { digest?: string } | null)?.digest === "NEXT_INTERNAL") {
      throw error;
    }
  },
}));
vi.mock("@/app/lib/impersonation/viewer", () => ({
  isImpersonating: isImpersonatingMock,
  getImpersonation: getImpersonationMock,
}));
vi.mock("@/app/lib/impersonation/queries", () => ({
  recordBlockedImpersonationWrite: recordMock,
}));

import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/app/lib/impersonation/definitions";
import {
  allowImpersonationWrites,
  refuseDuringView,
  guardClient,
  installWriteGuard,
  isImpersonationReadOnlyError,
} from "@/db/write-guard";

function inRequest({ viewCookie }: { viewCookie: boolean }) {
  cookiesMock.mockResolvedValue({
    has: (name: string) => viewCookie && name === "glitter_view_as",
  });
}

function viewing(on: boolean) {
  inRequest({ viewCookie: true });
  isImpersonatingMock.mockResolvedValue(on);
  getImpersonationMock.mockResolvedValue(on ? { sessionId: 41 } : null);
}

/** A client that records what reached the database, in order. */
function fakeClient() {
  const sent: string[] = [];
  const client = {
    query: vi.fn(function (
      this: unknown,
      first: string | { text: string },
      ...rest: unknown[]
    ) {
      const text = typeof first === "string" ? first : first.text;
      sent.push(text);
      const last = rest[rest.length - 1];
      if (typeof last === "function") {
        (last as (e: unknown, r: unknown) => void)(null, { rows: [] });
        return undefined;
      }
      return Promise.resolve({ rows: [] });
    }),
  };
  const raw = client.query;
  return { client: guardClient(client), sent, raw };
}

beforeEach(() => {
  cookiesMock.mockReset();
  isImpersonatingMock.mockReset();
  getImpersonationMock.mockReset();
  recordMock.mockReset();
});

describe("refuseDuringView", () => {
  it("lets a write through outside a request", async () => {
    cookiesMock.mockRejectedValue(new Error("outside a request scope"));
    await expect(refuseDuringView()).resolves.toBeUndefined();
    expect(isImpersonatingMock).not.toHaveBeenCalled();
  });

  it("lets a write through without a view cookie, asking nothing else", async () => {
    inRequest({ viewCookie: false });
    await expect(refuseDuringView()).resolves.toBeUndefined();
    expect(isImpersonatingMock).not.toHaveBeenCalled();
  });

  it("lets the admin's own write through when the cookie opens no view", async () => {
    viewing(false);
    await expect(refuseDuringView()).resolves.toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("refuses a write during a view, and counts it", async () => {
    viewing(true);
    const error = await refuseDuringView().catch((e: unknown) => e);
    expect(isImpersonationReadOnlyError(error)).toBe(true);
    expect((error as Error).message).toBe(IMPERSONATION_READ_ONLY_MESSAGE);
    // Counted after the refusal, without holding it up.
    await vi.waitFor(() => expect(recordMock).toHaveBeenCalledWith(41));
  });

  it("still refuses when the refusal cannot be counted", async () => {
    viewing(true);
    recordMock.mockRejectedValue(new Error("database down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(refuseDuringView()).rejects.toThrow(
      IMPERSONATION_READ_ONLY_MESSAGE,
    );
    errorLog.mockRestore();
  });

  it("refuses when the view cannot be told apart (fails closed)", async () => {
    inRequest({ viewCookie: true });
    isImpersonatingMock.mockResolvedValue(true);
    getImpersonationMock.mockRejectedValue(new Error("database down"));
    await expect(refuseDuringView()).rejects.toThrow(
      IMPERSONATION_READ_ONLY_MESSAGE,
    );
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("hands Next's own throws back to Next", async () => {
    const internal = Object.assign(new Error("dynamic"), {
      digest: "NEXT_INTERNAL",
    });
    cookiesMock.mockRejectedValue(internal);
    await expect(refuseDuringView()).rejects.toBe(internal);
  });
});

describe("isImpersonationReadOnlyError", () => {
  it("sees the refusal through Drizzle's wrapper", async () => {
    viewing(true);
    const refusal = await refuseDuringView().catch((e: unknown) => e);
    const wrapped = Object.assign(new Error("Failed query: delete"), {
      cause: refusal,
    });
    expect(isImpersonationReadOnlyError(wrapped)).toBe(true);
    expect(isImpersonationReadOnlyError(new Error("other"))).toBe(false);
    expect(isImpersonationReadOnlyError(null)).toBe(false);
  });

  it("refuses at once, without waiting for the refusal to be counted", async () => {
    viewing(true);
    let settle!: () => void;
    recordMock.mockReturnValue(new Promise<void>((r) => (settle = r)));
    await expect(refuseDuringView()).rejects.toMatchObject({
      code: "IMPERSONATION_READ_ONLY",
    });
    settle();
  });
});

describe("guardClient", () => {
  it("passes a read through in the same tick", () => {
    viewing(true);
    const { client, sent } = fakeClient();
    const result = client.query('select * from "users"');
    expect(sent).toEqual(['select * from "users"']);
    expect(result).toBeInstanceOf(Promise);
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it("refuses a write during a view without sending it", async () => {
    viewing(true);
    const { client, sent } = fakeClient();
    await expect(
      client.query('insert into "carts" ("user_id") values ($1)', [7]),
    ).rejects.toThrow(IMPERSONATION_READ_ONLY_MESSAGE);
    expect(sent).toEqual([]);
  });

  it("checks the text of a query config object", async () => {
    viewing(true);
    const { client, sent } = fakeClient();
    await expect(
      client.query({ text: 'delete from "carts"', values: [] }),
    ).rejects.toThrow(IMPERSONATION_READ_ONLY_MESSAGE);
    expect(sent).toEqual([]);
  });

  it("sends a write once it is allowed", async () => {
    viewing(false);
    const { client, sent } = fakeClient();
    await client.query('update "users" set "bio" = $1', ["hola"]);
    expect(sent).toEqual(['update "users" set "bio" = $1']);
  });

  it("answers a callback with the refusal", async () => {
    viewing(true);
    const { client, sent } = fakeClient();
    const error = await new Promise((resolve) =>
      client.query('delete from "carts"', [], (e: unknown) => resolve(e)),
    );
    expect(isImpersonationReadOnlyError(error)).toBe(true);
    expect(sent).toEqual([]);
  });

  it("keeps statements in order when a write is being checked", async () => {
    viewing(false);
    const { client, sent } = fakeClient();
    await Promise.all([
      client.query("begin"),
      client.query('insert into "events" ("kind") values ($1)', ["a"]),
      client.query('select * from "events"'),
      client.query("commit"),
    ]);
    expect(sent).toEqual([
      "begin",
      'insert into "events" ("kind") values ($1)',
      'select * from "events"',
      "commit",
    ]);
  });

  it("lets the statements after a refused write run (a rollback)", async () => {
    viewing(true);
    const { client, sent } = fakeClient();
    const write = client.query('insert into "events" default values');
    const rollback = client.query("rollback");
    await expect(write).rejects.toThrow(IMPERSONATION_READ_ONLY_MESSAGE);
    await rollback;
    expect(sent).toEqual(["rollback"]);
  });

  it("lets the view's own bookkeeping write", async () => {
    viewing(true);
    const { client, sent } = fakeClient();
    await allowImpersonationWrites(() =>
      Promise.resolve(
        client.query('update "impersonation_sessions" set "ended_at" = now()'),
      ),
    );
    expect(sent).toEqual([
      'update "impersonation_sessions" set "ended_at" = now()',
    ]);
  });

  it("does not let the allowed scope leak to work started outside it", async () => {
    viewing(true);
    const { client } = fakeClient();
    await allowImpersonationWrites(async () => {});
    await expect(client.query('delete from "carts"')).rejects.toThrow(
      IMPERSONATION_READ_ONLY_MESSAGE,
    );
  });

  it("passes a Submittable straight through", () => {
    viewing(true);
    const { client, raw } = fakeClient();
    const cursor = { submit: vi.fn(), text: "delete from carts" };
    client.query(cursor as never);
    expect(raw).toHaveBeenCalledWith(cursor);
  });

  it("wraps a client once", () => {
    const { client } = fakeClient();
    const query = client.query;
    expect(guardClient(client).query).toBe(query);
  });
});

describe("installWriteGuard", () => {
  it("guards clients handed out by promise and by callback", async () => {
    viewing(true);
    // Bare clients: the pool has to add the guard itself.
    const clients = [{ sent: [] as string[] }, { sent: [] as string[] }];
    let next = 0;
    const handOut = () => {
      const { sent } = clients[next++]!;
      const client = {
        query: vi.fn((text: string) => {
          sent.push(text);
          return Promise.resolve({ rows: [] });
        }),
      };
      return client;
    };
    const pool = {
      connect: vi.fn(function (cb?: (...a: unknown[]) => void) {
        const client = handOut();
        if (cb) {
          cb(null, client, () => {});
          return undefined;
        }
        return Promise.resolve(client);
      }),
    };
    installWriteGuard(pool);

    const viaPromise = (await pool.connect()) as {
      query: (t: string) => Promise<unknown>;
    };
    await expect(viaPromise.query('delete from "carts"')).rejects.toThrow(
      IMPERSONATION_READ_ONLY_MESSAGE,
    );

    const viaCallback = await new Promise<{
      query: (t: string) => Promise<unknown>;
    }>((resolve) =>
      pool.connect((_: unknown, client: never) => resolve(client)),
    );
    await expect(viaCallback.query('delete from "carts"')).rejects.toThrow(
      IMPERSONATION_READ_ONLY_MESSAGE,
    );
    expect(clients.every(({ sent }) => sent.length === 0)).toBe(true);
  });
});

describe("two copies of the module, as Turbopack compiles one per server layer", () => {
  it("share one allowed scope: one copy's bookkeeping passes the other's guard", async () => {
    viewing(true);
    vi.resetModules();
    const copyA = await import("@/db/write-guard");
    vi.resetModules();
    const copyB = await import("@/db/write-guard");
    expect(copyA).not.toBe(copyB);

    const sent: string[] = [];
    const client = copyB.guardClient({
      query: (text: string) => {
        sent.push(text);
        return Promise.resolve({ rows: [] });
      },
    });
    await copyA.allowImpersonationWrites(() =>
      client.query('update "impersonation_sessions" set "ended_at" = now()'),
    );
    expect(sent).toEqual([
      'update "impersonation_sessions" set "ended_at" = now()',
    ]);
    await expect(client.query('delete from "carts"')).rejects.toMatchObject({
      code: "IMPERSONATION_READ_ONLY",
    });
  });
});

describe("countRefusal", () => {
  it("counts on the view this request is in, without failing the caller", async () => {
    viewing(true);
    const { countRefusal } = await import("@/db/write-guard");
    await expect(countRefusal()).resolves.toBeUndefined();
    await vi.waitFor(() => expect(recordMock).toHaveBeenCalledWith(41));
  });

  it("counts nothing outside a view, and never throws", async () => {
    viewing(false);
    const { countRefusal } = await import("@/db/write-guard");
    getImpersonationMock.mockRejectedValue(new Error("database down"));
    await expect(countRefusal()).resolves.toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });
});
