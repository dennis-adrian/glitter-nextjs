import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadthingMock = path.resolve(dirname, "./mocks/uploadthing.tsx");
const serverActionsMock = path.resolve(dirname, "./mocks/server-actions.ts");
nextEnv.loadEnvConfig(process.cwd());

const storybookEnvDefaults = {
  CLERK_SECRET_KEY: "sk_test_storybook",
  POSTGRES_URL: "postgres://storybook:storybook@localhost/storybook",
  RESEND_API_KEY: "re_storybook",
  UPLOADTHING_TOKEN: "storybook",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_storybook",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/",
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/",
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_storybook",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
} as const;

for (const [key, value] of Object.entries(storybookEnvDefaults)) {
  process.env[key] ??= value;
}

const config: StorybookConfig = {
  stories: [
    "../stories/**/*.stories.@(ts|tsx)",
    "../app/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  viteFinal(viteConfig) {
    viteConfig.resolve ??= {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      "@/app/vendors/uploadthing": uploadthingMock,
      "@/app/lib/uploadthing/actions": serverActionsMock,
      "@/app/lib/orders/actions": serverActionsMock,
      "@/app/lib/products/actions": serverActionsMock,
      "@/app/lib/products/image-actions": serverActionsMock,
      "@/app/lib/participant_products/actions": serverActionsMock,
      "@/app/lib/programs/voucher-actions": serverActionsMock,
    };
    return viteConfig;
  },
};

export default config;
