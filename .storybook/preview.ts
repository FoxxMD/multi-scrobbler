import addonDocs from "@storybook/addon-docs";
import addonA11y from "@storybook/addon-a11y";
import { definePreview } from "@storybook/react-vite";

import { themes } from 'storybook/theming';
import { initialize, mswLoader, getWorker } from 'msw-storybook-addon';

// https://github.com/mswjs/msw-storybook-addon/issues/82#issuecomment-3894302575
try {
  getWorker();
} catch (_) {
  initialize();
}

export default definePreview({
  loaders: [mswLoader],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    },
    docs: {
      theme: themes.normal,
    },
  },

  addons: [addonA11y(), addonDocs()]
});