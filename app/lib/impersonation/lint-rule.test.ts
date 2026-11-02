// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * The lint rule that keeps every "current user" lookup going through the
 * viewer module (docs/PLAN-impersonation.md §5.2). Linted as a file under
 * app/, where the rule applies.
 */

const eslint = new ESLint({ cwd: process.cwd() });

async function restricted(source: string, filePath = "app/lib/users/zz.ts") {
  const [result] = await eslint.lintText(`${source}\nexport const x = 1;\n`, {
    filePath,
  });
  return result!.messages.some((m) => m.ruleId === "no-restricted-imports");
}

describe("the viewer lint rule", () => {
  it.each([
    'import { auth } from "@clerk/nextjs/server";',
    'import { currentUser } from "@clerk/nextjs/server";',
    'import { getAuth } from "@clerk/nextjs/server";',
    'import { getCurrentClerkUser } from "@/app/lib/users/queries";',
    'import { getCurrentClerkUser } from "../users/queries";',
    'import { getCurrentClerkUser } from "./queries";',
    'import { allowImpersonationWrites } from "@/db/write-guard";',
    'import { allowImpersonationWrites } from "../../db/write-guard";',
    'import { allowHousekeepingWrite } from "@/app/lib/impersonation/housekeeping";',
  ])("refuses %s", async (source) => {
    expect(await restricted(source)).toBe(true);
  });

  it.each([
    'import { clerkClient } from "@clerk/nextjs/server";',
    'import { fetchUserProfile } from "@/app/lib/users/queries";',
    'import { getViewerClerkId } from "@/app/lib/impersonation/viewer";',
    'import { isImpersonationReadOnlyError } from "@/db/write-guard";',
  ])("allows %s", async (source) => {
    expect(await restricted(source)).toBe(false);
  });

  it("does not apply to tests, which mock rather than call", async () => {
    expect(
      await restricted(
        'import { auth } from "@clerk/nextjs/server";',
        "app/lib/users/zz.test.ts",
      ),
    ).toBe(false);
  });
}, 60_000);
