import { afterEach, describe, expect, it } from "vitest";

import {
  INSTALLED_APP_ATTRIBUTE,
  INSTALLED_APP_SESSION_KEY,
  MARK_INSTALLED_APP_SCRIPT,
  isMarkedInstalledApp,
} from "@/app/lib/installed-app-mode";

function runScript() {
  new Function(MARK_INSTALLED_APP_SCRIPT)();
}

afterEach(() => {
  window.sessionStorage.clear();
  document.documentElement.removeAttribute(INSTALLED_APP_ATTRIBUTE);
  window.history.replaceState(null, "", "/");
});

describe("MARK_INSTALLED_APP_SCRIPT", () => {
  it("marks the window the start page opened, and takes the fragment off", () => {
    window.history.replaceState(null, "", "/portal?tab=1#installed-app");
    runScript();

    expect(document.documentElement.hasAttribute(INSTALLED_APP_ATTRIBUTE)).toBe(
      true,
    );
    expect(window.sessionStorage.getItem(INSTALLED_APP_SESSION_KEY)).toBe("1");
    expect(window.location.pathname + window.location.search).toBe(
      "/portal?tab=1",
    );
    expect(window.location.hash).toBe("");
  });

  it("keeps the mark on the window's later pages", () => {
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "1");
    window.history.replaceState(null, "", "/merch");
    runScript();

    expect(document.documentElement.hasAttribute(INSTALLED_APP_ATTRIBUTE)).toBe(
      true,
    );
  });

  it("leaves a browser tab unmarked", () => {
    window.history.replaceState(null, "", "/portal#otra-cosa");
    runScript();

    expect(document.documentElement.hasAttribute(INSTALLED_APP_ATTRIBUTE)).toBe(
      false,
    );
    expect(window.location.hash).toBe("#otra-cosa");
    expect(isMarkedInstalledApp(window)).toBe(false);
  });

  it("is what isMarkedInstalledApp reads", () => {
    window.history.replaceState(null, "", "/sign_in#installed-app");
    runScript();

    expect(isMarkedInstalledApp(window)).toBe(true);
  });
});
