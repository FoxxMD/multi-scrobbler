import { loggerTest, loggerDebug } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import EventEmitter from "events";
import { after, before, describe, it } from 'mocha';
import pEvent from "p-event";
import { PlayObject } from "../../../core/Atomic.js";
import { generatePlay } from "../utils/PlayTestUtils.js";
import { TestSource } from "./TestSource.js";

chai.use(asPromised);


const emitter = new EventEmitter();
const generateSource = () => {
    return new TestSource('spotify', 'test', {}, {localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test'},  emitter);
}
let source: TestSource = generateSource();

describe('Sources use transform plays correctly', function () {

    beforeEach(function() {
        source = generateSource();
    });

    it('Transforms play on preCompare', function() {
        source.config.options = {
            playTransform: {
                preCompare: {
                    title: [
                        {
                            search: 'cool',
                            replace: 'fun'
                        }
                    ]
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my cool track'
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my fun track');
    });

    it('Transforms play on postCompare', async function() {
        source.config.options = {
            playTransform: {
                postCompare: {
                    title: [
                        {
                            search: 'cool',
                            replace: 'fun'
                        }
                    ]
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my cool track'
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my cool track');

        const pAwaiter =  pEvent(source.emitter, 'discoveredToScrobble') as Promise<{data: [PlayObject] }>;
        source.handle(discovered);
        const e = await pAwaiter;
        expect(e.data.length).is.eq(1);
        expect(e.data[0].data.track).is.eq('my fun track');
    });

    it('Transforms play existing comparison', function() {
        source.config.options = {
            playTransform: {
                compare: {
                    existing: {
                        title: [
                            {
                                search: 'hugely cool and very different track',
                                replace: 'fun'
                            }
                        ]
                    }
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my hugely cool and very different track title',
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my hugely cool and very different track title');

        expect(source.discover([newScrobble]).length).is.eq(1);
    });

    it('Transforms play candidate comparison', function() {
        source.config.options = {
            playTransform: {
                compare: {
                    candidate: {
                        title: [
                            {
                                search: 'hugely cool and very different track',
                                replace: 'fun'
                            }
                        ]
                    }
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my hugely cool and very different track title',
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my hugely cool and very different track title');

        expect(source.discover([newScrobble]).length).is.eq(1);
    });
})
