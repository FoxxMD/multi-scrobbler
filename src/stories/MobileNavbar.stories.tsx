import preview from "../../.storybook/preview.js";
import React from 'react';

import { Container, Box } from '@chakra-ui/react';
import { MobileSidebarNav } from "../client/components/MobileMenu";
import {Provider} from "../client/components/Provider";
import { withRouter, reactRouterParameters } from 'storybook-addon-remix-react-router';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/MobileSidebar',
  component: MobileSidebarNav,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
    reactRouter: reactRouterParameters({
      location: {
        path: '/'
      },
      routing: {
        path: '/',
        useStoryElement: true
      }
    }),
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
    hideFrom: false
  },
  // argTypes: {
  //   componentType: {
  //     control: { type: 'select' },
  //     options: ['source', 'client'],
  //   }
  // },
  render: function Render(args) {
     //return (<MobileSidebarNav {...args} />) 
     return (<Provider><Container maxWidth="lg"><Box height="500px"><MobileSidebarNav {...args} /></Box></Container></Provider>)
    },
decorators: [
    // (Story) => {
    //   return (<Provider><Container maxWidth="lg"><Box><Story/></Box></Container></Provider>)

    // },
    withRouter,
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const MobileMenu = meta.story({
});