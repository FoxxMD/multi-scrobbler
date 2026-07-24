import {expect} from 'chai';
import {afterEach, describe, it} from 'mocha';
import MockDate from 'mockdate';
import dayjs from 'dayjs';
import {isSubsonicNowPlayingExpired, SubsonicSource} from '../../sources/SubsonicSource.ts';

const entry = (minutesAgo: number, duration = 180) => ({
    id: 'track-id',
    title: 'Track',
    album: 'Album',
    artist: 'Artist',
    duration,
    minutesAgo,
    playerId: 'player-id',
    username: 'user'
});

describe('Subsonic now-playing expiration', () => {
    afterEach(() => MockDate.reset());

    it('derives the play start from minutesAgo with minute precision', () => {
        MockDate.set('2026-01-01T12:05:30Z');

        const play = SubsonicSource.formatPlayObj(entry(3));

        expect(play.data.playDate.isSame(dayjs('2026-01-01T12:02:00Z'))).to.be.true;
    });

    it('keeps a now-playing row within the track duration and tolerance', () => {
        MockDate.set('2026-01-01T12:05:30Z');

        const play = SubsonicSource.formatPlayObj(entry(3));

        expect(isSubsonicNowPlayingExpired(play)).to.be.false;
    });

    it('expires a lingering now-playing row older than duration plus tolerance', () => {
        MockDate.set('2026-01-01T12:05:30Z');

        const play = SubsonicSource.formatPlayObj(entry(4));

        expect(isSubsonicNowPlayingExpired(play)).to.be.true;
    });

    it('expires only after the duration plus minute precision and playback tolerance', () => {
        const play = SubsonicSource.formatPlayObj(entry(0));
        const expiresAt = play.data.playDate!.add(249, 'second');

        expect(isSubsonicNowPlayingExpired(play, expiresAt)).to.be.false;
        expect(isSubsonicNowPlayingExpired(play, expiresAt.add(1, 'second'))).to.be.true;
    });

    it('adds five percent to the minute precision tolerance for long tracks', () => {
        const play = SubsonicSource.formatPlayObj(entry(0, 1800));
        const expiresAt = play.data.playDate!.add(1950, 'second');

        expect(isSubsonicNowPlayingExpired(play, expiresAt)).to.be.false;
        expect(isSubsonicNowPlayingExpired(play, expiresAt.add(1, 'second'))).to.be.true;
    });

    it('does not expire a track which started late in the reported minute', () => {
        MockDate.set('2026-01-01T12:04:57Z');

        const play = SubsonicSource.formatPlayObj(entry(3, 184));

        expect(play.data.playDate.isSame(dayjs('2026-01-01T12:01:00Z'))).to.be.true;
        expect(isSubsonicNowPlayingExpired(play)).to.be.false;
    });

    it('accepts a reset minutesAgo value for a repeated track', () => {
        MockDate.set('2026-01-01T12:10:30Z');

        expect(isSubsonicNowPlayingExpired(SubsonicSource.formatPlayObj(entry(8)))).to.be.true;
        expect(isSubsonicNowPlayingExpired(SubsonicSource.formatPlayObj(entry(0)))).to.be.false;
    });
});
