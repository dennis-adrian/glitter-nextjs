import { AsyncLocalStorage, AsyncResource } from "node:async_hooks";

import {
  IMPERSONATION_READ_ONLY_MESSAGE,
  IMPERSONATION_TOKEN_COOKIE,
} from "@/app/lib/impersonation/definitions";
import { classifyStatement } from "@/db/statement-kind";

/**
 * The read-only guard of "Entrar como participante" (docs/PLAN-impersonation.md
 * §6.1): while a global admin views the app as a participant, no statement
 * that can change data reaches the database. Reads pass untouched.
 *
 * `db/index.ts` installs it on the one pool every query goes through. This
 * module is loaded by scripts too (migrate, seed), so it imports nothing
 * server-only: the viewer module is loaded only once a request is seen to
 * carry a view cookie, which no script ever does.
 */

/** What a refused write throws. Its message is safe to show as is. */
export class ImpersonationReadOnlyError extends Error {
  readonly code = "IMPERSONATION_READ_ONLY";
  constructor() {
    super(IMPERSONATION_READ_ONLY_MESSAGE);
    this.name = "ImpersonationReadOnlyError";
  }
}

export function isImpersonationReadOnlyError(
  error: unknown,
): error is ImpersonationReadOnlyError {
  return (
    error instanceof ImpersonationReadOnlyError ||
    (error as { code?: unknown } | null)?.code === "IMPERSONATION_READ_ONLY"
  );
}

/**
 * One scope for the whole process. Turbopack compiles this module once per
 * server layer (see `db/index.ts`), and the pool, shared through
 * `globalThis`, is guarded by whichever copy created it: a scope private to
 * each copy would let one copy's `allowImpersonationWrites` go unseen by the
 * other copy's guard.
 */
const globalForGuard = globalThis as typeof globalThis & {
  __glitterAllowedWrites?: AsyncLocalStorage<true>;
};
const allowed = (globalForGuard.__glitterAllowedWrites ??=
  new AsyncLocalStorage<true>());

/**
 * Runs `fn` with writes let through even during a view: the view's own
 * bookkeeping (ending it, counting a refused write). Only
 * `app/lib/impersonation` may call it; ESLint refuses it anywhere else.
 */
export function allowImpersonationWrites<T>(
  fn: () => PromiseLike<T> | T,
): Promise<T> {
  // Awaited inside the scope: a Drizzle query is a lazy thenable that only
  // runs when awaited, and awaited outside it would run unguarded no more.
  return allowed.run(true, async () => await fn());
}

/**
 * Whether a statement has to be checked at all: a write outside an allowed
 * scope. Synchronous, so reads go through without waiting for anything.
 */
export function needsWriteCheck(text: string): boolean {
  if (allowed.getStore()) return false;
  return classifyStatement(text) === "write";
}

/** Next's own throws (a prerender learning a page is dynamic) pass through. */
async function rethrowNextInternal(error: unknown) {
  const { unstable_rethrow } = await import("next/navigation");
  unstable_rethrow(error);
}

/**
 * Refuses a write, or any other side effect (an email), when this request is
 * a view as someone else, and counts the refusal on the view. The cookie is
 * read first and is enough to let nearly everything through at once: only a
 * request that carries one can be a view. Outside a request (a script, a
 * cron run's own work, an `after` callback of a page) nobody is viewing.
 *
 * Safe to call from modules that scripts load: the viewer is imported only
 * once a view cookie is seen.
 */
export async function refuseDuringView(): Promise<void> {
  let carriesViewCookie: boolean;
  try {
    const { cookies } = await import("next/headers");
    carriesViewCookie = (await cookies()).has(IMPERSONATION_TOKEN_COOKIE);
  } catch (error) {
    await rethrowNextInternal(error);
    return;
  }
  if (!carriesViewCookie) return;

  const viewer = await import("@/app/lib/impersonation/viewer");
  if (!(await viewer.isImpersonating())) return;

  await allowImpersonationWrites(async () => {
    const view = await viewer.getImpersonation().catch(() => null);
    if (!view) return;
    const { recordBlockedImpersonationWrite } =
      await import("@/app/lib/impersonation/queries");
    await recordBlockedImpersonationWrite(view.sessionId);
  }).catch((error) => {
    console.error("Could not count a refused write of a view", error);
  });
  throw new ImpersonationReadOnlyError();
}

type QueryFn = (...args: unknown[]) => unknown;

type GuardableClient = {
  query: QueryFn;
  __glitterWriteGuard?: true;
};

function statementText(first: unknown): string | null {
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "text" in first) {
    const text = (first as { text: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

/**
 * Wraps a client's `query` once. Reads are passed straight through, in the
 * same tick. A write waits for `refuseDuringView`; anything sent on the
 * same client after it waits too, so a write's check never lets a later
 * statement overtake it (statements in a transaction keep their order).
 */
export function guardClient<T extends GuardableClient>(client: T): T {
  if (client.__glitterWriteGuard) return client;
  const original = client.query;
  let pending: Promise<unknown> | null = null;

  const guarded: QueryFn = function (this: unknown, ...args: unknown[]) {
    const first = args[0];
    // A Submittable (cursor, stream) is handed back synchronously by pg.
    if (first && typeof (first as { submit?: unknown }).submit === "function") {
      return original.apply(this, args);
    }
    const text = statementText(first);
    const check = text !== null && needsWriteCheck(text);
    if (!check && !pending) return original.apply(this, args);

    const last = args[args.length - 1];
    const callback =
      typeof last === "function"
        ? (last as (error: unknown, result?: unknown) => void)
        : null;
    const before = pending ?? Promise.resolve();
    const gate = check ? before.then(() => refuseDuringView()) : before;
    const settled = gate.then(
      () => undefined,
      () => undefined,
    );
    pending = settled;
    void settled.then(() => {
      if (pending === settled) pending = null;
    });

    if (callback) {
      gate.then(
        () => original.apply(this, args),
        (error) => callback(error),
      );
      return undefined;
    }
    return gate.then(() => original.apply(this, args));
  };

  client.query = guarded;
  client.__glitterWriteGuard = true;
  return client;
}

type GuardablePool = {
  connect: (...args: unknown[]) => unknown;
  __glitterWriteGuard?: true;
};

/**
 * Guards every client the pool hands out, by promise or by callback.
 * `pool.query` checks a client out through `connect` too, so it is covered.
 */
export function installWriteGuard<T extends GuardablePool>(pool: T): T {
  if (pool.__glitterWriteGuard) return pool;
  const connect = pool.connect;

  pool.connect = function (this: unknown, ...args: unknown[]) {
    const callback = args[0];
    if (typeof callback === "function") {
      // Bound to the caller's async context. When the pool is busy, pg-pool
      // queues the callback and runs it from whichever request releases a
      // client next, in that request's context: the statement would be
      // checked against the wrong request, and a write the view's own
      // bookkeeping let through would be refused.
      return connect.call(
        this,
        AsyncResource.bind(
          (
            error: unknown,
            client: GuardableClient | undefined,
            done: unknown,
          ) => {
            if (client) guardClient(client);
            (callback as (...a: unknown[]) => void)(error, client, done);
          },
        ),
      );
    }
    return (connect.call(this) as Promise<GuardableClient>).then(guardClient);
  };
  pool.__glitterWriteGuard = true;
  return pool;
}
