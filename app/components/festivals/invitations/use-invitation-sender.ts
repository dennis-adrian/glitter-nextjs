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

/**
 * One call to make: either "from this cursor on" (follow) or exactly one
 * known page (throughId set), at a given attempt of its idempotency key.
 */
type QueuedPage = {
  cursor: number;
  throughId: number | null;
  attempt: number;
  follow: boolean;
  /** An earlier attempt at this page may have gone out; see retryOf. */
  uncertain: boolean;
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

/** What to call to send a failed page again. */
export function retryOf(failure: InvitationPageFailure): QueuedPage {
  const uncertain = failure.uncertain ?? !failure.refused;
  return {
    cursor: failure.cursor,
    throughId: failure.throughId,
    // Only when no attempt at this page can have gone out does it get a new
    // key. Once one may have, only that key lets Resend deduplicate it.
    attempt: failure.refused && !uncertain ? failure.attempt + 1 : failure.attempt,
    follow: failure.follow ?? false,
    uncertain,
  };
}

/**
 * Drives a mailing from the browser, one server call per few hundred
 * recipients, because the whole list does not fit in one function call.
 *
 * The server picks every recipient itself; this only carries cursors and a
 * run id. Pages that did not go out are kept so the admin can retry exactly
 * those, and their idempotency keys make a retry of a page that did go out a
 * no-op.
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
            throughId: page.throughId,
            attempt: page.attempt,
          });
        } catch {
          result = {
            success: false,
            message: "Se perdió la conexión con el servidor.",
          };
        }

        if (!result.success) {
          const message = result.message;
          // Nothing from this call on is known to have gone out. Each stays
          // retryable exactly as it was queued; a count of 0 marks a call
          // that never reached Resend, so its attempt is not spent.
          current = {
            ...current,
            status: "error",
            message,
            failures: [
              ...current.failures,
              ...[page, ...queue].map((pending) => ({
                cursor: pending.cursor,
                throughId: pending.throughId,
                count: 0,
                message,
                refused: false,
                attempt: pending.attempt,
                follow: pending.follow,
                // The call may have run on the server before failing here.
                uncertain: true,
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
          failures: [
            ...current.failures,
            ...result.failures.map((failure) => ({
              ...failure,
              follow: failure.follow ?? false,
              uncertain: page.uncertain || !failure.refused,
            })),
          ],
          simulated: current.simulated || result.simulated,
        };
        setState(current);

        if (page.follow && result.nextCursor !== null) {
          queue.push({
            cursor: result.nextCursor,
            throughId: null,
            attempt: 0,
            follow: true,
            uncertain: false,
          });
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
    return run(
      [
        {
          cursor: 0,
          throughId: null,
          attempt: 0,
          follow: true,
          uncertain: false,
        },
      ],
      IDLE,
    );
  }, [run]);

  /** Sends again only what did not go out, in the same run. */
  const retryFailures = useCallback(() => {
    const { failures } = state;
    if (failures.length === 0) return Promise.resolve();
    const failedCount = failures.reduce((sum, f) => sum + f.count, 0);
    return run(failures.map(retryOf), {
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
