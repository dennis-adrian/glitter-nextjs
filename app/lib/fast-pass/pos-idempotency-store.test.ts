// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPosIdempotencyKey,
  getPosIdempotencyKey,
  persistPosIdempotencyKey,
  subscribeToPosIdempotencyKey,
  withPosIdempotencyLock,
} from "@/app/lib/fast-pass/pos-idempotency-store";

const STORAGE_KEY = "fast-pass-pos-pending-42";

describe("FastPass POS idempotency store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("notifies the current tab when the persisted key changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPosIdempotencyKey(STORAGE_KEY, listener);

    persistPosIdempotencyKey(STORAGE_KEY, "claimed-key");

    expect(getPosIdempotencyKey(STORAGE_KEY)).toBe("claimed-key");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("notifies subscribers when localStorage is cleared", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPosIdempotencyKey(STORAGE_KEY, listener);

    window.dispatchEvent(new StorageEvent("storage", { key: null }));

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("does not clear a newer claim", () => {
    persistPosIdempotencyKey(STORAGE_KEY, "new-key");

    clearPosIdempotencyKey(STORAGE_KEY, "old-key");

    expect(getPosIdempotencyKey(STORAGE_KEY)).toBe("new-key");
  });

  it("falls back to memory when localStorage persistence fails", () => {
    const storageKey = `${STORAGE_KEY}-quota`;
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });

    expect(() =>
      persistPosIdempotencyKey(storageKey, "fallback-key"),
    ).not.toThrow();
    expect(getPosIdempotencyKey(storageKey)).toBe("fallback-key");

    setItem.mockRestore();
    clearPosIdempotencyKey(storageKey, "fallback-key");
    expect(getPosIdempotencyKey(storageKey)).toBeNull();
  });

  it("clears safely when localStorage access is blocked", () => {
    const storageKey = `${STORAGE_KEY}-blocked`;
    persistPosIdempotencyKey(storageKey, "blocked-key");
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });
    const removeItem = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });

    expect(() =>
      clearPosIdempotencyKey(storageKey, "blocked-key"),
    ).not.toThrow();

    getItem.mockRestore();
    removeItem.mockRestore();
    expect(getPosIdempotencyKey(storageKey)).toBeNull();
  });

  it("runs claims through the storage-key Web Lock", async () => {
    const request = vi.fn(async (_name: string, task: () => Promise<string>) =>
      task(),
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });

    await expect(
      withPosIdempotencyLock(STORAGE_KEY, async () => "locked"),
    ).resolves.toBe("locked");
    expect(request).toHaveBeenCalledWith(
      `fast-pass-pos-idempotency:${STORAGE_KEY}`,
      expect.any(Function),
    );
  });

  it("serializes same-tab tasks when navigator.locks is unavailable", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });

    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withPosIdempotencyLock(STORAGE_KEY, async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
      return "first";
    });
    const second = withPosIdempotencyLock(STORAGE_KEY, async () => {
      order.push("second");
      return "second";
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    releaseFirst();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("keeps the fallback chain usable after a rejected task", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });

    await expect(
      withPosIdempotencyLock(STORAGE_KEY, async () => {
        throw new Error("claim failed");
      }),
    ).rejects.toThrow("claim failed");

    await expect(
      withPosIdempotencyLock(STORAGE_KEY, async () => "recovered"),
    ).resolves.toBe("recovered");
  });
});
