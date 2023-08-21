import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {LogInfoJson, LogOutputConfig} from "../../core/Atomic";

export const logsApi = createApi({
    reducerPath: 'logsApi',
    baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
    endpoints: (builder) => ({
        getLogs: builder.query<{ data: LogInfoJson[], settings: LogOutputConfig }, undefined>({
            query: () => `logs`,
        }),
        setLevel: builder.query<{ data: LogInfoJson[], settings: LogOutputConfig }, string>({
            query: (level) => ({
                url: '/logs',
                method: 'PUT',
                body: {level}
            })
        }),
    }),
});

export const { useGetLogsQuery, useLazySetLevelQuery } = logsApi;
