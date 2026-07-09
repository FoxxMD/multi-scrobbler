import React, {type ComponentProps} from 'react';
import { type QueryFunctionContext, useQuery } from '@tanstack/react-query';
import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";

import ky from 'ky';
import { baseUrl } from './utils';
import { TextMuted } from './components/TextMuted';

export const versionApi = createApi({
    reducerPath: 'versionApi',
    baseQuery: fetchBaseQuery({ baseUrl: './api/' }),
    endpoints: (builder) => ({
        getVersion: builder.query<{version: string}, undefined>({
            query: () => `version`,
        }),
    }),
});

const { useGetVersionQuery } = versionApi;

const Version = () => {
    const {
        data = undefined,
    } = useGetVersionQuery(undefined);

    return <span className="break-normal">
                         <span className="text-xs version">{data === undefined ? null : `${data.version}`}</span>
            </span>;
}

export default Version;

export const VersionNext = (props: ComponentProps<typeof TextMuted> = {}) => {

    const { isPending, isError, data, error } = useQuery({
        queryKey: ['version'],
        queryFn: queryFn,
        staleTime: Infinity,
    });

    if (isError) {
        return <TextMuted textStyle="xs" {...props}>error.message</TextMuted>;
    }

    if(!isPending) {
        return <TextMuted textStyle="xs" overflow="clip" {...props}>{data.version}</TextMuted>;
    }

    return null;
    
}

type VersionQueryKey = ['version'];
const queryFn = async (context: QueryFunctionContext<VersionQueryKey>) => {
    return await ky.get(`version`, { baseUrl: baseUrl }).json() as {version: string};
}