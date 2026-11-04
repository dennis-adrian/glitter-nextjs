import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // "Entrar como participante" (docs/PLAN-impersonation.md): an admin can
  // view the app as a participant, and every "current user" lookup has to
  // answer with the participant then. Only the viewer module reads Clerk's
  // session, so a new lookup cannot bypass it by asking Clerk directly.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.integration.test.ts", "e2e/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@clerk/nextjs/server",
              importNames: ["auth", "currentUser", "getAuth"],
              message:
                "Use getCurrentUserProfile, getViewerClerkId or isSignedIn (app/lib/impersonation/viewer.ts): while an admin views the app as a participant, the viewer is the participant.",
            },
            {
              name: "@/db/write-guard",
              importNames: ["allowImpersonationWrites"],
              message:
                "Only app/lib/impersonation may let a write through during a view (its own bookkeeping).",
            },
            {
              name: "@/app/lib/impersonation/housekeeping",
              importNames: ["allowHousekeepingWrite"],
              message:
                "Only for idempotent inserts of global default rows that a page needs to render; add a commented exemption explaining why this write belongs to nobody.",
            },
            {
              name: "@/app/lib/users/queries",
              importNames: ["getCurrentClerkUser", "getCurrentClerkUserDetails"],
              message:
                "This is the signed-in Clerk account, not the viewer. Use getCurrentUserProfile or getViewerClerkId; isSignedIn to ask whether anyone is signed in.",
            },
          ],
          // The same modules reached by a relative path.
          patterns: [
            {
              // Only users/queries exports it, so any "queries" will do.
              group: ["**/queries", "./queries"],
              importNames: ["getCurrentClerkUser", "getCurrentClerkUserDetails"],
              message:
                "This is the signed-in Clerk account, not the viewer. Use getCurrentUserProfile or getViewerClerkId.",
            },
            {
              group: ["**/write-guard", "!@/db/write-guard"],
              importNames: ["allowImpersonationWrites"],
              message:
                "Only app/lib/impersonation may let a write through during a view.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
