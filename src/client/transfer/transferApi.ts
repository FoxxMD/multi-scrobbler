import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/dist/query/react/index";

export interface TransferOptions {
    sourceName: string;
    clientName: string;
    playCount?: number;
    fromDate?: string;
    toDate?: string;
}

export type TransferStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TransferProgress {
    status: TransferStatus;
    processed: number;
    total: number;
    queued: number;
    duplicates: number;
    errors: number;
    currentPage?: number;
    totalPages?: number;
    startedAt?: string;
    completedAt?: string;
    currentError?: string;
    currentTrack?: string;
    rate?: number;
}

export interface TransferJobInfo {
    id: string;
    options: TransferOptions;
    progress: TransferProgress;
}

export interface SourcesClientsResponse {
    sources: string[];
    clients: string[];
}

export const transferApi = createApi({
    reducerPath: 'transferApi',
    baseQuery: fetchBaseQuery({ baseUrl: './api/' }),
    tagTypes: ['Transfer'],
    endpoints: (builder) => ({
        getSourcesClients: builder.query<SourcesClientsResponse, void>({
            query: () => 'transfer/sources-clients',
        }),
        startTransfer: builder.mutation<{ id: string }, TransferOptions>({
            query: (options) => ({
                url: 'transfer',
                method: 'POST',
                body: options,
            }),
            invalidatesTags: ['Transfer'],
        }),
        getTransfers: builder.query<TransferJobInfo[], void>({
            query: () => 'transfer',
            providesTags: ['Transfer'],
        }),
        getTransfer: builder.query<TransferJobInfo, string>({
            query: (id) => `transfer/${id}`,
            providesTags: ['Transfer'],
        }),
        cancelTransfer: builder.mutation<{ message: string }, string>({
            query: (id) => ({
                url: `transfer/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Transfer'],
        }),
    }),
});

export const {
    useGetSourcesClientsQuery,
    useStartTransferMutation,
    useGetTransfersQuery,
    useGetTransferQuery,
    useCancelTransferMutation,
} = transferApi;
