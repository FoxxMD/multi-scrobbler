import preview from "../../.storybook/preview.js";

import { AppHeader } from "../client/components/AppHeader.js";
import {Provider} from "../client/components/Provider";

const meta = preview.meta({
  title: 'Example/Header',
  component: AppHeader,
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
    render: function Render(args) {
       return (<AppHeader/>) 
      },
  decorators: [
      (Story) => (<Provider><Story/></Provider>),
    ]
});

export const LoggedIn = meta.story({
  args: {
    user: {
      name: 'Jane Doe',
    },
  },
});

export const LoggedOut = meta.story();
