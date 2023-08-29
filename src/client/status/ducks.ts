import {
    createAction,
    createReducer,
    AnyAction,
    PayloadAction, createEntityAdapter,
    createSlice
} from '@reduxjs/toolkit'
import { Api } from '@reduxjs/toolkit/query/react';
import {statusApi} from "./statusApi";
import {ClientStatusData, SourceStatusData} from "../../core/Atomic";

export interface ApiEventPayload {
    type: string,
    name: string,
    event: string,
    [key: string]: any
}

const sourceAdapter = createEntityAdapter<SourceStatusData>({
    // Assume IDs are stored in a field other than `book.id`
    selectId: (data) => `${data.type}-${data.name}`,
    // Keep the "all IDs" array sorted based on book titles
    sortComparer: (a, b) => `${a.type}-${a.name}`.localeCompare(`${b.type}-${b.name}`),
});
const clientAdapter = createEntityAdapter<ClientStatusData>({
    // Assume IDs are stored in a field other than `book.id`
    selectId: (data) => `${data.type}-${data.name}`,
    // Keep the "all IDs" array sorted based on book titles
    sortComparer: (a, b) => `${a.type}-${a.name}`.localeCompare(`${b.type}-${b.name}`),
});

const sourceSlice = createSlice({
    name: 'sources',
    initialState: sourceAdapter.getInitialState(),
    reducers: {
        sourceUpdated: sourceAdapter.updateOne,
    },
    extraReducers: (builder) => {
        builder
            .addMatcher(
                (action) => statusApi.endpoints.getStatus.matchFulfilled(action),
                (state, action) => {
                    sourceAdapter.setAll(state, action.payload.sources);
                }
            )
            .addMatcher(
                (action) => sourceUpdate.match(action) && action.payload.event === 'discovered',
                (state, action) => {
                    state.entities[action.payload.id].tracksDiscovered = state.entities[action.payload.id].tracksDiscovered + 1;
                }
            )
    }
});
const clientSlice = createSlice({
    name: 'clients',
    initialState: clientAdapter.getInitialState(),
    reducers: {
        clientUpdated: clientAdapter.updateOne,
    },
    extraReducers: (builder) => {
        builder
            .addMatcher(
                (action) => statusApi.endpoints.getStatus.matchFulfilled(action),
                (state, action) => {
                    clientAdapter.setAll(state, action.payload.clients);
                }
            )
            .addMatcher(
                (action) => clientUpdate.match(action) && action.payload.event === 'scrobble',
                (state, action) => {
                    state.entities[action.payload.id].tracksDiscovered = state.entities[action.payload.id].tracksDiscovered + 1;
                }
            )
    }
});

export const sourceUpdate = createAction('source/update', (payload: ApiEventPayload) => {
    return {
        payload: {
            id: `${payload.type}-${payload.name}`,
            ...payload
        }
    }
});

export const clientUpdate = createAction('client/update', (payload: ApiEventPayload) => {
    return {
        payload: {
            id: `${payload.type}-${payload.name}`,
            ...payload
        }
    }
});

export {sourceSlice, clientSlice, sourceAdapter, clientAdapter};
