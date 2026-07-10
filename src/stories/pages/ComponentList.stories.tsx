import preview from "../../../.storybook/preview.js";
import React from 'react';

import { Container } from '@chakra-ui/react';
import { MSComponentList } from "../../client/components/msComponent/MSComponentList.js";
import {Provider} from "../../client/components/Provider.js";
import { generateClientApiJson, generateSourceApiJson, generateSourcePlayerJson } from "../../core/tests/utils/apiFixtures.js";
import { generateArray } from "../../core/DataUtils.js";
import { faker } from "@faker-js/faker";
import type {MsSseEvent} from "../../core/Api.js";
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import { sseProviderOptions } from "../../client/AppNext.js";
import { withRouter, reactRouterParameters } from 'storybook-addon-remix-react-router';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Pages/Components List',
  component: MSComponentList,
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
  // args: {
  //    data: generatePlayApiCommonDetailed(),
  // },
  // argTypes: {
  //   componentType: {
  //     control: { type: 'select' },
  //     options: ['source', 'client'],
  //   }
  // },
  render: function Render(args) {
     return (<MSComponentList {...args} />) 
    },
decorators: [
    withRouter,
    (Story) => (<Provider><Container maxWidth="8xl"><SSEProvider<MsSseEvent> options={sseProviderOptions}><Story/></SSEProvider></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Simple = meta.story({
    args: {
      components: [generateSourceApiJson(), generateClientApiJson()]
    }
});

export const Many = meta.story({
    args: {
      components: [...generateArray(7, () => generateSourceApiJson()),...generateArray(4, () => generateClientApiJson())]
    }
});

export const WithSourcePlayers = meta.story({
    args: {
      components: [...generateArray(3, () => {
        if(faker.datatype.boolean()) {
          return generateSourceApiJson({players: {test: generateSourcePlayerJson(undefined, {art: true})}});
        }
        return generateSourceApiJson();
      }),...generateArray(3, () => generateClientApiJson())]
    }
});