import { expect } from 'chai';
import withLocalTmpDir from 'with-local-tmp-dir';
import { resolveAuthSettings, getOrCreateSecret } from '../../common/auth/authSettings.ts';

const http = new URL('http://localhost:9078');
const https = new URL('https://ms.example.com');

describe('Auth Settings', function () {

    it('defaults to optional mode, open hosts, insecure cookies', function () {
        const s = resolveAuthSettings({localUrl: http, hasDefinedBaseUrl: false, env: {}});
        expect(s.mode).eq('optional');
        expect(s.allowedHosts).eql(['*']);
        expect(s.hostsOpen).is.true;
        expect(s.secureCookies).is.false;
        expect(s.trustProxy).is.false;
    });

    it('uses secure cookies when base url is https', function () {
        expect(resolveAuthSettings({localUrl: https, hasDefinedBaseUrl: true, env: {}}).secureCookies).is.true;
        // generated (not user-defined) base url is never trusted for this
        expect(resolveAuthSettings({localUrl: https, hasDefinedBaseUrl: false, env: {}}).secureCookies).is.false;
    });

    it('env wins over config', function () {
        const s = resolveAuthSettings({
            localUrl: https,
            hasDefinedBaseUrl: true,
            config: {mode: 'disabled', allowedHosts: ['a.com'], secureCookies: false, trustProxy: false},
            env: {AUTH_MODE: 'optional', ALLOWED_HOSTS: 'b.com, c.com:9078', SECURE_COOKIES: 'true', TRUST_PROXY: 'true'}
        });
        expect(s.mode).eq('optional');
        expect(s.allowedHosts).eql(['b.com', 'c.com:9078']);
        expect(s.hostsOpen).is.false;
        expect(s.secureCookies).is.true;
        expect(s.trustProxy).is.true;
    });

    it('uses config when env is not set', function () {
        const s = resolveAuthSettings({localUrl: http, hasDefinedBaseUrl: false, config: {mode: 'disabled', allowedHosts: ['a.com']}, env: {}});
        expect(s.mode).eq('disabled');
        expect(s.allowedHosts).eql(['a.com']);
    });

    it('collapses any wildcard host list to open', function () {
        expect(resolveAuthSettings({localUrl: http, hasDefinedBaseUrl: false, env: {ALLOWED_HOSTS: 'a.com,*'}}).allowedHosts).eql(['*']);
    });

    it('rejects invalid AUTH_MODE', function () {
        expect(() => resolveAuthSettings({localUrl: http, hasDefinedBaseUrl: false, env: {AUTH_MODE: 'nope'}})).to.throw(/AUTH_MODE/);
    });

    it('parses AUTH_SETUP_TOKEN', function () {
        const base = {localUrl: http, hasDefinedBaseUrl: false};
        expect(resolveAuthSettings({...base, env: {}}).setupToken).is.undefined;
        expect(resolveAuthSettings({...base, env: {AUTH_SETUP_TOKEN: 'false'}}).setupToken).is.undefined;
        const generated = resolveAuthSettings({...base, env: {AUTH_SETUP_TOKEN: 'true'}});
        expect(generated.setupTokenGenerated).is.true;
        expect(generated.setupToken?.length).gte(10);
        const literal = resolveAuthSettings({...base, env: {AUTH_SETUP_TOKEN: 'myToken'}});
        expect(literal.setupTokenGenerated).is.false;
        expect(literal.setupToken).eq('myToken');
    });

    it('parses session expiration like retention durations', function () {
        const base = {localUrl: http, hasDefinedBaseUrl: false};
        const def = resolveAuthSettings({...base, env: {}});
        expect(def.sessionExpiresIn).eq(60 * 60 * 24 * 7);
        // unchanged from better-auth default
        expect(def.sessionUpdateAge).eq(60 * 60 * 24);

        expect(resolveAuthSettings({...base, env: {AUTH_SESSION_EXPIRES: '30 days'}}).sessionExpiresIn).eq(60 * 60 * 24 * 30);
        expect(resolveAuthSettings({...base, env: {AUTH_SESSION_EXPIRES: '3600'}}).sessionExpiresIn).eq(3600);
        expect(resolveAuthSettings({...base, env: {AUTH_SESSION_EXPIRES: 'PT2H'}}).sessionExpiresIn).eq(7200);
        expect(resolveAuthSettings({...base, config: {sessionExpires: '2 days'}, env: {}}).sessionExpiresIn).eq(60 * 60 * 48);
        expect(resolveAuthSettings({...base, config: {sessionExpires: 600}, env: {}}).sessionExpiresIn).eq(600);
        // env wins
        expect(resolveAuthSettings({...base, config: {sessionExpires: '2 days'}, env: {AUTH_SESSION_EXPIRES: '1 hour'}}).sessionExpiresIn).eq(3600);
    });

    it('short session lifetimes still slide', function () {
        const s = resolveAuthSettings({localUrl: http, hasDefinedBaseUrl: false, env: {AUTH_SESSION_EXPIRES: '1 hour'}});
        expect(s.sessionUpdateAge).lt(s.sessionExpiresIn);
        expect(s.sessionUpdateAge).eq(720);
    });

    it('rejects invalid or too short session expiration', function () {
        const base = {localUrl: http, hasDefinedBaseUrl: false};
        expect(() => resolveAuthSettings({...base, env: {AUTH_SESSION_EXPIRES: 'forever'}})).to.throw(/AUTH_SESSION_EXPIRES/);
        expect(() => resolveAuthSettings({...base, env: {AUTH_SESSION_EXPIRES: '10 seconds'}})).to.throw(/at least 60 seconds/);
    });

    it('persists a generated secret and prefers env', async function () {
        await withLocalTmpDir(async () => {
            const first = getOrCreateSecret({}, process.cwd());
            expect(first.length).gt(20);
            expect(getOrCreateSecret({}, process.cwd())).eq(first);
            expect(getOrCreateSecret({BETTER_AUTH_SECRET: 'fromEnv'}, process.cwd())).eq('fromEnv');
        }, {unsafeCleanup: true});
    });
});
