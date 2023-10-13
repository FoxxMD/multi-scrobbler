import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/dist/query/react/index";
import {DeadLetterScrobble, JsonPlayObject} from "../../core/Atomic";
import {id} from "common-tags";
import {createAction, createEntityAdapter, createSlice} from "@reduxjs/toolkit";

type DeadResponse = DeadLetterScrobble<JsonPlayObject, string>[];
export const deadApi = createApi({
    reducerPath: 'deadApi',
    baseQuery: fetchBaseQuery({baseUrl: '/api/'}),
    tagTypes: ['DeadLetters'],
    endpoints: (builder) => ({
        getDead: builder.query<DeadResponse, { name: string, type: string }>({
            query: (params) => `dead?name=${params.name}&type=${params.type}`,
            providesTags: ['DeadLetters']
        }),
        processDeadSingle: builder.mutation<DeadLetterScrobble<JsonPlayObject, string> | undefined, {
            name: string,
            type: string,
            id: string
        }>({
            query: (params) => ({
                url: `/dead/${params.id}`,
                method: 'PUT',
                params: {
                    name: params.name,
                    type: params.type
                }
            })
        }),
        removeDeadSingle: builder.mutation<DeadLetterScrobble<JsonPlayObject, string> | undefined, {
            name: string,
            type: string,
            id: string
        }>({
            query: (params) => ({
                url: `/dead/${params.id}`,
                method: 'DELETE',
                params: {
                    name: params.name,
                    type: params.type
                },
                transformResponse: (response, meta, arg) => {
                    if (response === undefined) {
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

export const deadAdapter = createEntityAdapter<DeadLetterScrobble<JsonPlayObject, string>>({
    selectId: (data) => data.id
});

export const deadSlice = createSlice({
    name: 'deadLetter',
    initialState: deadAdapter.getInitialState(),
    reducers: {
        deadUpdated: deadAdapter.updateOne,
    },
    extraReducers: (builder) => {
        builder.addMatcher(
            (action) => deadApi.endpoints.getDead.matchPending(action),
            (state, action) => {
                state = deadAdapter.getInitialState();
            }
        )
        builder.addMatcher(
            (action) => deadApi.endpoints.getDead.matchFulfilled(action),
            (state, action) => {
                deadAdapter.setAll(state, action.payload);
            }
        )
            .addMatcher(
                (action) => deadApi.endpoints.removeDeadSingle.matchFulfilled(action),
                (state, action) => {
                    deadAdapter.removeOne(state, action.meta.arg.originalArgs.id)
                }
            )
            .addMatcher(
                (action) => deadApi.endpoints.processDeadSingle.matchFulfilled(action),
                (state, action) => {
                    if (action.payload === undefined) {
                        deadAdapter.removeOne(state, action.meta.arg.originalArgs.id);
                    } else {
                        state.entities[action.meta.arg.originalArgs.id] = action.payload;
                        //deadAdapter.updateOne(state, action.meta.arg.originalArgs.id);
                    }
                }
            )
            .addMatcher(
                (action) => clearDead.match(action),
                (state, action) => {
                    state = deadAdapter.getInitialState();
                }
            )
    }
});

export const clearDead = createAction('clearDead');

export const {useGetDeadQuery, useProcessDeadSingleMutation, useRemoveDeadSingleMutation} = deadApi;
