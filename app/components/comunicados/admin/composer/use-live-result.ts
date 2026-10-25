"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A server answer that follows what is on screen: the request goes a moment
 * after the input stops changing, and an answer that arrives after a newer
 * one is dropped, so a slow count for the previous audience never replaces
 * the count for this one. Until the answer for the current input arrives,
 * the last one stays, marked `stale`, so numbers do not blink.
 */
export function useLiveResult<I, R>({
  input,
  load,
  delayMs,
}: {
  /** Null: nothing to ask; `result` is null too. */
  input: I | null;
  /** Must not depend on render: the latest one is called. */
  load: (input: I) => Promise<R>;
  delayMs: number;
}): { result: R | null; stale: boolean; failed: boolean } {
  const key = input === null ? null : JSON.stringify(input);
  const [answer, setAnswer] = useState<{
    key: string;
    result: R | null;
    failed: boolean;
  } | null>(null);
  const loadRef = useRef(load);
  const issuedRef = useRef(0);
  const appliedRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null) return;
    // The first question goes at once: the screen opens with its numbers.
    const delay = firstRef.current ? 0 : delayMs;
    const timer = setTimeout(() => {
      firstRef.current = false;
      issuedRef.current += 1;
      const sequence = issuedRef.current;
      const apply = (result: R | null, failed: boolean) => {
        if (sequence <= appliedRef.current) return;
        appliedRef.current = sequence;
        setAnswer({ key, result, failed });
      };
      loadRef.current(JSON.parse(key) as I).then(
        (result) => apply(result, false),
        (error: unknown) => {
          console.error("Error loading a composer preview", error);
          apply(null, true);
        },
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [key, delayMs]);

  if (key === null) return { result: null, stale: false, failed: false };
  return {
    result: answer?.result ?? null,
    stale: answer?.key !== key,
    failed: answer?.key === key && answer.failed,
  };
}
