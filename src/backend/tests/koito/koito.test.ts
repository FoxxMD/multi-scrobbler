import { loggerTest } from "@foxxmd/logging";
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { http, HttpResponse } from "msw";
import { KoitoApiClient } from "../../common/vendor/koito/KoitoApiClient.ts";
import { withRequestInterception } from "../utils/networking.ts";

const url = 'http://koito.test';
const emptyListens = {items: [], total_record_count: 0, items_per_page: 100, has_next_page: false, current_page: 1};

describe('Koito API', function () {

    it('Never queries listens with a 0 timestamp', async function () {
        const queries: URLSearchParams[] = [];
        await withRequestInterception([
            http.get(`${url}/apis/web/v1/listens`, ({request}) => {
                queries.push(new URL(request.url).searchParams);
                return HttpResponse.json(emptyListens);
            })
        ], async () => {
            const api = new KoitoApiClient('test', {url, token: 'abc', username: 'test'}, {logger: loggerTest});
            await api.getUserListens({from: 0, to: 0});
            await api.getUserListens({from: 0, to: 30540});
            await api.getUserListens({from: 1000, to: 2000});
            await api.getUserListens({});
        })();
        expect(queries.map(x => [x.get('from'), x.get('to')])).to.eql([
            ['1', '1'],
            ['1', '30540'],
            ['1000', '2000'],
            [null, null],
        ]);
    });
});
