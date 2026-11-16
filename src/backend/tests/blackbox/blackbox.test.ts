import { expect } from 'chai';
import { describe, it } from 'mocha';
import EventEmitter from 'events';
import { readFile } from 'node:fs/promises';
import { resolve } from 'path';
import { loggerNoop } from '../../common/MaybeLogger.ts';
import { projectRootDir } from '../../common/infrastructure/Atomic.ts';
import { blackboxNowPlayingPayloadSchema, blackboxScrobblePayloadSchema } from '../../common/infrastructure/config/client/blackbox.ts';
import BlackboxScrobbler from '../../scrobblers/BlackboxScrobbler.ts';
import { generatePlay, generateSourcePlayerObj } from '../../../core/tests/utils/PlayTestUtils.ts';
import { toPublicPlay, toPublicPlayer } from '../../../core/PlayJsonSchema.ts';

const examplesDir = resolve(projectRootDir, 'docsite/src/content/docs/configuration/clients/_blackbox');
const readExample = async (name: string) => JSON.parse(await readFile(resolve(examplesDir, name), 'utf8'));
// zod objects strip unknown keys, so output only equals input when every key is known to the schema
const jsonRoundTrip = (data: unknown) => JSON.parse(JSON.stringify(data));

describe('Blackbox Payloads', function () {

    it('docs scrobble example matches schema', async function () {
        const example = await readExample('scrobble.json');
        expect(blackboxScrobblePayloadSchema.parse(example)).to.deep.eq(example);
    });

    it('docs now playing example matches schema', async function () {
        const example = await readExample('nowPlaying.json');
        expect(blackboxNowPlayingPayloadSchema.parse(example)).to.deep.eq(example);
    });

    it('scrobble payload sent by client matches schema', async function () {
        const client = new BlackboxScrobbler('test', {name: 'test', id: 'test', data: {endpoint: 'http://localhost'}}, {}, new EventEmitter(), loggerNoop);
        const payload = jsonRoundTrip(client.playToClientPayload(generatePlay({}, {}, {listenRanges: true, playDateCompleted: true})));
        expect(blackboxScrobblePayloadSchema.parse(payload)).to.deep.eq(payload);
    });

    it('now playing payload sent by client matches schema', async function () {
        const payload = jsonRoundTrip({type: 'nowPlaying', play: generateSourcePlayerObj({playOpts: {}})});
        expect(blackboxNowPlayingPayloadSchema.parse(payload)).to.deep.eq(payload);
    });

    it('redacts internal properties from Play and Player', async function () {
        const play = generatePlay({}, {deviceId: 'device1', comment: 'secret', sourceSOT: 'player', lifecycleInputs: [{type: 'x', input: 'y'}], url: {web: 'https://example.com', internal: 'leak'} as any});
        play.id = 123;
        play.lifecycle = [];
        play.data.meta = {brainz: {trackNumber: 1}};

        const pub = toPublicPlay(play) as Record<string, any>;
        expect(pub).to.not.have.any.keys('id', 'lifecycle', 'original', 'scrobble');
        expect(pub.data).to.not.have.key('meta');
        expect(pub.meta).to.not.have.any.keys('comment', 'sourceSOT', 'lifecycleInputs');
        expect(pub.meta.url).to.not.have.key('internal');
        expect(pub.data.playDate).to.be.a('string');

        const player = toPublicPlayer({...generateSourcePlayerObj({play}), nowPlayingMode: true}) as Record<string, any>;
        expect(player).to.not.have.key('nowPlayingMode');
        expect(player.play).to.deep.eq(pub);
    });
});
