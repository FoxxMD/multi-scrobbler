import { expect } from 'chai';
import { describe, it } from 'mocha';
import { jobExportTimings, type JobMetricsApiJson } from '../../../core/Job.ts';

const summary = (metric: string, labels: Record<string, string>, sum: number, count: number) => [
    {labels, value: sum, metricName: `${metric}_sum`},
    {labels, value: count, metricName: `${metric}_count`},
    // quantiles are ignored
    {labels: {...labels, quantile: 0.5}, value: 99},
];
const play = (stage: string, sum: number, count: number, job = '1', name = 'client-a') => summary('multiscrobbler_play_stage_seconds', {mode: 'client', name, job, stage}, sum, count);

const data = (values: {play?: JobMetricsApiJson['metrics'][number]['values'], export?: JobMetricsApiJson['metrics'][number]['values']}) => ({
    job: {id: 1},
    metrics: [
        {name: 'multiscrobbler_export_stage_seconds', help: '', type: 'summary', values: values.export ?? []},
        {name: 'multiscrobbler_play_stage_seconds', help: '', type: 'summary', values: values.play ?? []},
    ],
}) as unknown as JobMetricsApiJson;

describe('Job export timings', function () {

    it('averages per Play from stage sums and counts of the Job and Client', function () {
        const timings = jobExportTimings(data({
            export: summary('multiscrobbler_export_stage_seconds', {job: '1', name: 'client-a', stage: 'pass'}, 2, 4),
            play: [
                ...play('pre_queue_check', 1, 10),
                ...play('process_total', 5, 10),
                ...play('scrobble_request', 3, 6),
                ...play('persist', 1, 10),
                ...play('queue_next', 0.5, 50, ''),
                // another job, another client, a live play: not counted
                ...play('process_total', 100, 1, '2'),
                ...play('process_total', 100, 1, '1', 'client-b'),
                ...play('scrobble_request', 100, 1, ''),
            ],
        }), 'client-a');
        expect(timings.scrobbleRequest).closeTo(0.5, 1e-9);
        // (5 - 3) / 10 + 0.01 queue read
        expect(timings.clientProcessing).closeTo(0.21, 1e-9);
        // 2 / 10 export side + 0.5 processing + 0.01 queue read + 0.1 persist
        expect(timings.perPlay).closeTo(0.81, 1e-9);
    });

    it('is undefined before anything was measured', function () {
        expect(jobExportTimings(data({}), 'client-a')).eql({perPlay: undefined, clientProcessing: undefined, scrobbleRequest: undefined});
    });
});
