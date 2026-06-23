import preview from "../../.storybook/preview.js";
import React from 'react';

import { Container, Box } from '@chakra-ui/react';
import { SideNavItems, NAV_LINKS } from "../client/components/SideNav";
import {Provider} from "../client/components/Provider";
import { generateClientApiJson, generateSourceApiJson, generateSourcePlayerJson } from "../core/tests/utils/apiFixtures.js";
import { withRouter, reactRouterParameters } from 'storybook-addon-remix-react-router';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/NavbarItems',
  component: SideNavItems,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
     items: NAV_LINKS,
  },
  render: function Render(args) {
     return (<SideNavItems {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container maxWidth="lg"><Box display="flex" flexDir="column" gap="6" flex="1"><Story/></Box></Container></Provider>),
    withRouter
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const SideNav = meta.story({
});