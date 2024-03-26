import {
    createEntityAdapter, createReducer,
    createSlice
} from '@reduxjs/toolkit'
import {logsApi} from "./logsApi";
import {LogOutputConfig} from "../../core/Atomic";
import {LogDataPretty} from "@foxxmd/logging";
export interface LogsState {
    data: (LogDataPretty & {levelLabel: string})[],
    settings: LogOutputConfig
}
const initialState: LogsState = {data: [], settings: {level: 'debug', sort: 'asc', limit: 50}};
const logsReducer = createReducer(initialState, (builder) => {
   builder
       .addMatcher(
       (action) => logsApi.endpoints.getLogs.matchFulfilled(action) || logsApi.endpoints.setLogSettings.matchFulfilled(action),
       (state, action) => {
           state.data = action.payload.data.slice(0, action.payload.settings.limit + 1);
           state.settings = action.payload.settings;
       }
   )
});

export {logsReducer};
