import { loggerDebug, loggerTest } from "@foxxmd/logging";
import EventEmitter from "events";
import { describe, it } from 'mocha';
import { expect } from 'chai';
import type {SonosState} from "@svrooij/sonos/lib/models/sonos-state.js";
import type {SonosManager} from "@svrooij/sonos";
import type {SonosData} from "../../common/infrastructure/config/source/sonos.ts";
import { SonosSource, formatPlayObj } from "../../sources/SonosSource.ts";
import * as dotenv from 'dotenv';
import path from 'path';
import { getPathFromCWD } from "../../common/index.ts";

const envPath = path.join(getPathFromCWD(), '.env');
dotenv.config({ path: envPath });

const createSource = async (data: SonosData): Promise<SonosSource> => {
    const source = new SonosSource('Test', {
        id: `test-${Date.now()}`,
        data,
        options: {}
    }, { localUrl: new URL('http://test'), configDir: 'test', dataDir: 'test', logger: loggerDebug, version: 'test' }, new EventEmitter());
    await source.buildInitData();
    return source;
}

describe('#Sonos', function() {

    before(function () {
        if (process.env.SONOS_TEST !== 'true') {
            this.skip();
        }
    });

    it('does stuff', async function() {

        const s = await createSource({host: process.env.SONOS_HOST_TEST!});
        await s.checkConnection();
        await s.getRecentlyPlayed();
        const f = 1;
    });

});

// state reported by a speaker (Era 100) using its bluetooth input
// when the bluetooth device provides track metadata but sonos does not know duration/position
const bluetoothState = (overrides: Record<string, unknown> = {}): SonosState => ({
    mediaInfo: {
        NrTracks: 1,
        MediaDuration: 'NOT_IMPLEMENTED',
        CurrentURI: 'x-sonos-vli:RINCON_000000000000001400:3,bluetooth:0000',
        CurrentURIMetaData: {
            Title: 'Bluetooth',
            UpnpClass: 'object.item.audioItem.linein.bluetooth',
            ItemId: 'bluetooth',
            ParentId: 0,
            TrackUri: 'x-sonos-vli:RINCON_000000000000001400:3,bluetooth:0000',
            ProtocolInfo: 'x-sonos-vli:*:audio:*'
        },
        NextURI: {},
        NextURIMetaData: {},
        PlayMedium: 'NETWORK',
        RecordMedium: 'NOT_IMPLEMENTED',
        WriteStatus: 'NOT_IMPLEMENTED'
    },
    muted: false,
    positionInfo: {
        Track: 1,
        TrackDuration: {},
        TrackMetaData: {
            Album: 'Social Cues',
            Artist: 'Cage the Elephant',
            Title: 'Broken Boy',
            UpnpClass: 'object.item.audioItem.musicTrack',
            ItemId: -1,
            ParentId: -1
        },
        TrackURI: 'x-sonos-vli:RINCON_000000000000001400:3,bluetooth:0000',
        RelTime: {},
        AbsTime: {},
        RelCount: 2147483647,
        AbsCount: 2147483647,
        ...overrides
    },
    transportState: 'PLAYING',
    volume: 34
} as unknown as SonosState);

describe('#Sonos Play Formatting', function() {

    it('does not throw when duration and position are not strings', function() {
        expect(() => formatPlayObj(bluetoothState())).to.not.throw();
        const play = formatPlayObj(bluetoothState());
        expect(play.data.track?.name).to.eq('Broken Boy');
        expect(play.data.duration).to.be.undefined;
        expect(play.meta.trackProgressPosition).to.be.undefined;
    });

    it('treats NOT_IMPLEMENTED duration and position as unknown', function() {
        const play = formatPlayObj(bluetoothState({TrackDuration: 'NOT_IMPLEMENTED', RelTime: 'NOT_IMPLEMENTED'}));
        expect(play.data.duration).to.be.undefined;
        expect(play.meta.trackProgressPosition).to.be.undefined;
    });

    it('parses duration and position when they are timestamps', function() {
        const play = formatPlayObj(bluetoothState({TrackDuration: '0:03:37', RelTime: '0:00:14'}));
        expect(play.data.duration).to.eq(217);
        expect(play.meta.trackProgressPosition).to.eq(14);
    });

});

const fakeDevice = (name: string, uuid: string, state: SonosState) => ({
    Name: name,
    GroupName: name,
    Uuid: uuid,
    Host: '192.168.0.1',
    GetState: async () => state
});

describe('#Sonos Players', function() {

    it('tracks devices playing at the same time as separate players', async function() {
        using source = new SonosSource('Test', {
            id: `test-${Date.now()}`,
            data: {host: '192.168.0.1'},
            options: {}
        }, { localUrl: new URL('http://test'), configDir: 'test', dataDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());
        await source.buildInitData();

        const streaming = bluetoothState({
            TrackDuration: '0:03:37',
            RelTime: '0:00:14',
            TrackMetaData: {
                Artist: 'Darude',
                Title: 'Feel the Beat',
                UpnpClass: 'object.item.audioItem.musicTrack'
            },
            TrackURI: 'x-sonos-http:track.flac'
        });

        source.manager = {
            Devices: [
                fakeDevice('Office', 'RINCON_000000000000001400', bluetoothState()),
                fakeDevice('Living Room', 'RINCON_000000000000002400', streaming)
            ]
        } as unknown as SonosManager;

        // more than one poll so a player created by one device cannot replace another
        await source.getRecentlyPlayed();
        await source.getRecentlyPlayed();

        expect(source.players.size).to.eq(2);
        const tracks = Array.from(source.players.values()).map(x => x.getApiState().play?.data.track?.name).sort();
        expect(tracks).to.eql(['Broken Boy', 'Feel the Beat']);
    });

});
