import { closeSync, createReadStream, openSync, readSync } from "node:fs";
import { pipeline } from "node:stream";
import { parse as parseCsv } from "csv-parse";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import parser from "stream-json/parser.js";
import pick from "stream-json/filters/pick.js";
import streamValues from "stream-json/streamers/stream-values.js";
import type { LastfmFileFormat } from "../../../core/Job.ts";
import type { LastfmTrackLike } from "./lastfmRecords.ts";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

export const GHAN_CSV_HEADER = 'uts,utc_time,artist,artist_mbid,album,album_mbid,track,track_mbid';
export const BENJAMIN_DATE_FORMAT = 'DD MMM YYYY, HH:mm';

export class UnsupportedFileError extends Error {
    name = 'UnsupportedFileError';
}

const readHead = (path: string): string => {
    const fd = openSync(path, 'r');
    try {
        const buf = Buffer.alloc(4096);
        const bytesRead = readSync(fd, buf, 0, buf.length, 0);
        return buf.subarray(0, bytesRead).toString('utf-8').replace(/^\uFEFF/, '');
    } finally {
        closeSync(fd);
    }
}

/** Sniff the start of a file. Throws UnsupportedFileError when no known export format matches */
export const detectLastfmFileFormat = async (path: string): Promise<LastfmFileFormat> => {
    const head = readHead(path);
    const trimmed = head.trimStart();
    if (trimmed.startsWith('[')) {
        return 'lastfm-ghan-json';
    }
    const firstLine = trimmed.split(/\r?\n/)[0] ?? '';
    if (firstLine.replaceAll('"', '').trim() === GHAN_CSV_HEADER) {
        return 'lastfm-ghan-csv';
    }
    // benjaminbenben: no header, artist,album,title,"DD MMM YYYY, HH:mm"
    const dateMatch = firstLine.match(/,"(\d{2} \w{3} \d{4}, \d{2}:\d{2})"\s*$/);
    if (dateMatch !== null && dayjs.utc(dateMatch[1], BENJAMIN_DATE_FORMAT, true).isValid()) {
        return 'lastfm-benjamin-csv';
    }
    throw new UnsupportedFileError('File is not a supported Last.fm export. Supported: lastfm.ghan.nl JSON or CSV, benjaminbenben.com CSV');
}

export interface FileTrackStream {
    tracks: AsyncIterable<LastfmTrackLike>
    /** bytes read from disk so far */
    bytesRead: () => number
    close: () => void
}

const csvStream = (path: string, columns: true | string[], toTrack: (row: Record<string, string>) => LastfmTrackLike | undefined): FileTrackStream => {
    const file = createReadStream(path);
    const csv = parseCsv({columns, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true});
    const piped = pipeline(file, csv, () => undefined);
    return {
        tracks: (async function* () {
            for await (const row of piped as AsyncIterable<Record<string, string>>) {
                const t = toTrack(row);
                if (t !== undefined) {
                    yield t;
                }
            }
        })(),
        bytesRead: () => file.bytesRead,
        close: () => file.destroy(),
    };
}

export const ghanCsvRowToTrack = (row: Record<string, string>): LastfmTrackLike => ({
    artist: {'#text': row.artist, mbid: row.artist_mbid || undefined},
    album: {'#text': row.album, mbid: row.album_mbid || undefined},
    name: row.track,
    mbid: row.track_mbid || undefined,
    date: {uts: row.uts, '#text': row.utc_time},
});

export const benjaminRowToTrack = (row: Record<string, string>): LastfmTrackLike | undefined => {
    const date = dayjs.utc(row.date, BENJAMIN_DATE_FORMAT, true);
    if (!date.isValid()) {
        return undefined;
    }
    return {
        artist: {'#text': row.artist},
        album: {'#text': row.album},
        name: row.title,
        date: {uts: `${date.unix()}`, '#text': row.date},
    };
}

/** ghan JSON is an array of pages, each with a `track` array (or `recenttracks.track`). Only the track items are assembled in memory */
const ghanJsonStream = (path: string): FileTrackStream => {
    // pages => [{"track": [...]}] or [{"recenttracks": {"track": [...]}}], otherwise a bare array of tracks
    const paged = /^\s*\[\s*\{\s*"(track|recenttracks)"/.test(readHead(path));
    const file = createReadStream(path);
    const isTrackItem = (stack: (string | number | null)[]) => paged
        ? (stack.length === 3 && stack[1] === 'track') || (stack.length === 4 && stack[1] === 'recenttracks' && stack[2] === 'track')
        : stack.length === 1;
    const piped = pipeline(file, parser.asStream(), pick.asStream({filter: isTrackItem}), streamValues.asStream(), () => undefined);
    return {
        tracks: (async function* () {
            for await (const item of piped as AsyncIterable<{key: number, value: LastfmTrackLike}>) {
                yield item.value;
            }
        })(),
        bytesRead: () => file.bytesRead,
        close: () => file.destroy(),
    };
}

export const readLastfmFile = (path: string, format: LastfmFileFormat): FileTrackStream => {
    switch (format) {
        case 'lastfm-ghan-json':
            return ghanJsonStream(path);
        case 'lastfm-ghan-csv':
            return csvStream(path, true, ghanCsvRowToTrack);
        case 'lastfm-benjamin-csv':
            return csvStream(path, ['artist', 'album', 'title', 'date'], benjaminRowToTrack);
    }
}
