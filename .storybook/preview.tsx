import type { Preview } from "@storybook/nextjs-vite";
import { Toaster } from "sonner";
import { sb } from "storybook/test";
import { figtree, gabarito } from "../app/ui/fonts";

import "../app/globals.css";

sb.mock("../app/lib/festival_activites/actions.ts");
sb.mock("../app/lib/festival_activites/admin-actions.ts");

const preview: Preview = {
  decorators: [
    (Story) => (
      <div
        className={`${figtree.variable} ${gabarito.variable} min-h-screen bg-background p-6 font-sans text-foreground`}
      >
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
        order: ["Uploads", ["Inventory", "Reusable Components"]],
      },
    },
  },
};

export default preview;
