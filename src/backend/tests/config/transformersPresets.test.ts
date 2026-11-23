import { loggerTest } from "@foxxmd/logging";
import { expect } from 'chai';
import { describe, it } from 'mocha';
import createRoot, { parseTransformersPresets } from "../../ioc.ts";

describe('Transformers Presets', function () {

    it('keeps valid presets and drops invalid ones', function () {
        const presets = parseTransformersPresets({
            single: {type: 'native'},
            list: [{type: 'user', title: ['(Remastered)']}, {type: 'musicbrainz'}],
            noType: {title: ['x']},
            badType: [{type: 'nope'}],
            empty: [],
        }, loggerTest);
        expect(Object.keys(presets)).eql(['single', 'list']);
        expect(presets.list).eql([{type: 'user', title: ['(Remastered)']}, {type: 'musicbrainz'}]);
    });

    it('ignores presets that are not an object of names', function () {
        expect(parseTransformersPresets([{type: 'native'}], loggerTest)).eql({});
    });

    it('exposes parsed presets on the root container', function () {
        const root = createRoot({logger: loggerTest, transformersPresets: {ok: {type: 'native'}, bad: 1}});
        expect(root.items.transformersPresets).eql({ok: {type: 'native'}});
    });
});
