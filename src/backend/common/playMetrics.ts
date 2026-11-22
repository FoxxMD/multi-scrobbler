import prom from 'prom-client';

/**
 * Timings to find which part of an export (or of play processing) is slow.
 * Quantiles cover the last 10 minutes, sum and count cover the time since startup.
 * */

const summary = (name: string, help: string, labelNames: string[]): prom.Summary<string> =>
    (prom.register.getSingleMetric(name) as prom.Summary<string> | undefined)
    ?? new prom.Summary({name, help, labelNames, percentiles: [0.5, 0.9, 0.99], maxAgeSeconds: 600, ageBuckets: 5});

/** Stages of one JobRunner export loop pass, labeled by job id and client name */
export const exportStageSeconds = summary('multiscrobbler_export_stage_seconds', 'Seconds spent in each stage of a Job export', ['job', 'client', 'stage']);

/** Time an export loop spends waiting, by a fixed reason key */
export const exportWaitSeconds = (prom.register.getSingleMetric('multiscrobbler_export_wait_seconds') as prom.Counter<string> | undefined)
    ?? new prom.Counter({name: 'multiscrobbler_export_wait_seconds', help: 'Seconds a Job export waited, by reason', labelNames: ['job', 'client', 'reason']});

/** Stages of queueing and processing one play in a Source or Client. `job` is empty for live plays */
export const playStageSeconds = summary('multiscrobbler_play_stage_seconds', 'Seconds spent in each stage of queueing and processing a Play', ['mode', 'name', 'job', 'stage']);

export const timed = async <T>(metric: prom.Summary<string>, labels: prom.LabelValues<string>, fn: () => Promise<T>): Promise<T> => {
    const end = metric.startTimer(labels);
    try {
        return await fn();
    } finally {
        end();
    }
}
