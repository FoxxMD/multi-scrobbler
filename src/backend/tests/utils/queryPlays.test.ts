import { expect } from 'chai';
import dayjs from 'dayjs';
import { describe, it } from 'mocha';
import qs from 'qs';
import { queryPlaysRequestSchema, type CompareDateBetween, type QueryPlaysOptsJson } from '../../../core/Api.ts';
import { qsOptions } from '../../../core/Atomic.ts';

const parseQueryString = (query: object) => queryPlaysRequestSchema.parse(qs.parse(qs.stringify(query), qsOptions));

describe('Plays Query', function () {

    it('parses a query string', function () {
        const query: QueryPlaysOptsJson = {
            limit: 50,
            offset: 100,
            state: ['queued', 'failed'],
            playedAt: {type: 'between', range: ['2026-11-01T00:00:00.000Z', '2026-11-18T00:00:00.000Z'], inclusive: false},
            queues: [{queueName: 'ingress', queueStatus: ['queued', 'failed'], retries: 2}],
        };
        const parsed = parseQueryString(query);
        expect(parsed.limit).to.eq(50);
        expect(parsed.offset).to.eq(100);
        expect(parsed.queues![0].retries).to.eq(2);
        const playedAt = parsed.playedAt as CompareDateBetween;
        expect(dayjs.isDayjs(playedAt.range[0])).to.be.true;
        expect(playedAt.inclusive).to.be.false;
    });

    it('does not accept a componentId', function () {
        expect(parseQueryString({componentId: 2})).to.not.have.property('componentId');
    });

    it('rejects an invalid date', function () {
        expect(() => parseQueryString({seenAt: {type: 'gte', date: 'yesterday'}})).to.throw();
    });
});
