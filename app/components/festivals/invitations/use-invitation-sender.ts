"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  InvitationKind,
  InvitationPageFailure,
} from "@/app/lib/festivals/invitation-definitions";
import { sendInvitationBatch } from "@/app/lib/festivals/invitations";

export type InvitationSendState = {
  status: "idle" | "sending" | "done" | "error";
  sent: number;
  failed: number;
  skipped: number;
  failures: InvitationPageFailure[];
  /** Why the run stopped, when it stopped early. */
  message: string | null;
  /** This environment does not send mail; the counts are a dry run. */
  simulated: boolean;
};

type QueuedPage = {
  cursor: number;
  /** One page for a retry of a page Resend refused; the default otherwise. */
  maxPages?: number;
  /** Keep going from where this call stops, to the end of the list. */
  follow: boolean;
};

const IDLE: InvitationSendState = {
  status: "idle",
  sent: 0,
  failed: 0,
  skipped: 0,
  failures: [],
  message: null,
  simulated: false,
};

/**
 * Drives a mailing from the browser, one server call per few hundred
 * recipients, because the whole list does not fit in one function call.
 *
 * The server picks every recipient itself; this only carries the cursor and a
 * run id. Pages that did not go out are kept so the admin can retry exactly
 * those, and the run id makes a retry of a page that did go out a no-op.
 */
export function useInvitationSender(festivalId: number, kind: InvitationKind) {
  const [state, setState] = useState<InvitationSendState>(IDLE);
  const runIdRef = useRef<string | null>(null);
  const sending = state.status === "sending";

  // Leaving the page stops the run: warn before that happens.
  useEffect(() => {
    if (!sending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

  const run = useCallback(
    async (pages: QueuedPage[], initial: InvitationSendState) => {
      const runId = runIdRef.current ?? crypto.randomUUID();
      runIdRef.current = runId;

      let current: InvitationSendState = { ...initial, status: "sending" };
      setState(current);

      const queue = [...pages];
      while (queue.length > 0) {
        const page = queue.shift()!;
        let result: Awaited<ReturnType<typeof sendInvitationBatch>>;
        try {
          result = await sendInvitationBatch({
            festivalId,
            kind,
            runId,
            cursor: page.cursor,
            maxPages: page.maxPages,
          });
        } catch {
          result = {
            success: false,
            message: "Se perdió la conexión con el servidor.",
          };
        }

        if (!result.success) {
          const message = result.message;
          // Nothing from this page on went out. Each stays retryable from its
          // cursor; a count of 0 marks it as never having reached Resend.
          current = {
            ...current,
            status: "error",
            message,
            failures: [
              ...current.failures,
              ...[page, ...queue].map((pending) => ({
                cursor: pending.cursor,
                count: 0,
                message,
                follow: pending.follow,
              })),
            ],
          };
          setState(current);
          return;
        }

        current = {
          ...current,
          sent: current.sent + result.sent,
          failed: current.failed + result.failed,
          skipped: current.skipped + result.skipped,
          failures: [...current.failures, ...result.failures],
          simulated: current.simulated || result.simulated,
        };
        setState(current);

        if (page.follow && result.nextCursor !== null) {
          queue.push({ cursor: result.nextCursor, follow: true });
        }
      }

      current = { ...current, status: "done" };
      setState(current);
    },
    [festivalId, kind],
  );

  /** Sends to everyone, from the first recipient. */
  const start = useCallback(() => {
    runIdRef.current = null;
    return run([{ cursor: 0, follow: true }], IDLE);
  }, [run]);

  /**
   * Sends again only what did not go out: a page Resend refused is sent again
   * on its own; a call that never completed resumes from its cursor onwards.
   */
  const retryFailures = useCallback(() => {
    const { failures } = state;
    if (failures.length === 0) return Promise.resolve();
    const pages: QueuedPage[] = failures.map((failure) =>
      failure.count === 0
        ? { cursor: failure.cursor, follow: failure.follow ?? true }
        : { cursor: failure.cursor, maxPages: 1, follow: false },
    );
    const failedCount = failures.reduce((sum, f) => sum + f.count, 0);
    return run(pages, {
      ...state,
      failed: state.failed - failedCount,
      failures: [],
      message: null,
    });
  }, [run, state]);

  const reset = useCallback(() => {
    runIdRef.current = null;
    setState(IDLE);
  }, []);

  return { state, start, retryFailures, reset };
}
