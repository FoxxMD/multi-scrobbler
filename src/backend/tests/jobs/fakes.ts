import dayjs from 'dayjs';
import type { ImportBatch, ImportFetchArgs, ImportProvider } from '../../jobs/ImportProvider.ts';
import type { JobImportCursorApi } from '../../common/infrastructure/Job.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { baseFormatPlayObj } from '../../utils/PlayTransformUtils.ts';

/** Pages newest -> oldest by time like Last.fm, `to` inclusive */
export class FakeTimeProvider implements ImportProvider {
    kind = 'fake';
    origin = 'fake';
    gapDriven = true;
    fetches: ImportFetchArgs[] = [];
    failNext = 0;
    readyError?: Error;
    onFetch?: (n: number) => Promise<void> | void;

    timestamps: number[];
    pageSize: number;

    constructor(timestamps: number[], pageSize = 3) {
        this.timestamps = [...timestamps].sort((a, b) => b - a);
        this.pageSize = pageSize;
    }

    async ready() {
        if (this.readyError !== undefined) {
            throw this.readyError;
        }
    }

    async fetch(args: ImportFetchArgs): Promise<ImportBatch> {
        this.fetches.push(args);
        await this.onFetch?.(this.fetches.length);
        if (this.failNext > 0) {
            this.failNext--;
            throw new Error('upstream exploded');
        }
        const gap = args.gap!;
        const cursor = args.cursor as JobImportCursorApi;
        const inGap = this.timestamps.filter(t => t <= cursor.to && t >= gap[0]);
        const page = inGap.slice(0, this.pageSize);
        const more = inGap.length > this.pageSize;
        const gapTotal = cursor.gapTotal ?? inGap.length;
        const records = page.map(ts => {
            const p = generatePlay({playDate: dayjs(ts)});
            return {key: `${ts}`, play: baseFormatPlayObj({ts}, {data: p.data, meta: p.meta})};
        });
        if (!more) {
            return {records, covered: [gap[0], cursor.to], cursor: {...cursor, gapTotal, to: gap[0]}, done: true};
        }
        const oldest = page[page.length - 1];
        return {records, covered: [oldest, cursor.to], cursor: {...cursor, gapTotal, to: oldest - 1}, done: false};
    }
}

