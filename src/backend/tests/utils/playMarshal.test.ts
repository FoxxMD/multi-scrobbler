import { expect } from 'chai';
import dayjs from 'dayjs';
import { describe, it } from 'mocha';
import { asJsonPlayObject, asPlay } from '../../../core/PlayMarshalUtils.ts';
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from '../../../core/tests/utils/fixtures.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';

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
});
