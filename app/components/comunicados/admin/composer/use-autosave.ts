"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type {
  SaveComunicadoDraftActionResult,
  SaveComunicadoDraftFailureCode,
} from "@/app/lib/comunicados/actions";
import {
  COMUNICADO_AUTOSAVE_DEBOUNCE_MS,
  COMUNICADO_DOC_MAX_BYTES,
  type ComunicadoDraftInput,
} from "@/app/lib/comunicados/definitions";

/**
 * The composer's autosave (docs/IMPLEMENTATION-comunicados.md G4, E1): a
 * debounce after the last change, one save in flight at a time with the
 * latest fields queued behind it, and the `version` compare-and-set: each
 * save sends the version it last saw and adopts the one the server returns.
 *
 * A refusal that waiting cannot fix (another tab saved, the comunicado left
 * the draft state or is gone, a new release replaced the actions) stops it
 * for good; a failed request retries with a growing pause.
 */

export type DraftFields = Omit<
  ComunicadoDraftInput,
  "comunicadoId" | "expectedVersion" | "saveKey" | "doc"
> & { doc: unknown[] };

export type SaveDraft = (
  input: ComunicadoDraftInput,
) => Promise<SaveComunicadoDraftActionResult>;

type BlockingCode =
  | Exclude<SaveComunicadoDraftFailureCode, "FAILED">
  /** A new release: the actions this page calls are gone from the server. */
  | "OUTDATED";

type Blocking = { code: BlockingCode; message: string };

export type AutosaveStatus =
  /** Everything on screen is stored (the text may have been refused). */
  | { kind: "saved" }
  /** A change waits for the debounce or is being saved. */
  | { kind: "saving" }
  /** The last attempt failed; another one is scheduled. */
  | { kind: "retrying" }
  /** The server refused what is on screen; the next change tries again. */
  | { kind: "invalid"; message: string }
  /** Saving stopped: reloading is the way out. */
  | ({ kind: "blocked" } & Blocking);

export type AutosaveSnapshot = {
  status: AutosaveStatus;
  /** The text the server refused on the last save; the other fields saved. */
  contentError: string | null;
  /** Something on screen is not stored yet, the refused text included. */
  unsaved: boolean;
};

export type FlushResult = { ok: true } | { ok: false; message: string };

const FAILED_MESSAGE =
  "No se pudo guardar el borrador. Probá de nuevo en unos segundos.";

export const OUTDATED_MESSAGE =
  "Se publicó una nueva versión de Glitter. Recargá la página para seguir editando.";

/** What the server says of a text over `COMUNICADO_DOC_MAX_BYTES`. */
export const DOC_TOO_LONG_MESSAGE =
  "El comunicado es demasiado largo. Acortá el texto.";

/**
 * A text so far over the limit that it is not worth sending: the server
 * would refuse it anyway, after a request that size. The server measures
 * UTF-8 bytes; a UTF-16 length past twice the limit is past it for sure.
 */
export function isDocFarTooLong(doc: unknown[]) {
  return JSON.stringify(doc).length > COMUNICADO_DOC_MAX_BYTES * 2;
}

/** 2 s, 4 s, 8 s, 16 s, then every 30 s. */
export function retryDelayMs(attempt: number) {
  return Math.min(30_000, 1_000 * 2 ** Math.max(1, attempt));
}

type ControllerOptions = {
  comunicadoId: number;
  version: number;
  /** The fields as stored when the composer opened, serialized. */
  baseline: string;
  save: SaveDraft;
  debounceMs: number;
};

/** One save: the fields it sent, serialized, and its key. */
type Attempt = { sent: string; key: string };

/**
 * Unanswered saves kept to ask about. The first is the likely one: an answer
 * is lost as the connection drops, and what follows fails before reaching
 * the server. Bounded, so a long time offline costs few requests.
 */
const MAX_UNANSWERED = 5;

type AttemptResult =
  | SaveComunicadoDraftActionResult
  | { success: false; code: "OUTDATED"; message: string };

/**
 * The autosave's state machine, outside React so its timers and the one
 * request in flight survive re-renders.
 */
export class DraftAutosave {
  private latest: string;
  private saved: string;
  private version: number;
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private failed = false;
  private invalid: string | null = null;
  private blocked: Blocking | null = null;
  private contentError: string | null = null;
  private paused = 0;
  private listener: ((snapshot: AutosaveSnapshot) => void) | null = null;
  /**
   * Saves sent at this version whose answer never came. One of them may be
   * stored all the same; sent again with its key, the server says so.
   */
  private unanswered: Attempt[] = [];
  /** One of them, asked about after another save read as stale. */
  private asking: { attempt: Attempt; stale: Blocking } | null = null;
  private storedOnce = false;

  constructor(private readonly options: ControllerOptions) {
    this.latest = options.baseline;
    this.saved = options.baseline;
    this.version = options.version;
  }

  /** At least one save was stored since the composer opened. */
  get hasSaved() {
    return this.storedOnce;
  }

  listen(listener: (snapshot: AutosaveSnapshot) => void) {
    this.listener = listener;
    listener(this.snapshot());
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  snapshot(): AutosaveSnapshot {
    return {
      status: this.status(),
      contentError: this.contentError,
      unsaved:
        this.blocked === null &&
        (this.latest !== this.saved ||
          this.inFlight !== null ||
          this.contentError !== null),
    };
  }

  private status(): AutosaveStatus {
    if (this.blocked) return { kind: "blocked", ...this.blocked };
    if (this.invalid) return { kind: "invalid", message: this.invalid };
    if (this.failed) return { kind: "retrying" };
    if (this.inFlight || this.latest !== this.saved) return { kind: "saving" };
    return { kind: "saved" };
  }

  private emit() {
    this.listener?.(this.snapshot());
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private clearRetry() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Back to what is stored, with nothing in flight: no retry is owed. */
  private settleIdle() {
    if (this.inFlight || this.asking || this.latest !== this.saved) return;
    this.failed = false;
    this.attempt = 0;
    this.clearRetry();
  }

  /** The fields on screen changed: save them a moment after the last change. */
  update(serialized: string) {
    if (serialized === this.latest) return;
    this.latest = serialized;
    this.clearTimer();
    if (this.blocked) return;
    // A change is a new attempt: what the server refused may be fixed now.
    this.invalid = null;
    if (this.latest !== this.saved && this.paused === 0) {
      this.timer = setTimeout(() => this.run(), this.options.debounceMs);
    }
    this.settleIdle();
    this.emit();
  }

  private run() {
    this.clearTimer();
    if (this.paused > 0 || this.blocked) return;
    // The latest fields go when the save in flight is answered.
    if (this.inFlight) return;
    const asking = this.asking?.attempt ?? null;
    if (!asking) {
      if (this.invalid) return;
      if (this.latest === this.saved) {
        this.settleIdle();
        this.emit();
        return;
      }
    }
    this.clearRetry();
    const sent = asking?.sent ?? this.latest;
    // The same fields at the same version are the same save, retried.
    const key =
      asking?.key ??
      this.unanswered.find((attempt) => attempt.sent === sent)?.key ??
      crypto.randomUUID();
    const { doc, ...fields } = JSON.parse(sent) as DraftFields;
    // Left out, the stored text stays and every other field still saves.
    const docLeftOut = isDocFarTooLong(doc);
    const request = this.options
      .save({
        ...fields,
        ...(docLeftOut ? {} : { doc }),
        saveKey: key,
        comunicadoId: this.options.comunicadoId,
        expectedVersion: this.version,
      })
      .catch((error: unknown): AttemptResult => {
        // A release replaced the actions: no retry reaches them again.
        if (unstable_isUnrecognizedActionError(error)) {
          return {
            success: false,
            code: "OUTDATED",
            message: OUTDATED_MESSAGE,
          };
        }
        console.error("Error autosaving a comunicado draft", error);
        return { success: false, code: "FAILED", message: FAILED_MESSAGE };
      })
      .then((result) => this.settle({ sent, key }, result, docLeftOut));
    this.inFlight = request;
    void request.finally(() => {
      this.inFlight = null;
      // Changes made meanwhile whose debounce already ran wait for nothing.
      if (
        this.asking ||
        (this.latest !== this.saved &&
          this.timer === null &&
          this.retryTimer === null)
      ) {
        this.run();
      }
      this.settleIdle();
      this.emit();
    });
    this.emit();
  }

  private settle(attempt: Attempt, result: AttemptResult, docLeftOut: boolean) {
    const asked = this.asking;
    this.asking = null;
    if (result.success) {
      this.version = result.version;
      this.saved = attempt.sent;
      // The server never saw the text, so it is the one to say it.
      this.contentError = docLeftOut
        ? DOC_TOO_LONG_MESSAGE
        : result.contentError;
      this.failed = false;
      this.attempt = 0;
      // The version moved: no save sent at the old one can be stored now.
      this.unanswered = [];
      this.storedOnce = true;
      return;
    }
    if (result.code === "FAILED") {
      // Lost on the way back, it may be stored: its retry has its key.
      if (
        this.unanswered.length < MAX_UNANSWERED &&
        !this.unanswered.some((sent) => sent.key === attempt.key)
      ) {
        this.unanswered.push(attempt);
      }
      this.failed = true;
      this.attempt += 1;
      this.clearRetry();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.run();
      }, retryDelayMs(this.attempt));
      return;
    }
    // An answer: this save was not stored.
    this.unanswered = this.unanswered.filter(
      (sent) => sent.key !== attempt.key,
    );
    this.failed = false;
    this.attempt = 0;
    if (asked && (result.code === "STALE" || result.code === "INVALID")) {
      // Not the save that moved the version either.
      this.stale(asked.stale);
      return;
    }
    switch (result.code) {
      case "INVALID":
        // About fields already replaced: the newer ones go next.
        if (attempt.sent === this.latest) this.invalid = result.message;
        return;
      case "STALE":
        this.stale({ code: result.code, message: result.message });
        return;
      default:
        this.block({ code: result.code, message: result.message });
    }
  }

  /**
   * Another version is stored. It may be one of this tab's saves whose
   * answer was lost: those are asked about first, one at a time, by key.
   */
  private stale(stale: Blocking) {
    const next = this.unanswered[0];
    if (next) {
      this.asking = { attempt: next, stale };
      return;
    }
    this.block(stale);
  }

  private block(blocking: Blocking) {
    this.failed = false;
    this.blocked = blocking;
    this.clearTimer();
    this.clearRetry();
  }

  /**
   * Saves what is on screen now, without waiting for the debounce: before a
   * test send, on blur and when the tab is hidden. Resolves once it is stored
   * or cannot be.
   */
  async flush(): Promise<FlushResult> {
    this.clearTimer();
    // The one in flight, the unanswered saves a stale answer asks about,
    // then the latest fields.
    for (let round = 0; round < MAX_UNANSWERED + 3; round += 1) {
      if (this.inFlight) await this.inFlight;
      if (this.blocked) return { ok: false, message: this.blocked.message };
      if (this.invalid) return { ok: false, message: this.invalid };
      if (this.latest === this.saved && !this.asking) break;
      if (this.paused > 0) return { ok: false, message: FAILED_MESSAGE };
      this.clearRetry();
      this.run();
      if (this.inFlight) await this.inFlight;
      if (this.failed) return { ok: false, message: FAILED_MESSAGE };
    }
    if (this.latest !== this.saved) {
      return { ok: false, message: FAILED_MESSAGE };
    }
    if (this.contentError) return { ok: false, message: this.contentError };
    return { ok: true };
  }

  /**
   * Stops saving and waits for the save in flight, as discarding needs: no
   * save may reach a draft being deleted. Resolves with a resume function.
   */
  async pause(): Promise<() => void> {
    this.paused += 1;
    this.clearTimer();
    this.clearRetry();
    if (this.inFlight) await this.inFlight;
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      this.paused -= 1;
      if (this.paused === 0 && (this.asking || this.latest !== this.saved)) {
        this.run();
      }
    };
  }
}

/**
 * `DraftAutosave` for a component: hand it the fields on screen on every
 * render; it saves them when they change.
 *
 * `onLeave` runs when the component unmounts after a save was stored, once
 * what was on screen is saved too. The router keeps the pages it rendered
 * for Back and Forward: the composer with the fields and the version it
 * opened with, the list with the titles it had. Refreshing there drops them.
 */
export function useDraftAutosave({
  comunicadoId,
  initialVersion,
  fields,
  save,
  debounceMs = COMUNICADO_AUTOSAVE_DEBOUNCE_MS,
  onLeave,
}: {
  comunicadoId: number;
  initialVersion: number;
  fields: DraftFields;
  save: SaveDraft;
  debounceMs?: number;
  onLeave?: () => void;
}) {
  const serialized = JSON.stringify(fields);
  // Made once: the fields at first render are what is stored.
  const [controller] = useState(
    () =>
      new DraftAutosave({
        comunicadoId,
        version: initialVersion,
        baseline: serialized,
        save,
        debounceMs,
      }),
  );
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>(() =>
    controller.snapshot(),
  );
  const leaveRef = useRef(onLeave);

  useEffect(() => {
    leaveRef.current = onLeave;
  });

  useEffect(() => controller.listen(setSnapshot), [controller]);

  useEffect(() => {
    controller.update(serialized);
  }, [controller, serialized]);

  useEffect(
    () => () => {
      void controller.flush().then(() => {
        if (controller.hasSaved) leaveRef.current?.();
      });
    },
    [controller],
  );

  return { ...snapshot, controller };
}
