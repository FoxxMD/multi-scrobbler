import preview from "../../../../.storybook/preview.js";
import React, {useState} from 'react';
import { Container, Stack } from '@chakra-ui/react';

import { fn } from 'storybook/test';
import { ErrorAlert } from "../../../client/components/ErrorAlert.js";
import {Provider} from "../../../client/components/Provider.js";
import { ErrorLike } from "../../../core/Atomic.js";
import { ListFilters, todayRange } from "../../../client/components/playActivity/ListFilters.js";
import { QueryPlaysOptsJson } from "../../../backend/common/database/drizzle/repositories/PlayRepository.js";

const ContainedFilter = (props: any) => {
    const [filters, setFilter] = useState<QueryPlaysOptsJson>({
      playedAt: {
        type: 'between',
        range: todayRange,
        inclusive: true
      }
    });
    return <ListFilters componentType="source" filters={filters} onChange={setFilter}/>
}
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Plays/List Filters/Filters Container',
  component: ContainedFilter,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Container maxWidth="8xl"><Stack width="100%"><Story/></Stack></Container></Provider>),
  ],
args: {
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Filters = meta.story({
});