import {
    createAction,
    createReducer,
    AnyAction,
    PayloadAction, createEntityAdapter,
    createSlice
} from '@reduxjs/toolkit'
import { Api } from '@reduxjs/toolkit/query/react';
import {FulfilledAction} from "@reduxjs/toolkit/dist/query/core/buildThunks.js";
import {statusApi} from "./statusApi";
import {ClientStatusData, SourceStatusData} from "../../core/Atomic.js";

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
                    clientAdapter.setAll(state, action.payload.sources);
                }
            )
    }
});

// const initialState = {clients: [], sources: []};
// const statusReducer = createReducer(initialState, (builder) => {
//    builder
//        .addMatcher(
//        (action) => statusApi.endpoints.getStatus.matchFulfilled(action),
//        (state, action) => {
//            state.clients = action.payload.clients ?? [];
//            state.sources = action.payload.sources ?? [];
//        }
//    )
// });

export {sourceSlice, clientSlice, sourceAdapter, clientAdapter};
