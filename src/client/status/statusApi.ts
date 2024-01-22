import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {ClientStatusData, SourceStatusData} from "../../core/Atomic";

export const statusApi = createApi({
    reducerPath: 'statusApi',
    baseQuery: fetchBaseQuery({ baseUrl: './api/' }),
    endpoints: (builder) => ({
        getStatus: builder.query<{ sources: SourceStatusData[], clients: ClientStatusData[] }, undefined>({
            query: () => `status`,
        }),
    }),
});

export const { useGetStatusQuery } = statusApi;
