import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import QRCode from "qrcode";
import { fn } from "storybook/test";

import InstallGuide from "@/app/components/install-guide/install-guide";
import InstallGuideIntro from "@/app/components/install-guide/install-guide-intro";

/**
 * `/instalar`. The steps follow the browser the story is opened in: open it
 * on a phone, or with the device toolbar's user agent, to see each one; a
 * computer shows the QR code. Chrome on Android shows the Instalar button
 * once it offers to install.
 */
function InstallGuideScreen(props: React.ComponentProps<typeof InstallGuide>) {
  return (
    <div className="mx-auto max-w-2xl">
      <InstallGuideIntro />
      <InstallGuide {...props} />
    </div>
  );
}

const INSTALL_URL = "https://www.glitter.com.bo/instalar";

const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

const meta = {
  title: "Install guide/Instalar",
  component: InstallGuideScreen,
  parameters: {
    // Storybook's app-router mock lacks the layout context Next 16.4's
    // `useRouter` reads, so the router is provided here instead.
    nextjs: { appDirectory: false },
  },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <Story />
      </AppRouterContext.Provider>
    ),
  ],
  // The page draws the QR code on the server; the story draws it here.
  loaders: [
    async () => ({
      qrSvg: await QRCode.toString(INSTALL_URL, { type: "svg", margin: 1 }),
    }),
  ],
  render: (args, { loaded }) => (
    <InstallGuideScreen {...args} qrSvg={loaded.qrSvg as string} />
  ),
  args: {
    pushAvailable: true,
    signedIn: true,
    publicKey: null,
    devices: [],
    installUrl: INSTALL_URL,
    qrSvg: null,
  },
} satisfies Meta<typeof InstallGuideScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

export const SignedOut: Story = { args: { signedIn: false } };

/** Push flags off for this viewer: the tutorial shows, the control does not. */
export const BeforeNotificationsLaunch: Story = {
  args: { pushAvailable: false },
};
