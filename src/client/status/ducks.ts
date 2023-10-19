import {
    createAction,
    createReducer,
    AnyAction,
    PayloadAction, createEntityAdapter,
    createSlice
} from '@reduxjs/toolkit'
import { Api } from '@reduxjs/toolkit/query/react';
import {statusApi} from "./statusApi";
import {ClientStatusData, SourcePlayerJson, SourceStatusData} from "../../core/Atomic";

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
                    if(state.entities[action.payload.id] !== undefined) {
                        state.entities[action.payload.id].tracksDiscovered = state.entities[action.payload.id].tracksDiscovered + 1;
                    }
                }
            ).addMatcher(
            (action) => sourceUpdate.match(action) && action.payload.event === 'playerUpdate',
            (state, action) => {
                if(state.entities[action.payload.id] !== undefined) {
                    const playerState = action.payload.data as SourcePlayerJson;
                    state.entities[action.payload.id].players[playerState.platformId] = playerState;
                }
            }).addMatcher(
            (action) => sourceUpdate.match(action) && action.payload.event === 'playerDelete',
            (state, action) => {
                if(state.entities[action.payload.id] !== undefined) {
                    const playerState = action.payload.data as {platformId: string};
                    delete state.entities[action.payload.id].players[playerState.platformId];
                }
            }
        )
            .addMatcher(
                (action) => sourceUpdate.match(action) && action.payload.event === 'statusChange',
                (state, action) => {
                    if(state.entities[action.payload.id] !== undefined) {
                        state.entities[action.payload.id].status = action.payload.data.status;
                    }
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
                    if(state.entities[action.payload.id] !== undefined) {
                        state.entities[action.payload.id].tracksDiscovered = state.entities[action.payload.id].tracksDiscovered + 1;
                    }
                }
            )
            .addMatcher(
                (action) => clientUpdate.match(action) && action.payload.event === 'deadLetter',
                (state, action) => {
                    if(state.entities[action.payload.id] !== undefined) {
                        state.entities[action.payload.id].deadLetterScrobbles = state.entities[action.payload.id].deadLetterScrobbles + 1;
                    }
                }
            )
            .addMatcher(
                (action) => clientUpdate.match(action) && action.payload.event === 'statusChange',
                (state, action) => {
                    if(state.entities[action.payload.id] !== undefined) {
                        state.entities[action.payload.id].status = action.payload.data.status;
                    }
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
