import React, { useState } from 'react';
import { useGetSourcesClientsQuery, useStartTransferMutation, useGetTransfersQuery } from './transferApi';
import TransferStatus from './TransferStatus';

type TransferMode = 'recent' | 'dateRange';

const TransferPage = () => {
    const [mode, setMode] = useState<TransferMode>('recent');
    const [sourceName, setSourceName] = useState('');
    const [clientName, setClientName] = useState('');
    const [playCount, setPlayCount] = useState(500);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const { data: sourcesClients, isLoading: isLoadingSC } = useGetSourcesClientsQuery();
    const { data: transfers = [], refetch: refetchTransfers } = useGetTransfersQuery(undefined, {
        pollingInterval: 2000,
    });
    const [startTransfer, { isLoading: isStarting, error: startError }] = useStartTransferMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!sourceName || !clientName) {
            return;
        }

        try {
            const options: any = {
                sourceName,
                clientName,
            };

            if (mode === 'recent') {
                if (playCount <= 0) {
                    return;
                }
                options.playCount = playCount;
            } else {
                if (fromDate) {
                    options.fromDate = fromDate;
                }
                if (toDate) {
                    options.toDate = toDate;
                }
            }

            await startTransfer(options).unwrap();
            refetchTransfers();
        } catch (err) {
            console.error('Failed to start transfer:', err);
        }
    };

    return (
        <div className="grid gap-6">
            <div className="shadow-md rounded bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Transfer Plays</h2>
                </div>
                <div className="p-5">
                    <p className="mb-4 text-gray-200">
                        Transfer plays from a source to a client. This is useful for backfilling your scrobble history between accounts.
                    </p>

                    {isLoadingSC ? (
                        <div>Loading sources and clients...</div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Source</label>
                                <select
                                    value={sourceName}
                                    onChange={(e) => setSourceName(e.target.value)}
                                    className="w-full p-2 bg-gray-600 border border-gray-500 rounded text-white"
                                    required
                                >
                                    <option value="">Select a source...</option>
                                    {sourcesClients?.sources.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Client (Destination)</label>
                                <select
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    className="w-full p-2 bg-gray-600 border border-gray-500 rounded text-white"
                                    required
                                >
                                    <option value="">Select a client...</option>
                                    {sourcesClients?.clients.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Transfer Mode</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="radio"
                                            name="mode"
                                            value="recent"
                                            checked={mode === 'recent'}
                                            onChange={(e) => setMode('recent')}
                                            className="mr-2"
                                        />
                                        <span>Recent Plays</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="radio"
                                            name="mode"
                                            value="dateRange"
                                            checked={mode === 'dateRange'}
                                            onChange={(e) => setMode('dateRange')}
                                            className="mr-2"
                                        />
                                        <span>Date Range</span>
                                    </label>
                                </div>
                            </div>

                            {mode === 'recent' ? (
                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Number of Recent Plays
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={playCount}
                                        onChange={(e) => setPlayCount(parseInt(e.target.value))}
                                        className="w-full p-2 bg-gray-600 border border-gray-500 rounded text-white"
                                        required
                                    />
                                    <p className="text-xs text-gray-300 mt-1">
                                        Transfer the most recent {playCount} plays from the source.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium mb-2">
                                            From Date (optional)
                                        </label>
                                        <input
                                            type="date"
                                            value={fromDate}
                                            onChange={(e) => setFromDate(e.target.value)}
                                            className="w-full p-2 bg-gray-600 border border-gray-500 rounded text-white"
                                        />
                                        <p className="text-xs text-gray-300 mt-1">
                                            Leave empty to start from the oldest available play
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">
                                            To Date (optional)
                                        </label>
                                        <input
                                            type="date"
                                            value={toDate}
                                            onChange={(e) => setToDate(e.target.value)}
                                            className="w-full p-2 bg-gray-600 border border-gray-500 rounded text-white"
                                        />
                                        <p className="text-xs text-gray-300 mt-1">
                                            Leave empty to transfer up to the most recent play
                                        </p>
                                    </div>
                                    <p className="text-xs text-yellow-300">
                                        ⚠️ Date range transfers may take a long time for large histories. The transfer runs in the background.
                                    </p>
                                </div>
                            )}

                            {startError && (
                                <div className="p-3 bg-red-600 rounded text-white">
                                    {'data' in startError && startError.data && typeof startError.data === 'object' && 'error' in startError.data
                                        ? String(startError.data.error)
                                        : 'Failed to start transfer'}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isStarting || !sourceName || !clientName || (mode === 'recent' && playCount <= 0)}
                                className="w-full p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-semibold transition-colors"
                            >
                                {isStarting ? 'Starting...' : 'Start Transfer'}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            <div className="shadow-md rounded bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Active & Recent Transfers</h2>
                </div>
                <div className="p-5">
                    {transfers.length === 0 ? (
                        <p className="text-gray-300">No transfers yet. Start one above!</p>
                    ) : (
                        <div className="space-y-4">
                            {transfers.map(transfer => (
                                <TransferStatus key={transfer.id} transfer={transfer} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TransferPage;
