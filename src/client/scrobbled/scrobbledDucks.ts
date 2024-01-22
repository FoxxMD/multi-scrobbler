import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/dist/query/react/index";
import {JsonPlayObject} from "../../core/Atomic";

type ScrobbledResponse = (JsonPlayObject & { index: number })[];
export const scrobbledApi = createApi({
    reducerPath: 'scrobbledApi',
    baseQuery: fetchBaseQuery({ baseUrl: './api/' }),
    endpoints: (builder) => ({
        getRecent: builder.query<ScrobbledResponse, {name: string, type: string}>({
            query: (params) => `scrobbled?name=${params.name}&type=${params.type}`,
            transformResponse: (response: ScrobbledResponse, meta, arg) => {
                return response.map((x, index) => ({...x, index: index + 1}))
            }
        }),
    }),
});

export const { useGetRecentQuery } = scrobbledApi;
