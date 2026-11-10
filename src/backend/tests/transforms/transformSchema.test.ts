import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as z from 'zod';
import {
    applyTermSchema,
    buildPlayTransformSchema,
    buildRulesSchema,
    buildStageSchema,
    searchReplaceTermSchema,
    whenSchema,
} from '../../../core/Transform.ts';

describe('Transform Schemas', function () {

    describe('when', function () {
        it('normalizes a single condition to an array', function () {
            expect(whenSchema.parse({artists: 'foo'})).to.eql([{artists: 'foo'}]);
        });
        it('keeps an array of conditions', function () {
            expect(whenSchema.parse([{artists: 'foo'}, {title: 'bar'}])).to.eql([{artists: 'foo'}, {title: 'bar'}]);
        });
        it('rejects non-string condition values', function () {
            expect(whenSchema.safeParse({title: 1}).success).to.be.false;
        });
    });

    describe('search and replace term', function () {
        it('normalizes a string to search with empty replace', function () {
            expect(searchReplaceTermSchema.parse('foo')).to.eql({search: 'foo', replace: ''});
        });
        it('normalizes nested when', function () {
            expect(searchReplaceTermSchema.parse({search: 'foo', replace: 'bar', when: {title: 'baz'}})).to.eql({search: 'foo', replace: 'bar', when: [{title: 'baz'}]});
        });
        it('is idempotent', function () {
            const once = searchReplaceTermSchema.parse({search: 'foo', replace: 'bar', when: {title: 'baz'}});
            expect(searchReplaceTermSchema.parse(once)).to.eql(once);
        });
    });

    describe('apply term', function () {
        it('accepts boolean', function () {
            expect(applyTermSchema.parse(false)).to.eql(false);
        });
        it('normalizes when', function () {
            expect(applyTermSchema.parse({when: {title: 'foo'}})).to.eql({when: [{title: 'foo'}]});
        });
        it('rejects arrays', function () {
            expect(applyTermSchema.safeParse([]).success).to.be.false;
        });
    });

    describe('rules', function () {
        it('uses defaults only for specified parts', function () {
            const rules = buildRulesSchema(applyTermSchema, {title: true}).parse({album: false});
            expect(rules.title).to.eql(true);
            expect(rules.album).to.eql(false);
            expect(rules.artists).to.be.undefined;
        });
    });

    describe('hooks', function () {
        const stage = buildStageSchema('test', buildRulesSchema(applyTermSchema, {title: true}), z.object({foo: z.string().optional()}));
        const schema = buildPlayTransformSchema(z.discriminatedUnion('type', [stage]));

        it('normalizes a single stage to an array', function () {
            const res = schema.parse({preCompare: {type: 'test', foo: 'bar'}});
            expect(res.preCompare).to.eql([{type: 'test', foo: 'bar', title: true}]);
        });
        it('normalizes stage type case', function () {
            const res = schema.parse({compare: {candidate: [{type: ' Test '}]}});
            expect(res.compare?.candidate?.[0].type).to.eql('test');
        });
        it('rejects unknown stage type', function () {
            expect(schema.safeParse({postCompare: [{type: 'nope'}]}).success).to.be.false;
        });
        it('generates input json schema', function () {
            expect(() => z.toJSONSchema(schema, {io: 'input'})).to.not.throw();
        });
    });
});
