import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";

export const scrobblerApi = createApi({
    reducerPath: 'scrobblerApi',
    baseQuery: fetchBaseQuery({baseUrl: '/api/'}),
    endpoints: (builder) => ({
        startClient: builder.mutation<undefined, {
            name: string,
            force?: boolean
        }>({
            query: (params) => ({
                url: '/client/init',
                method: 'POST',
                params: {
                    name: params.name,
                    force: params.force
                }
            })
        }),
        listenClient: builder.mutation<undefined, {
            name: string,
            type: string,
            listening?: boolean
        }>({
            query: (params) => ({
                url: '/client/listen',
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

export const {useStartClientMutation, useListenClientMutation} = scrobblerApi;
