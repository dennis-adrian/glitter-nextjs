import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sourceFiles, tuteoHits } from "@/app/lib/voseo-scan";

/**
 * The participant and visitor screens already swept to voseo, server messages
 * included. The email templates have their own test in app/emails. Add a
 * folder here once its copy is in voseo, so it stays that way.
 */
const SCREEN_DIRS = [
  "app/(routes)/festivals/[id]/event_day_registration",
  "app/(routes)/festivals/[id]/registration",
  "app/(routes)/my_profile",
  "app/(routes)/visitors",
  "app/components/events/registration",
  "app/components/festivals/registration",
  "app/components/user_profile",
  "app/components/visitors",
  "app/lib/visitors",
];

function screenFiles(): string[] {
  return SCREEN_DIRS.flatMap((dir) =>
    sourceFiles(path.join(process.cwd(), dir)).map((file) => `${dir}/${file}`),
  );
}

describe("participant and visitor screens", () => {
  it("keep their copy in voseo", () => {
    const offenders = screenFiles().flatMap((file) =>
      tuteoHits(readFileSync(path.join(process.cwd(), file), "utf8")).map(
        (hit) => `${file}: ${hit}`,
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("catches the tuteo these screens used to have", () => {
    expect(tuteoHits("¿No eres Ana?")).toEqual(["eres"]);
    expect(tuteoHits("¿Buscas tus entradas?")).toEqual(["Buscas"]);
    expect(tuteoHits("El enlace venció. Pide uno nuevo.")).toEqual(["Pide"]);
    expect(tuteoHits("Espera unos minutos")).toEqual(["Espera"]);
    expect(
      tuteoHits("¿No sos Ana? ¿Buscás tus entradas? Pedí uno nuevo."),
    ).toEqual([]);
  });

  it("finds the files it is meant to scan", () => {
    // Guards the guard: a moved directory would otherwise pass vacuously.
    for (const dir of SCREEN_DIRS) {
      expect(existsSync(path.join(process.cwd(), dir)), dir).toBe(true);
    }
    const files = screenFiles();
    expect(files).toContain("app/(routes)/visitors/tickets/page.tsx");
    expect(files).toContain(
      "app/components/events/registration/visitor-tickets.tsx",
    );
    expect(files).toContain("app/lib/visitors/registration-actions.ts");
    expect(files).not.toContain(
      "app/lib/visitors/registration-actions.integration.test.ts",
    );
  });
});
