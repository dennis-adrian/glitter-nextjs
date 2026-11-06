/**
 * The screens this tab moved through inside the app, newest last, for the
 * installed app's back where the Navigation API is missing (iOS before 26).
 * It cannot read the browser's history, so it follows each change of path:
 * a replace swaps the newest entry, a return to the screen before it is a
 * step back, and anything else is a new screen. Sign-in screens never count
 * as a place to go back to.
 */

const KEY = "glitter:screen-history";
const LIMIT = 50;

const isSignIn = (path: string) => /^\/sign_(in|up)(\/|$)/.test(path);

export function nextHistory(
  history: string[],
  path: string,
  { replace = false }: { replace?: boolean } = {},
): string[] {
  const last = history[history.length - 1];
  if (last === undefined) return [path];
  if (path === last) return history;
  if (isSignIn(last) || isSignIn(path)) return [path];
  if (replace) return [...history.slice(0, -1), path];
  if (history.length >= 2 && history[history.length - 2] === path) {
    return history.slice(0, -1);
  }
  return [...history, path].slice(-LIMIT);
}

/** Whether the newest screen has one of the app's screens behind it. */
export function hasScreenBehind(history: string[]): boolean {
  return history.length >= 2;
}

export function readHistory(): string[] {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeHistory(history: string[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    // Blocked storage only means back goes to the parent instead.
  }
}

/**
 * A document loaded on its own (a cold start, a reload, a full navigation)
 * keeps the history only if it is a reload of the newest screen: anything
 * else may sit anywhere in the browser's history, so back goes to the parent.
 */
export function historyOnLoad(stored: string[], path: string): string[] {
  return stored[stored.length - 1] === path ? stored : [path];
}

let replacing = false;

/** Marks the next change of path as a replace (the bar's own fallback). */
export function markNextAsReplace() {
  replacing = true;
}

/** Reads and clears the replace mark. */
export function takeReplaceMark(): boolean {
  const value = replacing;
  replacing = false;
  return value;
}
