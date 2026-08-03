import {expect} from 'chai';
import {afterEach, describe, it} from 'mocha';
import MockDate from 'mockdate';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import EventEmitter from 'events';
import { http, HttpResponse } from 'msw';
import { REPORTED_PLAYER_STATUSES } from '../../../core/Atomic.ts';
import type {PlayerStateDataMaybePlay} from '../../common/infrastructure/Atomic.ts';
import type {SubSonicSourceConfig} from '../../common/infrastructure/config/source/subsonic.ts';
import { UpstreamError } from '../../common/errors/UpstreamError.ts';
import {isSubsonicNowPlayingExpired, SubsonicSource} from '../../sources/SubsonicSource.ts';
import { SubsonicPlayerState } from '../../sources/PlayerState/SubsonicPlayerState.ts';
import { withRequestInterception } from '../utils/networking.ts';

class TestSubsonicSource extends SubsonicSource {

    // Prevent mocked timestamps during tests to be interpreted as seek, by increasing the allowed drift range
    getNewPlayer = (...[logger, id, opts]: Parameters<SubsonicSource['getNewPlayer']>) => new SubsonicPlayerState(logger, id, {
        ...opts,
        allowedDrift: 30_000
    });

    // make protected method available for tests
    doCheckConnection(): Promise<true | string | undefined> {
        return super.doCheckConnection();
    }

    // make protected method available for tests
    filterNowPlaying(entries: PlayerStateDataMaybePlay[]): PlayerStateDataMaybePlay[] {
        return this.filterExpiredNowPlaying(entries);
    }
}

const entry = (minutesAgo: number, duration = 180, playback: Record<string, unknown> = {}) => ({
    id: 'track-id',
    title: 'Track',
    album: 'Album',
    artist: 'Artist',
    duration,
    minutesAgo,
    playerId: 'player-id',
    username: 'user',
    ...playback
});

const formatPlay = (...args: Parameters<typeof SubsonicSource.formatPlayObj>) => SubsonicSource.formatPlayObj(...args).play!;

const createSource = (detectStaleNowPlayingFromMinutesAgo?: boolean) => {
    const config: SubSonicSourceConfig = {
        id: `test-${Date.now()}`,
        data: {
            url: 'https://example.com',
            user: 'user',
            password: 'password',
            detectStaleNowPlayingFromMinutesAgo
        },
        // Network-error tests opt out of backoff unless they explicitly test retries.
        options: {maxRequestRetries: 0}
    };
    const source = new TestSubsonicSource('test', config, {
        localUrl: new URL('https://example.com'),
        configDir: 'test',
        logger: loggerTest,
        version: 'test'
    }, new EventEmitter());
    source.scheduler.stop();
    return source;
};

describe('Subsonic now-playing expiration', () => {
    afterEach(() => MockDate.reset());

    it('derives the play start from minutesAgo with minute precision', () => {
        MockDate.set('2026-01-01T12:05:30Z');

        const play = formatPlay(entry(3));

        expect(play.data.playDate.isSame(dayjs('2026-01-01T12:02:00Z'))).to.be.true;
    });

    it('keeps a now-playing row within the track duration and tolerance', () => {
        MockDate.set('2026-01-01T12:05:30Z');

        const play = formatPlay(entry(3));

        expect(isSubsonicNowPlayingExpired(play)).to.be.false;
    });

    it('expires a lingering now-playing row older than duration plus tolerance', () => {
        MockDate.set('2026-01-01T12:05:30Z');

        const play = formatPlay(entry(4));

        expect(isSubsonicNowPlayingExpired(play)).to.be.true;
    });

    it('expires only after the duration plus minute precision and playback tolerance', () => {
        const play = formatPlay(entry(0));
        const expiresAt = play.data.playDate!.add(249, 'second');

        expect(isSubsonicNowPlayingExpired(play, expiresAt)).to.be.false;
        expect(isSubsonicNowPlayingExpired(play, expiresAt.add(1, 'second'))).to.be.true;
    });

    it('adds five percent to the minute precision tolerance for long tracks', () => {
        const play = formatPlay(entry(0, 1800));
        const expiresAt = play.data.playDate!.add(1950, 'second');

        expect(isSubsonicNowPlayingExpired(play, expiresAt)).to.be.false;
        expect(isSubsonicNowPlayingExpired(play, expiresAt.add(1, 'second'))).to.be.true;
    });

    it('does not expire a track which started late in the reported minute', () => {
        MockDate.set('2026-01-01T12:04:57Z');

        const play = formatPlay(entry(3, 184));

        expect(play.data.playDate.isSame(dayjs('2026-01-01T12:01:00Z'))).to.be.true;
        expect(isSubsonicNowPlayingExpired(play)).to.be.false;
    });

    it('accepts a reset minutesAgo value for a repeated track', () => {
        MockDate.set('2026-01-01T12:10:30Z');

        expect(isSubsonicNowPlayingExpired(formatPlay(entry(8)))).to.be.true;
        expect(isSubsonicNowPlayingExpired(formatPlay(entry(0)))).to.be.false;
    });

    it('filters expired now-playing rows by default', () => {
        MockDate.set('2026-01-01T12:05:30Z');
        const source = createSource();

        expect(source.filterNowPlaying([SubsonicSource.formatPlayObj(entry(4))])).to.be.empty;
    });

    it('filters expired now-playing rows when detecting stale entries is enabled by configuration', () => {
        MockDate.set('2026-01-01T12:05:30Z');
        const source = createSource(true);

        expect(source.filterNowPlaying([SubsonicSource.formatPlayObj(entry(4))])).to.be.empty;
    });

    it('keeps expired now-playing rows when minutesAgo detection is disabled', () => {
        MockDate.set('2026-01-01T12:05:30Z');
        const source = createSource(false);

        expect(source.filterNowPlaying([SubsonicSource.formatPlayObj(entry(4))])).to.have.length(1);
    });

    it('uses minutesAgo expiration only when no playback report fields are present', () => {
        MockDate.set('2026-01-01T12:05:30Z');
        const source = createSource();
        const stale = entry(4);

        expect(source.filterNowPlaying([
            SubsonicSource.formatPlayObj(stale),
            SubsonicSource.formatPlayObj({...stale, state: 'playing'}),
            SubsonicSource.formatPlayObj({...stale, positionMs: 0})
        ])).to.have.length(2);
    });

    it('retains a state without a play safely', () => {
        const source = createSource();
        const state: PlayerStateDataMaybePlay = {platformId: ['player-id', 'user']};

        expect(source.filterNowPlaying([state])).to.deep.equal([state]);
    });
});

describe('Subsonic playback reports', () => {
    it('formats playback reports as player state data', () => {
        const state = SubsonicSource.formatPlayObj(entry(0, 180, {
            state: 'playing',
            positionMs: 12345
        }));

        expect(state.platformId).to.deep.equal(['player-id', 'user']);
        expect(state.play!.data.track).to.equal('Track');
        expect(state.status).to.equal(REPORTED_PLAYER_STATUSES.playing);
        expect(state.position).to.equal(12.345);
        expect(state.play.meta.trackProgressPosition).to.equal(12.345);
    });

    for (const [reportedState, expectedStatus] of [
        ['playing', REPORTED_PLAYER_STATUSES.playing],
        ['paused', REPORTED_PLAYER_STATUSES.paused],
        ['stopped', REPORTED_PLAYER_STATUSES.stopped],
        ['starting', REPORTED_PLAYER_STATUSES.unknown],
        ['unrecognized', REPORTED_PLAYER_STATUSES.unknown]
    ] as const) {
        it(`normalizes ${reportedState} playback report status`, () => {
            const state = SubsonicSource.formatPlayObj(entry(0, 180, {state: reportedState}));

            expect(state.status).to.equal(expectedStatus);
        });
    }

    it('omits unavailable playback report fields', () => {
        const state = SubsonicSource.formatPlayObj(entry(0));

        expect(state).not.to.have.property('status');
        expect(state).not.to.have.property('position');
    });
});

describe('Subsonic player tracking', () => {
    const at = (seconds: number) => dayjs('2026-01-01T12:00:00Z').add(seconds, 'second');
    const state = (seconds: number, playback: Record<string, unknown> = {}) => ({
        ...SubsonicSource.formatPlayObj(entry(0, 60, playback)),
        stateUpdatedAt: at(seconds)
    });
    const player = (source: TestSubsonicSource) => Array.from(source.players.values())[0];

    it('tracks positionless legacy playback using timestamps', async () => {
        const source = createSource();

        await source.processRecentPlays([state(0)], at(0));
        await source.processRecentPlays([state(10)], at(10));

        expect(player(source).getPlayedObject()!.data.listenedFor).to.equal(10);
    });

    it('tracks reported playback using position deltas', async () => {
        const source = createSource();

        await source.processRecentPlays([state(0, {state: 'playing', positionMs: 0})], at(0));
        await source.processRecentPlays([state(10, {state: 'playing', positionMs: 10000})], at(10));
        await source.processRecentPlays([state(20, {state: 'playing', positionMs: 10000})], at(20));

        expect(player(source).getPlayedObject()!.data.listenedFor).to.equal(10);
    });

    it('ends a timestamp range before switching to reported positions', async () => {
        const source = createSource();

        await source.processRecentPlays([state(0)], at(0));
        await source.processRecentPlays([state(10)], at(10));
        await source.processRecentPlays([state(20, {state: 'playing', positionMs: 100000})], at(20));
        await source.processRecentPlays([state(30, {state: 'playing', positionMs: 110000})], at(30));

        expect(player(source).getPlayedObject()!.data.listenedFor).to.equal(20);
    });

    it('ends a reported-position range before switching to timestamps', async () => {
        const source = createSource();

        await source.processRecentPlays([state(0, {state: 'playing', positionMs: 0})], at(0));
        await source.processRecentPlays([state(10, {state: 'playing', positionMs: 10000})], at(10));
        await source.processRecentPlays([state(20)], at(20));
        await source.processRecentPlays([state(30)], at(30));

        expect(player(source).getPlayedObject()!.data.listenedFor).to.equal(20);
    });

    it('does not apply the legacy repeat fallback to positioned playback', async () => {
        const source = createSource();

        await source.processRecentPlays([state(0, {state: 'playing', positionMs: 0})], at(0));
        await source.processRecentPlays([state(64, {state: 'playing', positionMs: 64000})], at(64));
        const plays = await source.processRecentPlays([state(65, {state: 'playing', positionMs: 65000})], at(65));

        expect(plays).to.be.empty;
        expect(player(source).getPlayedObject()!.data.repeat).to.be.false;
    });

    it('supports timestamp ranges when realtime position tracking is enabled', () => {
        const playerState = new SubsonicPlayerState(loggerTest, ['player-id', 'user'], {rtTruth: true});

        playerState.update(state(0), at(0));

        expect(() => playerState.getPosition()).not.to.throw();
        expect(playerState.getPosition()).to.be.undefined;
    });
});

describe('Subsonic playback report capability discovery', () => {
    const pingResponse = {
        'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
            type: 'OpenSubsonic',
            serverVersion: '1.0.0',
            openSubsonic: true
        }
    };
    const ping = () => http.get('https://example.com/rest/ping', () => HttpResponse.json(pingResponse));
    const extensions = (openSubsonicExtensions: {name: string, versions: number[]}[]) => http.get('https://example.com/rest/getOpenSubsonicExtensions', () => HttpResponse.json({
        'subsonic-response': {
            ...pingResponse['subsonic-response'],
            openSubsonicExtensions
        }
    }));

    it('discovers playback report version 1 support', withRequestInterception([
        ping(),
        extensions([{name: 'playbackReport', versions: [1]}])
    ], async () => {
        const source = createSource();

        expect(await source.doCheckConnection()).to.be.true;
        expect(source.playbackReportSupported).to.be.true;
    }));

    it(`does not enable playback report support when it is not advertised by the server`, withRequestInterception([
        ping(),
        extensions([])
    ], async () => {
        const source = createSource();

        expect(await source.doCheckConnection()).to.be.true;
        expect(source.playbackReportSupported).to.be.false;
    }));

    it('retries a transient extension probe failure', function() {
        this.timeout(3000);
        let attempts = 0;
        return withRequestInterception([
            ping(),
            http.get('https://example.com/rest/getOpenSubsonicExtensions', () => {
                attempts += 1;
                if (attempts === 1) {
                    return new HttpResponse(null, {status: 500});
                }
                return HttpResponse.json({
                    'subsonic-response': {
                        ...pingResponse['subsonic-response'],
                        openSubsonicExtensions: [{name: 'playbackReport', versions: [1]}]
                    }
                });
            })
        ], async () => {
            const source = createSource();
            source.config.options.maxRequestRetries = 1;

            expect(await source.doCheckConnection()).to.be.true;
            expect(attempts).to.equal(2);
            expect(source.playbackReportSupported).to.be.true;
        })();
    });

    for (const [description, extensionResponse] of [
        ['returns HTTP 404', () => new HttpResponse(null, {status: 404})],
        ['returns a failed Subsonic envelope', () => HttpResponse.json({'subsonic-response': {...pingResponse['subsonic-response'], status: 'failed', error: {code: 70, message: 'unsupported'}}})],
        ['returns malformed non-JSON content', () => HttpResponse.text('not json')],
        ['returns HTTP 500', () => new HttpResponse(null, {status: 500})]
    ] as const) {
        it(`continues when the extension probe ${description}`, withRequestInterception([
            ping(),
            http.get('https://example.com/rest/getOpenSubsonicExtensions', extensionResponse)
        ], async () => {
            const source = createSource();

            expect(await source.doCheckConnection()).to.be.true;
            expect(source.playbackReportSupported).to.be.false;
        }));
    }

    it('does not probe extensions after a bare HTTP 500 ping failure', withRequestInterception([
        http.get('https://example.com/rest/ping', () => new HttpResponse(null, {status: 500})),
        http.get('https://example.com/rest/getOpenSubsonicExtensions', () => {
            throw new Error('Extensions must not be probed after a bare HTTP ping failure');
        })
    ], async () => {
        const source = createSource();
        source.config.options.maxRequestRetries = 0;
        let error: unknown;

        try {
            await source.doCheckConnection();
        } catch (e) {
            error = e;
        }

        expect(error).to.be.instanceOf(UpstreamError);
        expect(source.playbackReportSupported).to.be.false;
    }));

    it('treats a failed Subsonic ping envelope as reachable and probes extensions', withRequestInterception([
        http.get('https://example.com/rest/ping', () => HttpResponse.json({
            'subsonic-response': {
                ...pingResponse['subsonic-response'],
                status: 'failed',
                error: {code: 40, message: 'Invalid credentials'}
            }
        })),
        extensions([{name: 'playbackReport', versions: [1]}])
    ], async () => {
        const source = createSource();

        expect(await source.doCheckConnection()).to.be.true;
        expect(source.playbackReportSupported).to.be.true;
    }));

    it('continues after a failed Subsonic ping envelope when the extension probe returns HTTP 404', withRequestInterception([
        http.get('https://example.com/rest/ping', () => HttpResponse.json({
            'subsonic-response': {
                ...pingResponse['subsonic-response'],
                status: 'failed',
                error: {code: 40, message: 'Invalid credentials'}
            }
        })),
        http.get('https://example.com/rest/getOpenSubsonicExtensions', () => new HttpResponse(null, {status: 404}))
    ], async () => {
        const source = createSource();

        expect(await source.doCheckConnection()).to.be.true;
        expect(source.playbackReportSupported).to.be.false;
    }));
});
