"use client";

import { useEffect, useState } from "react";

import type {
  SaveComunicadoDraftActionResult,
  SaveComunicadoDraftFailureCode,
} from "@/app/lib/comunicados/actions";
import {
  COMUNICADO_AUTOSAVE_DEBOUNCE_MS,
  type ComunicadoDraftInput,
} from "@/app/lib/comunicados/definitions";

/**
 * The composer's autosave (docs/IMPLEMENTATION-comunicados.md G4, E1): a
 * debounce after the last change, one save in flight at a time with the
 * latest fields queued behind it, and the `version` compare-and-set: each
 * save sends the version it last saw and adopts the one the server returns.
 *
 * A refusal that waiting cannot fix (another tab saved, the comunicado left
 * the draft state or is gone) stops it for good; a failed request retries
 * with a growing pause.
 */

export type DraftFields = Omit<
  ComunicadoDraftInput,
  "comunicadoId" | "expectedVersion"
>;

export type SaveDraft = (
  input: ComunicadoDraftInput,
) => Promise<SaveComunicadoDraftActionResult>;

type BlockingCode = Exclude<SaveComunicadoDraftFailureCode, "FAILED">;

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
  | { kind: "blocked"; code: BlockingCode; message: string };

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
  private blocked: { code: BlockingCode; message: string } | null = null;
  private contentError: string | null = null;
  private paused = 0;
  private listener: ((snapshot: AutosaveSnapshot) => void) | null = null;

  constructor(private readonly options: ControllerOptions) {
    this.latest = options.baseline;
    this.saved = options.baseline;
    this.version = options.version;
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
    this.emit();
  }

  private run() {
    this.clearTimer();
    if (this.paused > 0 || this.blocked || this.invalid) return;
    // The latest fields go when the save in flight is answered.
    if (this.inFlight) return;
    if (this.latest === this.saved) {
      this.emit();
      return;
    }
    this.clearRetry();
    const sent = this.latest;
    const fields = JSON.parse(sent) as DraftFields;
    const request = this.options
      .save({
        ...fields,
        comunicadoId: this.options.comunicadoId,
        expectedVersion: this.version,
      })
      .catch((error: unknown): SaveComunicadoDraftActionResult => {
        console.error("Error autosaving a comunicado draft", error);
        return { success: false, code: "FAILED", message: FAILED_MESSAGE };
      })
      .then((result) => this.settle(sent, result));
    this.inFlight = request;
    void request.finally(() => {
      this.inFlight = null;
      // Changes made meanwhile whose debounce already ran wait for nothing.
      if (
        this.latest !== this.saved &&
        this.timer === null &&
        this.retryTimer === null
      ) {
        this.run();
      }
      this.emit();
    });
    this.emit();
  }

  private settle(sent: string, result: SaveComunicadoDraftActionResult) {
    if (result.success) {
      this.version = result.version;
      this.saved = sent;
      this.contentError = result.contentError;
      this.failed = false;
      this.attempt = 0;
      return;
    }
    switch (result.code) {
      case "FAILED":
        this.failed = true;
        this.attempt += 1;
        this.clearRetry();
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.run();
        }, retryDelayMs(this.attempt));
        return;
      case "INVALID":
        this.failed = false;
        this.invalid = result.message;
        return;
      default:
        this.failed = false;
        this.blocked = { code: result.code, message: result.message };
        this.clearTimer();
        this.clearRetry();
    }
  }

  /**
   * Saves what is on screen now, without waiting for the debounce: before a
   * test send, on blur and when the tab is hidden. Resolves once it is stored
   * or cannot be.
   */
  async flush(): Promise<FlushResult> {
    this.clearTimer();
    // Two rounds at most: the one in flight, then the latest fields.
    for (let round = 0; round < 3; round += 1) {
      if (this.inFlight) await this.inFlight;
      if (this.blocked) return { ok: false, message: this.blocked.message };
      if (this.invalid) return { ok: false, message: this.invalid };
      if (this.latest === this.saved) break;
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
      if (this.paused === 0 && this.latest !== this.saved) this.run();
    };
  }
}

/**
 * `DraftAutosave` for a component: hand it the fields on screen on every
 * render; it saves them when they change.
 */
export function useDraftAutosave({
  comunicadoId,
  initialVersion,
  fields,
  save,
  debounceMs = COMUNICADO_AUTOSAVE_DEBOUNCE_MS,
}: {
  comunicadoId: number;
  initialVersion: number;
  fields: DraftFields;
  save: SaveDraft;
  debounceMs?: number;
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

  useEffect(() => controller.listen(setSnapshot), [controller]);

  useEffect(() => {
    controller.update(serialized);
  }, [controller, serialized]);

  return { ...snapshot, controller };
}
