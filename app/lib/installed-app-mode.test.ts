import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INSTALLED_APP_ATTRIBUTE,
  INSTALLED_APP_SESSION_KEY,
  MARK_INSTALLED_APP_SCRIPT,
  installedAppMark,
  isMarkedInstalledApp,
} from "@/app/lib/installed-app-mode";

function displayMode(standalone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
    })),
  );
}

function runScript() {
  new Function(MARK_INSTALLED_APP_SCRIPT)();
}

function marked() {
  return document.documentElement.hasAttribute(INSTALLED_APP_ATTRIBUTE);
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute(INSTALLED_APP_ATTRIBUTE);
  window.history.replaceState(null, "", "/");
});

describe("MARK_INSTALLED_APP_SCRIPT", () => {
  it("marks a window the start page opened in browser mode, and takes the fragment off", () => {
    displayMode(false);
    window.history.replaceState(null, "", "/portal?tab=1#installed-app");
    runScript();

    expect(marked()).toBe(true);
    expect(window.sessionStorage.getItem(INSTALLED_APP_SESSION_KEY)).toBe(
      "browser",
    );
    expect(window.location.pathname + window.location.search).toBe(
      "/portal?tab=1",
    );
    expect(window.location.hash).toBe("");
    expect(isMarkedInstalledApp(window)).toBe(true);
  });

  it("keeps a browser-mode mark on the window's later pages", () => {
    displayMode(false);
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "browser");
    window.history.replaceState(null, "", "/merch");
    runScript();

    expect(marked()).toBe(true);
  });

  it("remembers a window that opened in standalone mode as such", () => {
    displayMode(true);
    window.history.replaceState(null, "", "/portal#installed-app");
    runScript();

    expect(marked()).toBe(true);
    expect(installedAppMark(window)).toBe("standalone");
  });

  it("drops a standalone mark once the window reports browser mode, as after moving into a tab", () => {
    displayMode(false);
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "standalone");
    window.history.replaceState(null, "", "/merch");
    runScript();

    expect(marked()).toBe(false);
    expect(window.sessionStorage.getItem(INSTALLED_APP_SESSION_KEY)).toBeNull();
  });

  it("marks the page the fragment arrived on even without storage", () => {
    displayMode(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    window.history.replaceState(null, "", "/sign_in#installed-app");
    runScript();
    vi.restoreAllMocks();

    expect(marked()).toBe(true);
    expect(isMarkedInstalledApp(window)).toBe(true);
  });

  it("leaves a browser tab unmarked, and its own anchors alone", () => {
    displayMode(false);
    window.history.replaceState(null, "", "/portal#otra-cosa");
    runScript();

    expect(marked()).toBe(false);
    expect(window.location.hash).toBe("#otra-cosa");
    expect(isMarkedInstalledApp(window)).toBe(false);
  });
});

describe("isMarkedInstalledApp", () => {
  it("ignores what is not a mark, and blocked storage", () => {
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "1");
    expect(isMarkedInstalledApp(window)).toBe(false);
    expect(
      isMarkedInstalledApp({
        sessionStorage: {
          getItem: () => {
            throw new Error("SecurityError");
          },
        },
      }),
    ).toBe(false);
  });
});
