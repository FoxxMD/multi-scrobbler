import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/dist/query/react";

export const sourceApi = createApi({
    reducerPath: 'sourceApi',
    baseQuery: fetchBaseQuery({baseUrl: '/api/'}),
    endpoints: (builder) => ({
        startSource: builder.mutation<undefined, {
            name: string,
            type: string,
            force?: boolean
        }>({
            query: (params) => ({
                url: '/source/init',
                method: 'POST',
                params: {
                    name: params.name,
                    type: params.type,
                    force: params.force
                }
            })
        }),
        listenSource: builder.mutation<undefined, {
            name: string,
            type: string,
            listening?: boolean
        }>({
            query: (params) => ({
                url: '/source/listen',
                method: 'POST',
                params: {
                    name: params.name,
                    type: params.type,
                    listening: params.listening
                }
            })
        })
    })
});

export const {useStartSourceMutation, useListenSourceMutation} = sourceApi;
