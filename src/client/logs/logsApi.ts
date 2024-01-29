import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {LogInfoJson, LogOutputConfig} from "../../core/Atomic";

export const logsApi = createApi({
    reducerPath: 'logsApi',
    baseQuery: fetchBaseQuery({ baseUrl: './api/' }),
    endpoints: (builder) => ({
        getLogs: builder.query<{ data: LogInfoJson[], settings: LogOutputConfig }, undefined>({
            query: () => `logs`,
        }),
        setLogSettings: builder.query<{ data: LogInfoJson[], settings: LogOutputConfig }, object>({
            query: (settings) => ({
                url: '/logs',
                method: 'PUT',
                body: settings
            })
        }),
    }),
});

export const { useGetLogsQuery, useLazySetLogSettingsQuery } = logsApi;
