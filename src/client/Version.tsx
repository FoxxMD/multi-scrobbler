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

    return <span className="break-normal">
                         <span className="text-xs version">{data === undefined ? null : `${data.version}`}</span>
            </span>;
}

export default Version;
