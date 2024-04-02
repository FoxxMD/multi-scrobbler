import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {LeveledLogData, LogOutputConfig} from "../../core/Atomic";

export const logsApi = createApi({
    reducerPath: 'logsApi',
    baseQuery: fetchBaseQuery({ baseUrl: './api/' }),
    endpoints: (builder) => ({
        getLogs: builder.query<{ data: LeveledLogData[], settings: LogOutputConfig }, undefined>({
            query: () => `logs`,
        }),
        setLogSettings: builder.query<{ data: LeveledLogData[], settings: LogOutputConfig }, object>({
            query: (settings) => ({
                url: '/logs',
                method: 'PUT',
                body: settings
            })
        }),
    }),
});

export const { useGetLogsQuery, useLazySetLogSettingsQuery } = logsApi;
