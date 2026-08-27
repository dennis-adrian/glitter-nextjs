import type { Preview } from "@storybook/nextjs-vite";
import { Toaster } from "sonner";

import "../app/globals.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <Story />
        <Toaster richColors />
      </div>
    ),
  ],
  parameters: {
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "todo",
    },
    options: {
      storySort: {
        order: [
          "Uploads",
          [
            "Inventory",
            "Reusable Components",
            "Primitives",
            "Forms",
            "Workflows",
          ],
        ],
      },
    },
  },
};

export default preview;
