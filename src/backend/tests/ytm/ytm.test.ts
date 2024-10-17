import { after, before, describe, it } from 'mocha';
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { Innertube, UniversalCache, Parser, YTNodes, IBrowseResponse } from 'youtubei.js';
import { ytiHistoryResponseFromShelfToPlays, ytiHistoryResponseToListItems } from "../../sources/YTMusicSource.js";
import ytHistoryRes from './ytres.json';

chai.use(asPromised);

describe('Parses History', function () {

    it(`Parses a history response to tracks`, async function () {
        const items = ytiHistoryResponseToListItems(ytHistoryRes);
        expect(items).length(10);
    });

    it(`Parses a history response plays with shelf name`, async function () {
        const items = ytiHistoryResponseFromShelfToPlays(ytHistoryRes);
        expect(items[0]?.meta?.comment).to.eq('March 2023');
    });
});
