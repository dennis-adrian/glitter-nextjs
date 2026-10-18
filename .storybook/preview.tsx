import type { Preview } from "@storybook/nextjs-vite";
import { Toaster } from "sonner";
import { sb } from "storybook/test";
import { figtree, gabarito } from "../app/ui/fonts";

import "../app/globals.css";

sb.mock("../app/lib/festival_activites/actions.ts");
sb.mock("../app/lib/festival_activites/admin-actions.ts");

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Tema claro u oscuro",
      toolbar: {
        title: "Tema",
        icon: "mirror",
        items: [
          { value: "light", title: "Claro", icon: "sun" },
          { value: "dark", title: "Oscuro", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [
    (Story, context) => {
      // The theme tokens resolve on <html>, as next-themes sets them in the
      // app, so the class has to go there rather than on this wrapper.
      const theme = context.globals.theme === "dark" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;

      return (
        <div
          className={`${figtree.variable} ${gabarito.variable} min-h-screen bg-background p-6 font-sans text-foreground`}
        >
          <Story />
          <Toaster richColors theme={theme} />
        </div>
      );
    },
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
