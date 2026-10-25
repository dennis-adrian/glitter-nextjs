"use client";

import { useEffect, useRef, useState } from "react";

import { retryDelayMs } from "@/app/components/comunicados/admin/composer/use-autosave";

/**
 * A server answer that follows what is on screen: the request goes a moment
 * after the input stops changing, and an answer that arrives after a newer
 * one is dropped, so a slow count for the previous audience never replaces
 * the count for this one. Until the answer for the current input arrives,
 * the last one stays, marked `stale`, so numbers do not blink.
 *
 * A failed answer is asked again for the same input, with the autosave's
 * growing pause, until one arrives; `retry` asks again at once.
 */
export function useLiveResult<I, R>({
  input,
  load,
  delayMs,
  failedWhen,
}: {
  /** Null: nothing to ask; `result` is null too. */
  input: I | null;
  /** Must not depend on render: the latest one is called. */
  load: (input: I) => Promise<R>;
  delayMs: number;
  /**
   * An answer that is a failure worth asking again, as the server's own
   * "try again". It stays as `result`, so its message can show. Must not
   * depend on render, as `load`.
   */
  failedWhen?: (result: R) => boolean;
}): {
  result: R | null;
  stale: boolean;
  failed: boolean;
  retry: () => void;
} {
  const key = input === null ? null : JSON.stringify(input);
  const [answer, setAnswer] = useState<{
    key: string;
    /** The ask it answers, so a retry on its way is not scheduled twice. */
    round: number;
    result: R | null;
    failed: boolean;
    /** Failures in a row for this input. */
    failures: number;
  } | null>(null);
  // Asks again for the same input; another input starts from round 0.
  const [retried, setRetried] = useState<{ key: string; round: number }>({
    key: "",
    round: 0,
  });
  const round = retried.key === key ? retried.round : 0;
  const loadRef = useRef(load);
  const failedWhenRef = useRef(failedWhen);
  const issuedRef = useRef(0);
  const appliedRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    loadRef.current = load;
    failedWhenRef.current = failedWhen;
  });

  useEffect(() => {
    if (key === null) return;
    // The first question goes at once: the screen opens with its numbers. A
    // retry is for an input that already settled.
    const delay = firstRef.current || round > 0 ? 0 : delayMs;
    const timer = setTimeout(() => {
      firstRef.current = false;
      issuedRef.current += 1;
      const sequence = issuedRef.current;
      const apply = (result: R | null, failed: boolean) => {
        if (sequence <= appliedRef.current) return;
        appliedRef.current = sequence;
        setAnswer((current) => ({
          key,
          round,
          result,
          failed,
          failures: !failed
            ? 0
            : current?.key === key && current.failed
              ? current.failures + 1
              : 1,
        }));
      };
      loadRef.current(JSON.parse(key) as I).then(
        (result) => apply(result, failedWhenRef.current?.(result) ?? false),
        (error: unknown) => {
          console.error("Error loading a composer preview", error);
          apply(null, true);
        },
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [key, delayMs, round]);

  // The latest ask for this input failed: ask again after a pause.
  const failures =
    answer?.key === key && answer.round === round && answer.failed
      ? answer.failures
      : 0;
  useEffect(() => {
    if (key === null || failures === 0) return;
    const timer = setTimeout(
      () => setRetried({ key, round: round + 1 }),
      retryDelayMs(failures),
    );
    return () => clearTimeout(timer);
  }, [key, round, failures]);

  const retry = () => {
    if (key !== null) setRetried({ key, round: round + 1 });
  };

  if (key === null) {
    return { result: null, stale: false, failed: false, retry };
  }
  return {
    result: answer?.result ?? null,
    stale: answer?.key !== key,
    failed: answer?.key === key && answer.failed,
    retry,
  };
}
