import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import CredentialsScreen from "@/app/components/festivals/credentials/credentials-screen";
import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import { ScreenBarProvider, usePublishScreenContext } from "@/app/components/navbar/screen-bar";
import {
  DEFAULT_CREDENTIAL_FILTERS,
  parseCredentialFilters,
} from "@/app/lib/credentials/definitions";

import { credentialsSample } from "./credentials-sample";

/**
 * /dashboard/festivals/[id]/credentials (M1–M8) without the app or a
 * database: the four tabs and the print batch dialog, at phone and desktop
 * widths. Saving answers from the mocked actions.
 */

// Storybook's app-router mock lacks the layout context Next 16.4's
// `useRouter` reads (see stories/home/home-history-card.stories.tsx).
const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

const viewer = { role: "admin", status: "verified" } as const;
const PATH = "/dashboard/festivals/11/credentials";

function Navbar() {
  usePublishScreenContext({
    viewer,
    tabs: buildAppNavigation({ viewer }).tabs,
    activeFestival: null,
  });
  return null;
}

const meta = {
  title: "Credentials/Page",
  component: CredentialsScreen,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <PathnameContext.Provider value={PATH}>
          <SearchParamsContext.Provider value={new URLSearchParams()}>
            <ScreenBarProvider>
              <Navbar />
              <div className="-m-6 min-h-screen bg-background">
                <Story />
              </div>
            </ScreenBarProvider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    ),
  ],
  args: {
    festivalId: 11,
    tab: "resumen",
    data: credentialsSample(),
    initialFilters: DEFAULT_CREDENTIAL_FILTERS,
    isAdmin: true,
  },
} satisfies Meta<typeof CredentialsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** M1: confirmed reservations, every other group on, one batch behind. */
export const Resumen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Total a producir")).toBeVisible();
    await expect(canvas.getByText("Última impresión")).toBeVisible();
  },
};

/** M6 with every status counted. */
export const ResumenTodasLasReservas: Story = {
  args: {
    initialFilters: parseCredentialFilters({ estados: "verificacion,pendientes" }),
  },
};

/** The first edition: no batch yet, so no notice and no last-print card. */
export const ResumenSinImpresiones: Story = {
  args: { data: { ...credentialsSample(), batches: [] } },
};

/** M2. */
export const Nombres: Story = { args: { tab: "nombres" } };

/** M3. */
export const Equipo: Story = { args: { tab: "equipo" } };

/** M4. */
export const Reglas: Story = { args: { tab: "reglas" } };

/** M5 (desktop) and M7 (phone): the batch dialog, opened. */
export const MarcarComoEnviadas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Marcar como enviadas a imprenta" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByText(/como enviadas a imprenta$/, { selector: "h2" })).toBeVisible(),
    );
  },
};
