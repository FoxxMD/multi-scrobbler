import addonDocs from "@storybook/addon-docs";
import addonA11y from "@storybook/addon-a11y";
import { definePreview } from "@storybook/react-vite";

import { themes } from 'storybook/theming';
import addonMsw from 'msw-storybook-addon';
import { setupWorker } from 'msw/browser';
import { generatePlayDefaults } from '../src/core/tests/utils/PlayTestUtils.js';

// stories render service indicators, so generated plays get random service ids (tests keep the default, no ids)
generatePlayDefaults.serviceIds = true;

export default definePreview({
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

  addons: [
    addonA11y(),
    addonDocs(),
    addonMsw(async () => {
      const worker = setupWorker();
      await worker.start({
        quiet: true,
        // only warn about unmocked API calls, not vite serving source/assets
        onUnhandledRequest(req, print) {
          if (new URL(req.url).pathname.startsWith('/api/')) {
            print.warning();
          }
        }
      });
      return worker;
    }),
  ]
});