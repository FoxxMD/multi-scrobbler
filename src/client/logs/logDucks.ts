import {
    createReducer
} from '@reduxjs/toolkit';
import { type LogOutputConfig } from "../../core/Atomic";
import { logsApi } from "./logsApi";
export interface LogsState {
    // TODO remove after new ui switchover
    // needed to remove this type to remove @foxxmd/logging from vite deps
    data: any[],
    settings: LogOutputConfig
}
const initialState: LogsState = {data: [], settings: {level: 'trace', sort: 'desc', limit: 50}};
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

export { logsReducer };

