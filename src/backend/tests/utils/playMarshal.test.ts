import { expect } from 'chai';
import dayjs from 'dayjs';
import { describe, it } from 'mocha';
import { asJsonPlayObject, asPlay } from '../../../core/PlayMarshalUtils.ts';
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from '../../../core/tests/utils/fixtures.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { statefulInvariantTransform } from '../../../core/PlayUtils.ts';
import { playEventSchema } from '../../../core/PlayEvent.ts';
import { scrobbleToPlayEvent, stateChangeToPlayEvent } from '../../common/database/drizzle/entityUtils.ts';

describe('Play Marshalling', function () {

    it('round trips a Play through JSON', async function () {
        const play = await playWithLifecycleScrobble(generatePlayWithLifecycle());
        play.data = {...play.data, ...generatePlay({}, {}, {listenRanges: true, playDateCompleted: true}).data};

        const json = JSON.parse(JSON.stringify(asJsonPlayObject(play)));
        expect(json.data.playDate).to.be.a('string');
        expect(json.data.listenRanges[0].start.timestamp).to.be.a('string');
        expect(json.scrobble.createdAt).to.be.a('string');

        const decoded = asPlay(json);
        expect(dayjs.isDayjs(decoded.data.playDate)).to.be.true;
        expect(dayjs.isDayjs(decoded.data.listenRanges![0].start.timestamp)).to.be.true;
        expect(dayjs.isDayjs(decoded.meta.seenAt)).to.be.true;
        expect(dayjs.isDayjs(decoded.scrobble!.createdAt)).to.be.true;
        expect(asJsonPlayObject(decoded)).to.deep.eq(json);
    });

    it('converts dates in nested plays and leaves raw Source data untouched', async function () {
        const play = await playWithLifecycleScrobble(generatePlayWithLifecycle());
        play.original = {data: {releaseDate: '2020-01-01T00:00:00Z'}, play: statefulInvariantTransform(generatePlay())};
        play.scrobble!.match!.closestMatchedPlay = statefulInvariantTransform(generatePlay(), true);

        const json = JSON.parse(JSON.stringify(asJsonPlayObject(play)));
        expect(json.original.play.data.playDate).to.be.a('string');

        const decoded = asPlay(json);
        expect(dayjs.isDayjs(decoded.original!.play!.data.playDate)).to.be.true;
        expect(dayjs.isDayjs(decoded.scrobble!.mergedScrobble!.data.playDate)).to.be.true;
        expect(dayjs.isDayjs(decoded.scrobble!.match!.closestMatchedPlay!.data.playDate)).to.be.true;
        expect((decoded.original!.data as Record<string, unknown>).releaseDate).to.eq('2020-01-01T00:00:00Z');
        expect(decoded.lifecycle).to.deep.eq(json.lifecycle);
    });

    it('does not mutate the Play when encoding', async function () {
        const play = await playWithLifecycleScrobble(generatePlayWithLifecycle());
        asJsonPlayObject(play);
        expect(dayjs.isDayjs(play.scrobble!.createdAt)).to.be.true;
    });

    it('keeps unknown keys', function () {
        const json = {...asJsonPlayObject(generatePlay()), extra: 1};
        json.meta = {...json.meta, foo: 'bar'} as typeof json.meta;
        json.data = {...json.data, isrc: '123'} as typeof json.data;
        const decoded = asPlay(json) as Record<string, any>;
        expect(decoded.extra).to.eq(1);
        expect(decoded.meta.foo).to.eq('bar');
        expect(decoded.data.isrc).to.eq('123');
    });

    it('throws on an invalid date', function () {
        const json = asJsonPlayObject(generatePlay());
        json.data.playDate = 'not a date';
        expect(() => asPlay(json)).to.throw();
    });

    it('round trips Play Events through JSON', async function () {
        const play = await playWithLifecycleScrobble(generatePlayWithLifecycle());
        const events = [
            {...scrobbleToPlayEvent(play.scrobble!), playId: 1},
            {...stateChangeToPlayEvent({state: 'scrobbled'}), playId: 1, createdAt: dayjs()},
        ];
        const json = JSON.parse(JSON.stringify(playEventSchema.array().encode(events)));
        const decoded = playEventSchema.array().decode(json);
        const [scrobbleEvent, stateEvent] = decoded;
        expect(scrobbleEvent.eventName).to.eq('scrobbleResult');
        expect(dayjs.isDayjs(scrobbleEvent.eventName === 'scrobbleResult' && scrobbleEvent.data.createdAt)).to.be.true;
        expect(dayjs.isDayjs(stateEvent.createdAt)).to.be.true;
        expect(playEventSchema.array().encode(decoded)).to.deep.eq(json);
    });

    it('rejects an unknown Play Event', function () {
        expect(() => playEventSchema.decode({playId: 1, eventName: 'nope', data: {}} as never)).to.throw();
    });
});
