import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import clone from "clone";
import { describe, it } from 'mocha';
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from "../../../core/tests/utils/fixtures.js";

describe('#PlayFixtures', function () {

    it('Generates a Play with lifecycle', async function () {
        await assert.isFulfilled(playWithLifecycleScrobble(generatePlayWithLifecycle()))
    });

});