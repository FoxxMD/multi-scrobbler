import { defineMain } from "@storybook/react-vite/node";
import { mergeConfig } from "vite";


export default defineMain({
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
//    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
//    "@storybook/addon-onboarding"
  ],
  features: {
    // https://github.com/storybookjs/storybook/discussions/33279
    sidebarOnboardingChecklist: false,
  },
  "framework": "@storybook/react-vite",
    viteFinal: async (config) => {
    return mergeConfig(config, {
      optimizeDeps: {
        include: ["@storybook/addon-docs"],
      },
      plugins: [
        {
          name: "fix-mdx-react-shim",
          enforce: "pre",
          resolveId(source: any) {
            if (
              source.startsWith("file://") &&
              source.includes("mdx-react-shim.js")
            ) {
              // Convert file:///... path to normal filesystem path for Vite
              return new URL(source).pathname;
            }
            return null;
          },
        },
      ],
    });
  },
});