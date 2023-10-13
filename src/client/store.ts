import {configureStore} from '@reduxjs/toolkit'
// Or from '@reduxjs/toolkit/query/react'
import {setupListeners} from '@reduxjs/toolkit/query'
import {statusApi} from './status/statusApi';
import {clientSlice, sourceSlice} from "./status/ducks";
import {logsReducer} from "./logs/logDucks";
import {logsApi} from "./logs/logsApi";
import {recentApi} from "./recent/recentDucks";
import {scrobbledApi} from "./scrobbled/scrobbledDucks";
import {deadApi, deadSlice} from "./deadLetter/deadLetterDucks";

export const store = configureStore({
    reducer: {
        // Add the generated reducer as a specific top-level slice
        [statusApi.reducerPath]: statusApi.reducer,
        [logsApi.reducerPath]: logsApi.reducer,
        [recentApi.reducerPath]: recentApi.reducer,
        [deadApi.reducerPath]: deadApi.reducer,
        [scrobbledApi.reducerPath]: scrobbledApi.reducer,
        //parts: statusReducer
        clients: clientSlice.reducer,
        sources: sourceSlice.reducer,
        deadLetter: deadSlice.reducer,
        logs: logsReducer
    },
    // Adding the api middleware enables caching, invalidation, polling,
    // and other useful features of `rtk-query`.
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat([statusApi.middleware, logsApi.middleware, recentApi.middleware, scrobbledApi.middleware, deadApi.middleware]),
})

// optional, but required for refetchOnFocus/refetchOnReconnect behaviors
// see `setupListeners` docs - takes an optional callback as the 2nd arg for customization
setupListeners(store.dispatch)

export type RootState = ReturnType<typeof store.getState>
