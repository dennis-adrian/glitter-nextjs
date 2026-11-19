import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";

import ParticipationHistoryTrigger from "@/app/components/participations/admin/participation-history-trigger";
import { fetchParticipationHistoryAction } from "@/app/lib/participations/admin-history-actions";

const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

/**
 * The participants table's "Participaciones" count. Two festivals, although
 * one of them had two reservations: each festival counts once.
 */
const meta = {
  title: "Admin/Participation history trigger",
  component: ParticipationHistoryTrigger,
  parameters: { nextjs: { appDirectory: false } },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <Story />
      </AppRouterContext.Provider>
    ),
  ],
  args: {
    userId: 1,
    userName: "Mafe Ilustraciones",
    count: 2,
  },
} satisfies Meta<typeof ParticipationHistoryTrigger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

/** Loads the history when it opens and groups it by festival. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    mocked(fetchParticipationHistoryAction).mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /historial de participaciones/ }),
    );
    const body = within(document.body);
    await body.findByText("Glitter Vol 8");
    await expect(fetchParticipationHistoryAction).toHaveBeenCalledWith({
      userId: 1,
    });
    await expect(
      body.getByText(
        "2 participaciones · Se listan 2 festivales y 3 reservas, incluidas las canceladas y rechazadas.",
      ),
    ).toBeInTheDocument();
    await expect(
      body.getByText("2 reservas en este festival"),
    ).toBeInTheDocument();
    // Read-only: moving a reservation happens on the profile page.
    await expect(
      body.queryByRole("button", { name: /Transferir/ }),
    ).not.toBeInTheDocument();
    await expect(
      body.getByRole("link", { name: "Ver perfil completo" }),
    ).toHaveAttribute("href", "/dashboard/users/1");
  },
};

export const LoadFails: Story = {
  play: async ({ canvasElement }) => {
    mocked(fetchParticipationHistoryAction).mockResolvedValueOnce(null);
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /historial de participaciones/ }),
    );
    const body = within(document.body);
    await body.findByText("No pudimos cargar el historial.");
    await expect(
      body.getByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
  },
};

/** Closing hands focus back to the count, so a keyboard user keeps their row. */
export const FocusReturnsOnClose: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: /historial de participaciones/,
    });
    await userEvent.click(trigger);
    await within(document.body).findByText("Glitter Vol 8");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** An account with no name falls back to its email, which must wrap. */
export const EmailOnlyName: Story = {
  args: {
    userName: "mariafernanda.quispe.mamani.ilustraciones@example.com",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /historial de participaciones/ }),
    );
    await within(document.body).findByText("Glitter Vol 8");
  },
};
