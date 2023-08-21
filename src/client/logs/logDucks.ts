import {
    createEntityAdapter, createReducer,
    createSlice
} from '@reduxjs/toolkit'
import {logsApi} from "./logsApi";
import {LogInfoJson, LogOutputConfig} from "../../core/Atomic";
export interface LogsState {
    data: LogInfoJson[],
    settings: LogOutputConfig
}
const initialState: LogsState = {data: [], settings: {level: 'debug', sort: 'asc', limit: 50}};
const logsReducer = createReducer(initialState, (builder) => {
   builder
       .addMatcher(
       (action) => logsApi.endpoints.getLogs.matchFulfilled(action) || logsApi.endpoints.setLevel.matchFulfilled(action),
       (state, action) => {
           state.data = action.payload.data.slice(0, 50);
           state.settings = action.payload.settings;
       }
   )
});

export {logsReducer};
