import { expect } from 'chai';
import request from 'supertest';
import type { Express } from 'express';
import { buildAuthApp } from '../utils/authTestUtils.ts';
import type ScrobbleSources from '../../sources/ScrobbleSources.ts';
import { loggerTest } from '@foxxmd/logging';
import LastfmApiClient from '../../common/vendor/LastfmApiClient.ts';
import SpotifySource from '../../sources/SpotifySource.ts';
import { EventEmitter } from 'events';

/** Minimal stand-in for a component with an interactive auth flow. Only what the callback route uses. */
const fakeComponent = (type: string) => {
    const calls: unknown[] = [];
    const component = {
        type,
        name: `my${type}`,
        oauthState: 'originalState-abcdefghijk',
        rotations: 0,
        rotateOAuthState() {
            this.oauthState = `rotated-${++this.rotations}`;
        },
        errors: [] as Error[],
        logger: {error: () => undefined, warn: () => undefined, info: () => undefined},
        clearErrors: () => undefined,
        replaceErrors: () => undefined,
        poll: async () => undefined,
        initialize: async () => undefined,
        initScrobbleMonitoring: async () => undefined,
        authFailure: true,
        handleAuthCodeCallback: async (q: unknown) => { calls.push(q); return true; },
        api: {authenticate: async (token: unknown) => { calls.push(token); }},
        calls,
    };
    return component;
}

type Fake = ReturnType<typeof fakeComponent>;

const PROVIDERS: {name: string, type: string, path: string, query: Record<string, string>}[] = [
    {name: 'Spotify', type: 'spotify', path: '/api/callback', query: {code: 'theCode'}},
    {name: 'Mixcloud', type: 'mixcloud', path: '/api/mixcloud/callback', query: {name: 'mymixcloud', code: 'theCode'}},
    {name: 'YTMusic', type: 'ytmusic', path: '/api/ytmusic/callback', query: {name: 'myytmusic', code: 'theCode'}},
    {name: 'Last.fm', type: 'lastfm', path: '/api/lastfm/callback', query: {token: 'theToken'}},
    {name: 'Libre.fm', type: 'librefm', path: '/api/librefm/callback', query: {token: 'theToken'}},
];

describe('Auth callback state', function () {

    for (const p of PROVIDERS) {
        describe(p.name, function () {

            let app: Express;
            let component: Fake;

            beforeEach(async function () {
                component = fakeComponent(p.type);
                app = await buildAuthApp({}, async (sources: ScrobbleSources) => {
                    sources.sources.push(component as any);
                });
            });

            const get = (query: Record<string, string>) => request(app).get(p.path).query(query);

            it('rejects a callback without state', async function () {
                const res = await get(p.query);
                expect(res.status).eq(400);
                expect(component.calls).length(0);
            });

            it('rejects a callback with the wrong state', async function () {
                const res = await get({...p.query, state: 'attackerState-abcdefghijk'});
                expect(res.status).eq(400);
                expect(res.text).include('Start authentication again');
                expect(component.calls).length(0);
                expect(component.oauthState).eq('originalState-abcdefghijk');
            });

            it('accepts the matching state once, then rotates it', async function () {
                const ok = await get({...p.query, state: 'originalState-abcdefghijk'});
                expect(ok.status).not.eq(400);
                expect(component.calls).length(1);
                expect(component.oauthState).eq('rotated-1');

                // the same link can't be used again
                const replay = await get({...p.query, state: 'originalState-abcdefghijk'});
                expect(replay.status).eq(400);
                expect(component.calls).length(1);
            });
        });
    }

    describe('Auth urls carry the state', function () {

        it('Last.fm and Libre.fm put it in the callback url', function () {
            for (const [type, urlBase] of [['lastfm', undefined], ['librefm', 'https://libre.fm/2.0/']] as const) {
                const api = new LastfmApiClient('test', {apiKey: 'key', secret: 'secret', urlBase}, {localUrl: new URL('http://ms.local:9078'), configDir: 'test', dataDir: 'test', logger: loggerTest, version: 'test', type});
                const cb = new URL(new URL(api.getAuthUrl('theState')).searchParams.get('cb')!);
                expect(cb.pathname).eq(`/${type}/callback`);
                expect(cb.searchParams.get('state')).eq('theState');
            }
        });

        it('Last.fm keeps a custom redirect uri and replaces any state in it', function () {
            const api = new LastfmApiClient('test', {apiKey: 'key', secret: 'secret', redirectUri: 'https://ms.example.com/api/lastfm/callback?state=oldName'}, {localUrl: new URL('http://ms.local:9078'), configDir: 'test', dataDir: 'test', logger: loggerTest, version: 'test', type: 'lastfm'});
            const cb = new URL(new URL(api.getAuthUrl('theState')).searchParams.get('cb')!);
            expect(cb.origin + cb.pathname).eq('https://ms.example.com/api/lastfm/callback');
            expect(cb.searchParams.getAll('state')).eql(['theState']);
        });

        it('Spotify uses it as the OAuth state', function () {
            const source = new SpotifySource('test', {data: {clientId: 'id', clientSecret: 'secret'}} as any, {localUrl: new URL('http://test'), configDir: 'test', dataDir: 'test', logger: loggerTest, version: 'test'}, new EventEmitter());
            let given: unknown;
            (source as any).spotifyApi = {createAuthorizeURL: (_scopes: string[], state: string) => { given = state; return 'url'; }};
            source.createAuthUrl();
            expect(given).eq(source.oauthState);
        });

        it('is random per component', function () {
            const a = new SpotifySource('a', {data: {}} as any, {localUrl: new URL('http://test'), configDir: 'test', dataDir: 'test', logger: loggerTest, version: 'test'}, new EventEmitter());
            const b = new SpotifySource('b', {data: {}} as any, {localUrl: new URL('http://test'), configDir: 'test', dataDir: 'test', logger: loggerTest, version: 'test'}, new EventEmitter());
            expect(a.oauthState).not.eq(b.oauthState);
            expect(a.oauthState.length).gte(20);
            const before = a.oauthState;
            a.rotateOAuthState();
            expect(a.oauthState).not.eq(before);
        });
    });
});
