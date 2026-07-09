import { assert } from 'chai';
import { describe, it } from 'mocha';
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from "../../../core/tests/utils/fixtures.ts";

describe('#PlayFixtures', function () {

    it('Generates a Play with lifecycle', async function () {
        await assert.isFulfilled(playWithLifecycleScrobble(generatePlayWithLifecycle()))
    });

});