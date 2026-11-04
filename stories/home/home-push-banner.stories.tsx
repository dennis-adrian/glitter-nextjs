import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { fn } from "storybook/test";

import HomePushBanner from "@/app/components/home/home-push-banner";

/**
 * Inicio's nudge to turn notifications on. What it shows follows the browser
 * the story is opened in: a browser that can turn them on gets the button
 * (allow notifications for Storybook to see it), an iPhone outside the
 * installed app gets «Ver cómo», and anything else shows nothing.
 */
const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

const meta = {
  title: "Home/Notifications banner",
  component: HomePushBanner,
  parameters: {
    // Storybook's app-router mock lacks the layout context Next 16.4's
    // `useRouter` reads, so the router is provided here instead.
    nextjs: { appDirectory: false },
  },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <div className="max-w-md">
          <Story />
        </div>
      </AppRouterContext.Provider>
    ),
  ],
  args: {
    // Any well-formed VAPID public key; the story never subscribes.
    publicKey:
      "BLgq3Kb1Gves7HFtbAjQPtfZCKgsumjcLy7Wlc4wfsMnEk58tPLXQKOrIKjn0Vbl5ZbdFPsmDHHbeQCqUZC-ki0",
  },
} satisfies Meta<typeof HomePushBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
