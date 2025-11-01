import React from 'react';
import { TransferJobInfo, useCancelTransferMutation } from './transferApi';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

dayjs.extend(relativeTime);
dayjs.extend(duration);

interface TransferStatusProps {
    transfer: TransferJobInfo;
}

const TransferStatus: React.FC<TransferStatusProps> = ({ transfer }) => {
    const { id, options, progress } = transfer;
    const { status, processed, total, queued, duplicates, errors, startedAt, completedAt, currentError, currentTrack, rate } = progress;

    const [cancelTransfer, { isLoading: isCancelling }] = useCancelTransferMutation();

    const handleCancel = async () => {
        if (window.confirm('Are you sure you want to cancel this transfer?')) {
            try {
                await cancelTransfer(id).unwrap();
            } catch (err) {
                console.error('Failed to cancel transfer:', err);
            }
        }
    };

    const getElapsedTime = () => {
        if (!startedAt) return null;
        const start = dayjs(startedAt);
        const end = completedAt ? dayjs(completedAt) : dayjs();
        const diff = end.diff(start, 'second');
        return dayjs.duration(diff, 'seconds').format('HH:mm:ss');
    };

    const getEstimatedTimeRemaining = () => {
        if (!rate || rate === 0 || total === 0 || processed >= total) return null;
        const remaining = total - processed;
        const secondsRemaining = remaining / rate;
        return dayjs.duration(secondsRemaining, 'seconds').format('HH:mm:ss');
    };

    const getStatusColor = () => {
        switch (status) {
            case 'running':
                return 'bg-blue-600';
            case 'completed':
                return 'bg-green-600';
            case 'failed':
                return 'bg-red-600';
            default:
                return 'bg-gray-600';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'pending':
                return 'Pending';
            case 'running':
                return 'Running';
            case 'completed':
                return 'Completed';
            case 'failed':
                return 'Failed';
            default:
                return 'Unknown';
        }
    };

    const elapsedTime = getElapsedTime();
    const estimatedTimeRemaining = getEstimatedTimeRemaining();

    const progressPercentage = total > 0 ? Math.round((processed / total) * 100) : 0;

    return (
        <div className="p-4 bg-gray-600 rounded border border-gray-500">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <div className="font-semibold">
                        {options.sourceName} → {options.clientName}
                    </div>
                    <div className="text-sm text-gray-300">
                        {options.playCount ? (
                            `${options.playCount} plays`
                        ) : options.fromDate || options.toDate ? (
                            `${options.fromDate || 'start'} → ${options.toDate || 'now'}`
                        ) : (
                            'plays'
                        )}
                    </div>
                </div>
                <span className={`px-3 py-1 rounded text-sm font-semibold ${getStatusColor()}`}>
                    {getStatusText()}
                </span>
            </div>

            {status === 'running' && (
                <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{progressPercentage}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div>
                    <div className="text-gray-400">Processed</div>
                    <div className="font-semibold">{processed} / {total > 0 ? total : '?'}</div>
                </div>
                <div>
                    <div className="text-gray-400">Queued</div>
                    <div className="font-semibold text-green-400">{queued}</div>
                </div>
                <div>
                    <div className="text-gray-400">Duplicates</div>
                    <div className="font-semibold text-yellow-400">{duplicates}</div>
                </div>
                <div>
                    <div className="text-gray-400">Errors</div>
                    <div className="font-semibold text-red-400">{errors}</div>
                </div>
            </div>

            {progress.currentPage !== undefined && (
                <div className="text-sm text-gray-300 mb-3">
                    Page: {progress.currentPage} {progress.totalPages ? `/ ${progress.totalPages}` : ''}
                </div>
            )}

            {currentTrack && status === 'running' && (
                <div className="text-sm text-gray-300 mb-3 truncate">
                    <span className="text-gray-400">Currently processing:</span> {currentTrack}
                </div>
            )}

            {elapsedTime && (
                <div className="text-sm text-gray-300 mb-3">
                    <span className="text-gray-400">Elapsed:</span> {elapsedTime}
                    {estimatedTimeRemaining && status === 'running' && (
                        <span className="ml-4">
                            <span className="text-gray-400">Estimated remaining:</span> {estimatedTimeRemaining}
                        </span>
                    )}
                    {rate && rate > 0 && status === 'running' && (
                        <span className="ml-4">
                            <span className="text-gray-400">Rate:</span> {rate.toFixed(1)} plays/sec
                        </span>
                    )}
                </div>
            )}

            {currentError && (
                <div className="p-2 bg-red-700 rounded text-sm mb-2">
                    Error: {currentError}
                </div>
            )}

            <div className="flex justify-between items-center">
                <div className="text-xs text-gray-400">
                    {startedAt && (
                        <span>Started {dayjs(startedAt).fromNow()}</span>
                    )}
                    {completedAt && status !== 'running' && (
                        <span> • Completed {dayjs(completedAt).fromNow()}</span>
                    )}
                </div>

                {status === 'running' && (
                    <button
                        onClick={handleCancel}
                        disabled={isCancelling}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors"
                    >
                        {isCancelling ? 'Cancelling...' : 'Cancel'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default TransferStatus;
