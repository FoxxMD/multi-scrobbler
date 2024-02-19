import {describe, it} from 'mocha';
import {assert} from 'chai';
import samplePayload from './playbackProgressSample.json';

import JellyfinSource from "../../sources/JellyfinSource.js";
import EventEmitter from "events";
import { getLogger } from "../../common/logging.js";
import { JsonPlayObject, PlayObject } from "../../../core/Atomic.js";

const dataAsFixture = (data: any): TestFixture => {
    return data as TestFixture;
}

interface TestFixture {
    data: any
    expected: JsonPlayObject
}

describe('Jellyfin Payload Parsing', function () {

    it('Should parse PlayProgress payload as PlayObject', async function () {
        const fixture = dataAsFixture(samplePayload[0]);
        const play = JellyfinSource.formatPlayObj(fixture.data);

        assert.equal(play.data.track, fixture.expected.data.track);
        assert.equal(play.meta.mediaType, 'Audio');
    });

    describe('Correctly detects events as valid/invalid', function () {

        const jfSource = new JellyfinSource('Test', {data: {}}, {localUrl: 'test', configDir: 'test', logger: getLogger({}, 'noop')}, new EventEmitter());

        it('Should parse PlayProgress with Audio ItemType as valid event', async function () {
            const fixture = dataAsFixture(samplePayload[0]);
            const play = JellyfinSource.formatPlayObj(fixture.data);

            assert.isTrue(jfSource.isValidEvent(play))
            await jfSource.destroy();
        });
    });
});
