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
              importNames: ["auth", "currentUser"],
              message:
                "Use getCurrentUserProfile, getViewerClerkId or isSignedIn (app/lib/impersonation/viewer.ts): while an admin views the app as a participant, the viewer is the participant.",
            },
            {
              name: "@/app/lib/users/queries",
              importNames: ["getCurrentClerkUser"],
              message:
                "This is the signed-in Clerk account, not the viewer. Use getCurrentUserProfile or getViewerClerkId; isSignedIn to ask whether anyone is signed in.",
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
