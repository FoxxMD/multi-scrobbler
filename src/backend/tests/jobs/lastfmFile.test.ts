import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as path from 'path';
import { readFile, writeFile } from 'fs/promises';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { projectRootDir } from '../../common/infrastructure/Atomic.ts';
import { detectLastfmFileFormat, readLastfmFile, UnsupportedFileError } from '../../jobs/lastfm/lastfmFiles.ts';
import { lastfmTrackToRecord, type LastfmTrackLike } from '../../jobs/lastfm/lastfmRecords.ts';
import { LastfmFileImportProvider } from '../../jobs/lastfm/LastfmFileImportProvider.ts';
import type { LastfmFileFormat } from '../../../core/Job.ts';
import type { ImportBatch } from '../../jobs/ImportProvider.ts';
import { createTmpDir } from '../utils/tmpDir.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { JobManager } from '../../jobs/JobManager.ts';
import { playsHistorical } from '../../common/database/drizzle/schema/schema.ts';

const fixture = (name: string) => path.resolve(projectRootDir, 'src/backend/tests/jobs/fixtures', name);

const readAll = async (file: string, format: LastfmFileFormat) => {
    const stream = readLastfmFile(file, format);
    const tracks: LastfmTrackLike[] = [];
    for await (const t of stream.tracks) {
        tracks.push(t);
    }
    return tracks;
}

const fileOpts = async (name: string, format: LastfmFileFormat) => ({
    path: fixture(name),
    originalName: name,
    format,
    size: (await readFile(fixture(name))).length,
    managed: false
});

const drain = async (provider: LastfmFileImportProvider, cursor?: {records: number}) => {
    const batches: ImportBatch[] = [];
    let c = cursor;
    while (true) {
        const b = await provider.fetch({cursor: c, signal: new AbortController().signal});
        batches.push(b);
        c = b.cursor as {records: number};
        if (b.done) {
            return batches;
        }
    }
}

describe('Last.fm export files', function () {

    describe('format detection', function () {
        it('detects each supported format', async function () {
            expect(await detectLastfmFileFormat(fixture('ghan.json'))).eq('lastfm-ghan-json');
            expect(await detectLastfmFileFormat(fixture('ghan.csv'))).eq('lastfm-ghan-csv');
            expect(await detectLastfmFileFormat(fixture('benjamin.csv'))).eq('lastfm-benjamin-csv');
        });

        it('rejects unknown files', async function () {
            await using tmp = await createTmpDir('lfmDetect');
            const f = path.join(tmp.path, 'other.csv');
            await writeFile(f, 'a,b,c\n1,2,3\n');
            let err: unknown;
            try {
                await detectLastfmFileFormat(f);
            } catch (e) {
                err = e;
            }
            expect(err).instanceOf(UnsupportedFileError);
        });
    });

    describe('parsing', function () {
        it('parses ghan csv', async function () {
            const records = (await readAll(fixture('ghan.csv'), 'lastfm-ghan-csv')).map(lastfmTrackToRecord);
            expect(records).length(6);
            const first = records[0]!.play;
            expect(first.data.artists![0].name).eq('Jon Hopkins');
            expect(first.data.track!.name).eq('Breathe This Air');
            expect(first.data.album!.name).eq('Immunity');
            expect(first.data.playDate!.unix()).eq(1388723771);
        });

        it('parses benjaminbenben csv as UTC with minute precision', async function () {
            const records = (await readAll(fixture('benjamin.csv'), 'lastfm-benjamin-csv')).map(lastfmTrackToRecord);
            expect(records).length(8);
            const first = records[0]!.play;
            expect(first.data.artists![0].name).eq('Jon Hopkins');
            expect(first.data.track!.name).eq('Breathe This Air');
            expect(first.data.playDate!.toISOString()).eq('2014-01-03T04:36:00.000Z');
        });

        it('parses ghan json pages and skips now playing', async function () {
            const records = (await readAll(fixture('ghan.json'), 'lastfm-ghan-json')).map(lastfmTrackToRecord).filter(x => x !== undefined);
            expect(records).length(6);
            expect(records[0]!.play.data.playDate!.unix()).eq(1388723771);
            // raw data is kept for historical_play_inputs
            expect(records[0]!.play.original?.data).to.not.be.undefined;
        });

        it('throws on a truncated json file instead of finishing silently', async function () {
            await using tmp = await createTmpDir('lfmBadJson');
            const f = path.join(tmp.path, 'bad.json');
            const good = await readFile(fixture('ghan.json'), 'utf-8');
            await writeFile(f, good.slice(0, Math.floor(good.length / 2)));
            let err: unknown;
            try {
                await readAll(f, 'lastfm-ghan-json');
            } catch (e) {
                err = e;
            }
            expect(err).to.not.be.undefined;
        });

        it('builds the same dedupe key from the API (extended), ghan json and ghan csv', async function () {
            const api = lastfmTrackToRecord(JSON.parse(await readFile(fixture('apiExtendedTrack.json'), 'utf-8')))!;
            const json = (await readAll(fixture('ghan.json'), 'lastfm-ghan-json')).map(lastfmTrackToRecord).filter(x => x !== undefined)[0]!;
            const csv = lastfmTrackToRecord((await readAll(fixture('ghan.csv'), 'lastfm-ghan-csv'))[0])!;
            expect(api.key).eq(json.key);
            expect(csv.key).eq(json.key);
        });
    });

    describe('file import provider', function () {
        it('batches the file and covers its time span when done', async function () {
            const provider = new LastfmFileImportProvider(await fileOpts('ghan.csv', 'lastfm-ghan-csv'), [0, dayjs().valueOf()], {batchSize: 4});
            const batches = await drain(provider);
            expect(batches.map(b => b.records.length)).to.deep.eq([4, 2]);
            expect(batches[1].cursor).to.deep.eq({records: 6});
            expect(batches[0].covered).to.be.undefined;
            expect(batches[1].covered).to.deep.eq([1388722542000, 1388723771000]);
            expect(batches[1].progress).eq(1);
        });

        it('resumes after the records already processed', async function () {
            const provider = new LastfmFileImportProvider(await fileOpts('ghan.csv', 'lastfm-ghan-csv'), [0, dayjs().valueOf()], {batchSize: 4});
            const batches = await drain(provider, {records: 4});
            expect(batches.flatMap(b => b.records)).length(2);
            // coverage still spans the whole file
            expect(batches[batches.length - 1].covered).to.deep.eq([1388722542000, 1388723771000]);
        });

        it('skips records outside the job range and clips coverage', async function () {
            const range: [number, number] = [1388722700000, 1388723300000];
            const provider = new LastfmFileImportProvider(await fileOpts('ghan.csv', 'lastfm-ghan-csv'), range);
            const batches = await drain(provider);
            expect(batches.flatMap(b => b.records).map(r => r.play.data.playDate!.unix())).to.deep.eq([1388723271, 1388722976, 1388722794]);
            expect(batches[batches.length - 1].covered).to.deep.eq(range);
        });

        it('imports a file through a job', async function () {
            const db = await transientDb();
            const owner = await ensureOwner(db);
            const mirror = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'lastfm', account: null, name: 'file'});
            const jobs = new JobRepository(db);
            const job = await jobs.create({userId: owner.id, name: 'file', mirrorId: mirror.id, rangeTo: dayjs(), importFile: await fileOpts('ghan.json', 'lastfm-ghan-json')});
            const manager = new JobManager({db, logger: loggerTest, timings: {importPageDelay: 0, emitThrottle: 0}});
            await manager.startImport(job.id);
            // @ts-expect-error reading protected task for test
            await manager.getRunner(job.id).importTask?.promise;

            const done = (await jobs.getById(job.id))!;
            expect(done.importStatus).eq('completed');
            expect(done.imported).eq(6);
            expect(await db.select().from(playsHistorical)).length(6);
            expect((await new MirrorRepository(db).getById(mirror.id))!.coverage).to.deep.eq([[1388722542000, 1388723771000]]);
        });
    });
});
