import { expect } from 'chai';
import request from 'supertest';
import { setUserSetting } from '../common/auth/userSettings.ts';
import { getOwnerId } from '../common/auth/owner.ts';
import { publicDashboardEmbedSchema } from '../../core/UserSettings.ts';
import type { ServerLocals } from '../server/index.ts';
import { buildAuthApp } from './utils/authTestUtils.ts';

const enableEmbed = async (app: Awaited<ReturnType<typeof buildAuthApp>>, embed?: object, dashboardEnabled = true) => {
    const {db} = app.locals as ServerLocals;
    const ownerId = await getOwnerId(db);
    await setUserSetting(db, ownerId, 'publicDashboardEnabled', dashboardEnabled);
    await setUserSetting(db, ownerId, 'publicDashboardSettings', {refresh: true, ...(embed !== undefined ? {embed} : {})} as any);
}

/** app with a stand-in for vite-express, which serves html for every unmatched GET (tests never start vite) */
const buildApp = async () => {
    const app = await buildAuthApp();
    app.get('/{*splat}', (req, res) => {
        res.send('<html></html>');
    });
    return app;
}

describe('Public Dashboard Embed', function () {

    it('cannot be framed when embedding or the dashboard is disabled', async function () {
        const app = await buildApp();
        for (const [embed, enabled] of [[undefined, true], [{}, false]] as const) {
            await enableEmbed(app, embed, enabled);
            const res = await request(app).get('/embed');
            expect(res.headers['x-frame-options']).eq('DENY');
            expect(res.headers['content-security-policy']).eq("frame-ancestors 'none'");
            expect(res.headers['cache-control']).eq('no-store');
        }
    });

    it('can be framed by any site, or only allowed sites', async function () {
        const app = await buildApp();
        await enableEmbed(app, {});
        for (const path of ['/embed', '/embed.html', '/embed?type=now']) {
            const res = await request(app).get(path);
            expect(res.headers).to.not.have.property('x-frame-options');
            expect(res.headers['content-security-policy']).eq('frame-ancestors *');
        }
        await enableEmbed(app, {ancestors: ['https://blog.example.com', 'https://*.example.org']});
        expect((await request(app).get('/embed')).headers['content-security-policy']).eq('frame-ancestors https://blog.example.com https://*.example.org');
    });

    it('never allows framing anything else, which would be the full (logged in) dashboard', async function () {
        const app = await buildApp();
        await enableEmbed(app, {});
        for (const path of ['/', '/embed/', '/embed/settings', '/embedx', '/settings', '/api/dashboard']) {
            const res = await request(app).get(path);
            expect(res.headers['x-frame-options'], path).eq('DENY');
            expect(res.headers['content-security-policy'], path).eq("frame-ancestors 'none'");
        }
    });

    it('only accepts origins as allowed sites', function () {
        expect(publicDashboardEmbedSchema.parse({ancestors: [' HTTPS://Blog.Example.com:8443 ']}).ancestors).eql(['https://blog.example.com:8443']);
        for (const bad of ["https://a.com 'unsafe-inline'", 'https://a.com; script-src *', '*', 'https://a.com/path', 'javascript:alert(1)', 'a.com']) {
            expect(publicDashboardEmbedSchema.safeParse({ancestors: [bad]}).success, bad).eq(false);
        }
    });
});
