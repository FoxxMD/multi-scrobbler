import { loggerTest, loggerDebug } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import dayjs from "dayjs";
import { describe, it, before, after } from 'mocha';
import { http, HttpResponse } from "msw";
import { withRequestInterception } from "../utils/networking.js";
import { MusicCastData } from "../../common/infrastructure/config/source/musiccast.js";
import { MusicCastSource } from "../../sources/MusicCastSource.js";
import netInterceptor from "@gr2m/net-interceptor";
import { REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.js";

const TEST_IP = '192.168.10.101';

const createSource = (data: MusicCastData = { url: TEST_IP }): MusicCastSource => {
    const source = new MusicCastSource('Test', {
        data,
        options: {}
    }, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());
    return source;
}

describe('MusicCast Startup', function () {

    after(() => {
        netInterceptor.stop();
    });
    it('tests for device info correctly', withRequestInterception(
        [
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/system/getDeviceInfo`, () => {
                return HttpResponse.json({
                    model_name: 'test',
                    device_id: 'testid',
                    system_version: '1234',
                    version: '1test',
                    response_code: 0
                }, { status: 200 });
            })
        ],
        async function () {
            const source = createSource();

            await source.buildInitData();

            netInterceptor.start();

            netInterceptor.on("connection", (socket) => {
                socket.write("Hello there.");
                netInterceptor.stop();
            });
            await source.checkConnection();
            expect(source.connectionOK).to.be.true;
        }
    ));
});

describe('MusicCast State Handling', function() {

    it('Handles standby mode', withRequestInterception(
        [
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/main/getStatus`, () => {
                return HttpResponse.json({
                    power: 'standby',
                    response_code: 0
                }, { status: 200 });
            })
        ],
        async function () {
            const source = createSource();

            await source.buildInitData();
            source.connectionOK = true;
            await source.getRecentlyPlayed();
            expect(source.players.size).to.eq(0);
        }
    ));

    it('Handles valid netusb device playing state', withRequestInterception(
        [
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/main/getStatus`, () => {
                return HttpResponse.json({
                    power: 'on',
                    response_code: 0
                }, { status: 200 });
            }),
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/netusb/getPlayInfo`, () => {
                return HttpResponse.json({
                    device_status: 'ready',
                    playback: 'play',
                    play_time: 10,
                    total_time: 60,
                    artist: 'Test Artist',
                    album: 'Test Album',
                    track: 'Cool Track',
                    input: 'av1',
                    response_code: 0
                }, { status: 200 });
            }),
        ],
        async function () {
            const source = createSource();

            await source.buildInitData();
            source.connectionOK = true;
            await source.getRecentlyPlayed();
            expect(source.players.size).to.eq(1);
            const playerState = source.players.get(source.players.keys().next().value).getApiState();
            expect(playerState.play.data.album).to.eq('Test Album');
            expect(playerState.play.data.track).to.eq('Cool Track');
            expect(playerState.play.data.duration).to.eq(60);
            expect(playerState.play.meta.trackProgressPosition).to.eq(10);
            expect(playerState.play.meta.deviceId).to.eq('av1');
            expect(playerState.status.reported).to.eq(REPORTED_PLAYER_STATUSES.playing);
        }
    ));

    it('Handles valid cd device playing state', withRequestInterception(
        [
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/main/getStatus`, () => {
                return HttpResponse.json({
                    power: 'on',
                    response_code: 0
                }, { status: 200 });
            }),
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/netusb/getPlayInfo`, () => {
                return HttpResponse.json({
                    response_code: 100
                }, { status: 200 });
            }),
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/cd/getPlayInfo`, () => {
                return HttpResponse.json({
                    device_status: 'ready',
                    playback: 'play',
                    play_time: 10,
                    total_time: 60,
                    artist: 'Test Artist',
                    album: 'Test Album',
                    track: 'Cool Track',
                    response_code: 0
                }, { status: 200 });
            }),
        ],
        async function () {
            const source = createSource();

            await source.buildInitData();
            source.connectionOK = true;
            await source.getRecentlyPlayed();
            expect(source.players.size).to.eq(1);
            const playerState = source.players.get(source.players.keys().next().value).getApiState();
            expect(playerState.play.data.album).to.eq('Test Album');
            expect(playerState.play.data.track).to.eq('Cool Track');
            expect(playerState.play.data.duration).to.eq(60);
            expect(playerState.play.meta.trackProgressPosition).to.eq(10);
            expect(playerState.status.reported).to.eq(REPORTED_PLAYER_STATUSES.playing);
        }
    ));

    it('Handles non 200 status from getPlayInfo', withRequestInterception(
        [
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/main/getStatus`, () => {
                return HttpResponse.json({
                    power: 'on',
                    response_code: 0
                }, { status: 200 });
            }),
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/netusb/getPlayInfo`, () => {
                return HttpResponse.json({
                    response_code: 100
                }, { status: 500 });
            }),
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/cd/getPlayInfo`, () => {
                return HttpResponse.json({
                    device_status: 'ready',
                    playback: 'play',
                    play_time: 10,
                    total_time: 60,
                    artist: 'Test Artist',
                    album: 'Test Album',
                    track: 'Cool Track',
                    response_code: 0
                }, { status: 200 });
            }),
        ],
        async function () {
            const source = createSource();

            await source.buildInitData();
            source.connectionOK = true;
            await source.getRecentlyPlayed();
            expect(source.players.size).to.eq(1);
        }
    ));

    it('Handles stopped player', withRequestInterception(
        [
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/main/getStatus`, () => {
                return HttpResponse.json({
                    power: 'on',
                    response_code: 0
                }, { status: 200 });
            }),
            http.get(`http://${TEST_IP}/YamahaExtendedControl/v1/netusb/getPlayInfo`, () => {
                return HttpResponse.json({
                    device_status: 'ready',
                    playback: 'stop',
                    play_time: 10,
                    total_time: 60,
                    artist: 'Test Artist',
                    album: 'Test Album',
                    track: 'Cool Track',
                    input: 'av1',
                    response_code: 0
                }, { status: 200 });
            }),
        ],
        async function () {
            const source = createSource();

            await source.buildInitData();
            source.connectionOK = true;
            await source.getRecentlyPlayed();
            expect(source.players.size).to.eq(1);
            const playerState = source.players.get(source.players.keys().next().value).getApiState();
            expect(playerState.status.reported).to.eq(REPORTED_PLAYER_STATUSES.stopped);
        }
    ));

});