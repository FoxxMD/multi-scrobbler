import { expect } from 'chai';
import { after, describe, it } from 'mocha';
import { EventEmitter } from "events";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loggerTest } from '@foxxmd/logging';
import TealScrobbler from '../../scrobblers/TealfmScrobbler.ts';
import { CAR_KEEP_MS } from '../../scrobblers/AbstractHistoricalScrobbleClient.ts';
import { indexRockskyRecord } from '../../common/vendor/RockSkyApiClient.ts';
import type { RockskyIndex } from '@rocksky/sdk/dedup';

const dirs: string[] = [];
after(() => dirs.forEach(d => fs.rmSync(d, {recursive: true, force: true})));

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const buildTeal = async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-car-'));
    dirs.push(dataDir);
    const tfm = new TealScrobbler('test',
        {id: `test-${Date.now()}`, name: 'test', data: {identifier: 'test', appPassword: 'test'}},
        {configDir: dataDir, dataDir, localUrl: new URL('https://example.com'), version: 'test'},
        new EventEmitter(),
        loggerTest
    );
    await tfm.buildDatabase();
    let downloads = 0;
    const t = tfm as any;
    t.downloadCar = async (filename: string) => {
        downloads++;
        fs.writeFileSync(filename, 'car');
    };
    return {t, downloads: () => downloads, dataDir};
}

describe('#tealfm Repo CAR file', function () {

    it('reuses a CAR younger than CAR_KEEP_MS and schedules its deletion once', async function () {
        const {t, downloads} = await buildTeal();
        const file = await t.getCarFile();
        expect(fs.readFileSync(file, 'utf8')).eq('car');
        expect(fs.existsSync(`${file}.part`)).false;
        expect(await t.getCarFile()).eq(file);
        expect(downloads()).eq(1);
        expect(t.scheduler.getAllJobs()).length(1);
        t.stopTasks();
    });

    it('downloads again when the CAR is older than CAR_KEEP_MS', async function () {
        const {t, downloads} = await buildTeal();
        const file = await t.getCarFile();
        const old = new Date(Date.now() - CAR_KEEP_MS - 1000);
        fs.utimesSync(file, old, old);
        await t.getCarFile();
        expect(downloads()).eq(2);
        t.stopTasks();
    });

    it('removes a partial download when it fails', async function () {
        const {t} = await buildTeal();
        t.downloadCar = async (filename: string) => {
            fs.writeFileSync(filename, 'partial');
            throw new Error('network');
        };
        await expect(t.getCarFile()).rejectedWith('network');
        expect(fs.existsSync(`${t.carPath}.part`)).false;
        expect(fs.existsSync(t.carPath)).false;
    });

    it('deletes the CAR when the scheduled job runs', async function () {
        const {t} = await buildTeal();
        const file = await t.getCarFile();
        t.scheduleCarDelete(10);
        await sleep(100);
        expect(fs.existsSync(file)).false;
        expect(t.scheduler.getAllJobs()).length(0);
    });
});

describe('#rocksky Index from streamed records', function () {

    it('writes the same keys as indexCar for each collection', async function () {
        const calls: unknown[][] = [];
        const index = new Proxy({}, {get: (_, name) => async (...args: unknown[]) => calls.push([name, ...args])}) as unknown as RockskyIndex;
        const did = 'did:plc:abc';
        await indexRockskyRecord(index, did, 'app.rocksky.artist', '1', {name: 'Artist'});
        await indexRockskyRecord(index, did, 'app.rocksky.album', '2', {title: 'Album', artist: 'Artist'});
        await indexRockskyRecord(index, did, 'app.rocksky.song', '3', {title: 'Song', artist: 'Artist', album: 'Album'});
        await indexRockskyRecord(index, did, 'app.rocksky.scrobble', '4', {title: 'Song', artist: 'Artist', album: 'Album', createdAt: '2026-01-01T00:00:10.500Z'});
        // incomplete or other records are skipped
        await indexRockskyRecord(index, did, 'app.rocksky.scrobble', '5', {title: 'Song', artist: 'Artist', createdAt: '2026-01-01T00:00:10Z'});
        await indexRockskyRecord(index, did, 'app.bsky.feed.post', '6', {text: 'hi'});
        expect(calls).eql([
            ['recordArtist', did, 'Artist', `at://${did}/app.rocksky.artist/1`],
            ['recordAlbum', did, 'Album', 'Artist', `at://${did}/app.rocksky.album/2`],
            ['recordSong', did, 'Song', 'Artist', 'Album', `at://${did}/app.rocksky.song/3`],
            ['recordScrobble', did, 'Song', 'Artist', 'Album', 1767225610, `at://${did}/app.rocksky.scrobble/4`],
        ]);
    });
});
