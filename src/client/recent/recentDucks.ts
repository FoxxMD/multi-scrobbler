import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/dist/query/react/index";
import {JsonPlayObject} from "../../core/Atomic";

type RecentResponse = (JsonPlayObject & { index: number })[];
export const recentApi = createApi({
    reducerPath: 'recentApi',
    baseQuery: fetchBaseQuery({ baseUrl: './api/' }),
    endpoints: (builder) => ({
        getRecent: builder.query<RecentResponse, {name: string, type: string}>({
            query: (params) => `recent?name=${params.name}&type=${params.type}`,
            transformResponse: (response: RecentResponse, meta, arg) => {
                return response.map((x, index) => ({...x, index: index + 1}))
            }
        }),
    }),
});

export const { useGetRecentQuery } = recentApi;
