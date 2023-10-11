import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/dist/query/react/index";
import {DeadLetterScrobble, JsonPlayObject} from "../../core/Atomic";
import {id} from "common-tags";

type DeadResponse = DeadLetterScrobble<JsonPlayObject, string>[];
export const deadApi = createApi({
    reducerPath: 'deadApi',
    baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
    tagTypes: ['DeadLetters'],
    endpoints: (builder) => ({
        getDead: builder.query<DeadResponse, {name: string, type: string}>({
            query: (params) => `dead?name=${params.name}&type=${params.type}`,
            providesTags: ['DeadLetters']
        }),
        processDeadSingle: builder.mutation<DeadLetterScrobble<JsonPlayObject, string> | undefined, {name: string, type: string, id: string}>({
            query:(params) => ({
                url: `/dead/${params.id}`,
                method: 'PUT',
                params: {
                    name: params.name,
                    type: params.type
                }
            })
        }),
        removeDeadSingle: builder.mutation<DeadLetterScrobble<JsonPlayObject, string> | undefined, {name: string, type: string, id: string}>({
            query:(params) => ({
                url: `/dead/${params.id}`,
                method: 'DELETE',
                params: {
                    name: params.name,
                    type: params.type
                },
                transformResponse: (response, meta, arg) => {
                    if(response === undefined) {
                        return undefined;
                    } else {
                        return response;
                    }
                },
                invalidatesTags: ['DeadLetters']
            }),
        }),
    }),
});

//export const { useGetDeadQuery, useLazyProcessDeadSingleQuery, useLazyRemoveDeadSingleQuery } = deadApi;
export const { useGetDeadQuery, useProcessDeadSingleMutation, useRemoveDeadSingleMutation } = deadApi;
