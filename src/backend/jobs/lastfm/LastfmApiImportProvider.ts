import type LastfmApiClient from "../../common/vendor/LastfmApiClient.ts";
import type { JobImportCursorApi } from "../../common/infrastructure/Job.ts";
import type { ImportBatch, ImportFetchArgs, ImportProvider, ImportRecord } from "../ImportProvider.ts";
import { lastfmTrackToRecord, type LastfmTrackLike, trackUts } from "./lastfmRecords.ts";

export const LASTFM_PAGE_LIMIT = 200;

export interface LastfmImportSource {
    api: Pick<LastfmApiClient, 'getRecentTracksWithPagination' | 'user'>
    isReady(): boolean
    name: string
}

const sec = (ms: number) => Math.floor(ms / 1000);

const asNumber = (val: string | number | undefined): number | undefined => {
    if (val === undefined) {
        return undefined;
    }
    const n = typeof val === 'number' ? val : Number.parseInt(val, 10);
    return Number.isNaN(n) ? undefined : n;
}

/**
 * Imports from a user's Last.fm Source/Client through user.getRecentTracks, newest -> oldest.
 *
 * Pages by time instead of page number: every request is page 1 with `to` moved to the oldest scrobble seen,
 * which avoids Last.fm's slow/erroring deep pagination and page shifts when scrobbles change mid-import.
 * Requests overlap boundary seconds and rely on the mirror uid dedupe, so it is correct whether Last.fm's `from`/`to` are inclusive or exclusive.
 * If more than one page of scrobbles share a single second it pages within that second.
 * */
export class LastfmApiImportProvider implements ImportProvider {
    readonly kind = 'lastfm-api';
    readonly gapDriven = true;

    protected source: LastfmImportSource;

    constructor(source: LastfmImportSource) {
        this.source = source;
    }

    async ready() {
        if (!this.source.isReady()) {
            throw new Error(`Last.fm component ${this.source.name} is not ready`);
        }
        if (this.source.api.user === undefined) {
            throw new Error(`Last.fm component ${this.source.name} is not authenticated`);
        }
    }

    protected async request(from: number, to: number, page: number) {
        const resp = await this.source.api.getRecentTracksWithPagination({from, to, page, limit: LASTFM_PAGE_LIMIT});
        const tracks = (resp.recenttracks?.track ?? []) as unknown as LastfmTrackLike[];
        const attr = resp.recenttracks?.['@attr'];
        const totalPages = asNumber(attr?.totalPages) ?? 0;
        const records: ImportRecord[] = [];
        let oldest: number | undefined;
        for (const t of tracks) {
            const r = lastfmTrackToRecord(t);
            if (r === undefined) {
                continue;
            }
            records.push(r);
            const uts = trackUts(t)!;
            oldest = oldest === undefined ? uts : Math.min(oldest, uts);
        }
        return {records, oldest, total: asNumber(attr?.total), more: page < totalPages};
    }

    async fetch(args: ImportFetchArgs): Promise<ImportBatch> {
        const gap = args.gap!;
        const cursor = args.cursor as JobImportCursorApi;

        if (cursor.page !== undefined) {
            // paging inside one crowded second
            const s = sec(cursor.to);
            // overlap one second on each side so this is correct whether `from`/`to` are inclusive or exclusive
            const {records, more} = await this.request(Math.max(0, s - 1), s + 1, cursor.page);
            if (more && records.length > 0) {
                return {records, cursor: {...cursor, page: cursor.page + 1}, done: false};
            }
            // finished this second
            const nextTo = s * 1000 - 1;
            if (nextTo < gap[0]) {
                return {records, covered: [gap[0], cursor.to], cursor: {gapTo: cursor.gapTo, gapTotal: cursor.gapTotal, to: gap[0]}, done: true};
            }
            return {records, covered: [s * 1000, cursor.to], cursor: {gapTo: cursor.gapTo, gapTotal: cursor.gapTotal, to: nextTo}, done: false};
        }

        const {records, oldest, total, more} = await this.request(Math.max(0, sec(gap[0]) - 1), sec(cursor.to) + 1, 1);
        const gapTotal = cursor.gapTotal ?? total;

        if (!more || oldest === undefined) {
            return {records, covered: [gap[0], cursor.to], cursor: {...cursor, gapTotal, to: gap[0]}, done: true};
        }
        if (oldest >= sec(cursor.to)) {
            // a full page within the top second, page through that second before moving on.
            // starts at page 1 again because, if `to` is inclusive, already covered scrobbles from the next second shift the pages
            return {records, cursor: {...cursor, gapTotal, page: 1}, done: false};
        }
        // scrobbles in the oldest second may continue on the next page, so only claim newer seconds as covered
        const nextTo = oldest * 1000 + 999;
        return {records, covered: [(oldest + 1) * 1000, cursor.to], cursor: {...cursor, gapTotal, to: nextTo}, done: false};
    }
}
