import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecentCheckIn } from "@/app/components/dashboard/programs/checkin/checkin-recent-list";

const OCCURRENCE = 42;
const KEY = `glitter:checkin-recent:${OCCURRENCE}`;

/**
 * The module caches parsed snapshots at module scope, which is the whole point
 * of it — so each test needs its own copy rather than a shared one carrying the
 * previous test's cache.
 */
async function freshStore() {
  vi.resetModules();
  return import("@/app/lib/programs/checkin-recent-storage");
}

function entry(overrides: Partial<RecentCheckIn> = {}): RecentCheckIn {
  return {
    id: 1,
    at: new Date("2026-08-10T19:30:00.000Z"),
    result: {
      outcome: "checked_in",
      attendeeName: "Ana",
      checkedInAt: new Date("2026-08-10T19:30:00.000Z"),
    },
    ...overrides,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("recent check-in storage", () => {
  it("starts empty", async () => {
    const store = await freshStore();

    expect(store.getRecentCheckIns(OCCURRENCE)).toEqual([]);
  });

  it("reads back what it wrote", async () => {
    const store = await freshStore();
    const item = entry();

    store.setRecentCheckIns(OCCURRENCE, [item]);

    expect(store.getRecentCheckIns(OCCURRENCE)).toEqual([item]);
  });

  it("survives a reload", async () => {
    const first = await freshStore();
    first.setRecentCheckIns(OCCURRENCE, [entry()]);

    // A fresh module with the same sessionStorage is what a reload looks like.
    const reloaded = await freshStore();

    expect(reloaded.getRecentCheckIns(OCCURRENCE)).toHaveLength(1);
  });

  /**
   * JSON has no date type. Without coercion these come back as strings and
   * reach the list as something with no `toLocaleString`.
   */
  it("revives dates as Date objects", async () => {
    const first = await freshStore();
    first.setRecentCheckIns(OCCURRENCE, [entry()]);

    const [restored] = (await freshStore()).getRecentCheckIns(OCCURRENCE);

    expect(restored.at).toBeInstanceOf(Date);
    expect(restored.at.toISOString()).toBe("2026-08-10T19:30:00.000Z");
    if (restored.result.outcome !== "checked_in")
      throw new Error("wrong shape");
    expect(restored.result.checkedInAt).toBeInstanceOf(Date);
  });

  /**
   * `useSyncExternalStore` compares snapshots by identity and re-renders
   * forever if a fresh array comes back each time it asks.
   */
  it("returns an identical snapshot until something changes", async () => {
    const store = await freshStore();
    store.setRecentCheckIns(OCCURRENCE, [entry()]);

    expect(store.getRecentCheckIns(OCCURRENCE)).toBe(
      store.getRecentCheckIns(OCCURRENCE),
    );
  });

  it("returns an identical empty snapshot when nothing is stored", async () => {
    const store = await freshStore();

    expect(store.getRecentCheckIns(OCCURRENCE)).toBe(
      store.getRecentCheckIns(OCCURRENCE),
    );
  });

  it("hands back a new snapshot once the list changes", async () => {
    const store = await freshStore();
    const before = store.getRecentCheckIns(OCCURRENCE);

    store.setRecentCheckIns(OCCURRENCE, [entry()]);

    expect(store.getRecentCheckIns(OCCURRENCE)).not.toBe(before);
  });

  it("keeps occurrences apart", async () => {
    const store = await freshStore();
    store.setRecentCheckIns(OCCURRENCE, [entry()]);

    expect(store.getRecentCheckIns(OCCURRENCE + 1)).toEqual([]);
  });

  it("forgets the list when cleared", async () => {
    const store = await freshStore();
    store.setRecentCheckIns(OCCURRENCE, [entry()]);

    store.clearRecentCheckIns(OCCURRENCE);

    expect(store.getRecentCheckIns(OCCURRENCE)).toEqual([]);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("stays cleared across a reload", async () => {
    const first = await freshStore();
    first.setRecentCheckIns(OCCURRENCE, [entry()]);
    first.clearRecentCheckIns(OCCURRENCE);

    expect((await freshStore()).getRecentCheckIns(OCCURRENCE)).toEqual([]);
  });

  it("notifies subscribers when the list changes", async () => {
    const store = await freshStore();
    const listener = vi.fn();
    store.subscribeToRecentCheckIns(listener);

    store.setRecentCheckIns(OCCURRENCE, [entry()]);
    store.clearRecentCheckIns(OCCURRENCE);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", async () => {
    const store = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeToRecentCheckIns(listener);

    unsubscribe();
    store.setRecentCheckIns(OCCURRENCE, [entry()]);

    expect(listener).not.toHaveBeenCalled();
  });

  /**
   * Storage is writable by anything else running on the origin, and by older
   * builds of this page. An operator at a door can act on an empty history but
   * not on a deserialisation error.
   */
  it("discards malformed JSON", async () => {
    window.sessionStorage.setItem(KEY, "{not json");

    expect((await freshStore()).getRecentCheckIns(OCCURRENCE)).toEqual([]);
  });

  it("discards a list whose entries do not match the shape", async () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify([{ id: 1, at: "2026-08-10T19:30:00.000Z" }]),
    );

    expect((await freshStore()).getRecentCheckIns(OCCURRENCE)).toEqual([]);
  });

  it("discards an unrecognised outcome", async () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify([
        {
          id: 1,
          at: "2026-08-10T19:30:00.000Z",
          result: { outcome: "invented_outcome" },
        },
      ]),
    );

    expect((await freshStore()).getRecentCheckIns(OCCURRENCE)).toEqual([]);
  });

  it("keeps outcomes that carry no extra fields", async () => {
    const store = await freshStore();
    const item = entry({ result: { outcome: "not_found" } });

    store.setRecentCheckIns(OCCURRENCE, [item]);

    expect((await freshStore()).getRecentCheckIns(OCCURRENCE)).toEqual([item]);
  });
});
