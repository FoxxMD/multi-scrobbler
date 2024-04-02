import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/dist/query/react";

export const scrobblerApi = createApi({
    reducerPath: 'scrobblerApi',
    baseQuery: fetchBaseQuery({baseUrl: '/api/'}),
    endpoints: (builder) => ({
        startClient: builder.mutation<undefined, {
            name: string
        }>({
            query: (params) => ({
                url: '/client/init',
                method: 'POST',
                params: {
                    name: params.name
                }
            })
        })
    })
});

export const {useStartClientMutation} = scrobblerApi;
