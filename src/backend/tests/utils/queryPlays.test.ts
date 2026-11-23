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

    it('parses a query with every filter', function () {
        const states: QueryPlaysOptsJson['state'] = ['queued', 'discovered', 'discarded', 'scrobbled', 'failed', 'duped'];
        const queue = {queueStatus: ['queued', 'failed', 'completed'], retries: 1} satisfies Omit<NonNullable<QueryPlaysOptsJson['queues']>[number], 'queueName'>;
        const range: CompareDateBetween<string> = {type: 'between', range: ['2026-11-01T00:00:00.000Z', '2026-11-18T00:00:00.000Z'], inclusive: true};
        const parsed = parseQueryString({
            state: states, stateNot: states, seenAt: range, playedAt: range,
            queues: [{queueName: 'ingress', ...queue}, {queueName: 'dead', ...queue}],
            with: ['input', 'parent', 'parent-input', 'queues', 'events', 'children'],
            uid: Array.from({length: 20}, (_, i) => `uid${i}`), text: Array.from({length: 20}, (_, i) => `text${i}`),
            sort: 'seenAt', order: 'asc', limit: 10, offset: 0,
        } satisfies QueryPlaysOptsJson);
        expect(parsed.text).to.have.length(20);
        expect(parsed.queues).to.have.length(2);
    });

    it('throws instead of dropping params over the limit', function () {
        expect(() => parseQueryString({text: Array.from({length: 21}, (_, i) => `text${i}`)})).to.throw();
        expect(() => qs.parse(Array.from({length: 101}, (_, i) => `p${i}=1`).join('&'), qsOptions)).to.throw();
    });

    it('rejects an invalid date', function () {
        expect(() => parseQueryString({seenAt: {type: 'gte', date: 'yesterday'}})).to.throw();
    });
});
