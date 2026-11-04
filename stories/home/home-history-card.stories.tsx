import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { fn } from "storybook/test";

import HomeHistoryCard from "@/app/components/home/home-history-card";
import type { HistorySummary } from "@/app/lib/home/history";

/**
 * Inicio's history card. `LongHistory` is the case that overflowed on a
 * phone: a long festival name and many stands.
 */
const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

const LONG_HISTORY: HistorySummary = {
  first: {
    festivalId: 1,
    name: "Glitter Vol 2",
    posterUrl: null,
    startDate: new Date("2024-03-16T12:00:00Z"),
    standLabel: "G1",
  },
  last: {
    festivalId: 15,
    name: "Festicker 4ta Edición - Halloween",
    posterUrl: null,
    startDate: new Date("2026-10-10T12:00:00Z"),
    standLabel: "A5",
  },
  festivalCount: 15,
  streak: 15,
  stands: [
    "G1",
    "G2",
    "A41",
    "A9",
    "A10",
    "A14",
    "A13",
    "A8",
    "A7",
    "A6",
    "A5",
  ],
  partners: [],
};

const meta = {
  title: "Home/History card",
  component: HomeHistoryCard,
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
  args: { summary: LONG_HISTORY, wide: true },
} satisfies Meta<typeof HomeHistoryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LongHistory: Story = {};

export const OneFestival: Story = {
  args: {
    summary: {
      ...LONG_HISTORY,
      last: null,
      festivalCount: 1,
      streak: null,
      stands: ["A5"],
    },
  },
};
