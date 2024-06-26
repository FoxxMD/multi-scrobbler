import React from 'react';
import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/dist/query/react/index";

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

    return <span className="px-4 break-normal">
                        Multi Scrobbler <span className="ml-2 text-xs version">{data === undefined ? null : `${data.version}`}</span>
            </span>;
}

export default Version;
