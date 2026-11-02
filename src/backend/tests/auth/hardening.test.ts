import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import { CLIENT_IP_HEADER, clientIpMiddleware } from '../../server/middleware.ts';

const ipEcho = (trustProxy: boolean) => {
    const app = express();
    app.use(clientIpMiddleware({trustProxy}));
    app.get('/', (req, res) => res.json({ip: req.headers[CLIENT_IP_HEADER] ?? null}));
    return app;
};

describe('Hardening', function () {

    describe('Client IP for rate limiting', function () {

        it('uses the connection address and ignores forged headers without TRUST_PROXY', async function () {
            const res = await request(ipEcho(false)).get('/')
                .set('X-Forwarded-For', '1.2.3.4')
                .set(CLIENT_IP_HEADER, '5.6.7.8');
            expect(res.body.ip).eq('127.0.0.1');
        });

        it('uses the right-most X-Forwarded-For entry with TRUST_PROXY', async function () {
            // client forged 1.2.3.4, proxy appended the real client 9.9.9.9
            const res = await request(ipEcho(true)).get('/')
                .set('X-Forwarded-For', '1.2.3.4, 9.9.9.9')
                .set(CLIENT_IP_HEADER, '5.6.7.8');
            expect(res.body.ip).eq('9.9.9.9');
        });

        it('falls back to the connection address with TRUST_PROXY but no proxy header', async function () {
            expect((await request(ipEcho(true)).get('/')).body.ip).eq('127.0.0.1');
        });
    });
});
