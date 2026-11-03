import React from 'react';
import { http, HttpResponse, delay } from 'msw';
import { Container } from '@chakra-ui/react';
import { faker } from '@faker-js/faker';
import { withRouter } from 'storybook-addon-remix-react-router';
import { Provider, queryClient } from "../../client/components/Provider.js";
import { authClient, type SetupStatus } from "../../client/auth/authClient.js";

export const setupStatus = (overrides: Partial<SetupStatus> = {}): SetupStatus => ({
    mode: 'optional',
    secured: false,
    passwordSet: false,
    setupTokenRequired: false,
    publicClient: false,
    host: '192.168.0.101:9078',
    hostRecognized: true,
    isOwner: true,
    username: 'admin',
    ...overrides,
});

const user = {id: 'user1', name: 'admin', username: 'admin', email: 'admin@multi-scrobbler.local', emailVerified: false, createdAt: faker.date.past(), updatedAt: faker.date.recent()};

const fakeSession = (id: string) => ({
    id,
    token: `token-${id}`,
    userId: user.id,
    ipAddress: faker.internet.ipv4(),
    userAgent: faker.internet.userAgent(),
    createdAt: faker.date.recent({days: 7}),
    updatedAt: faker.date.recent({days: 1}),
    expiresAt: faker.date.soon({days: 7}),
});

const fakeApiKey = (name: string, scope: 'read' | 'write', used = true) => ({
    id: faker.string.uuid(),
    name,
    start: `ms_${faker.string.alphanumeric(4)}`,
    prefix: 'ms_',
    referenceId: user.id,
    enabled: true,
    metadata: {scope},
    createdAt: faker.date.recent({days: 30}),
    updatedAt: faker.date.recent({days: 30}),
    lastRequest: used ? faker.date.recent({days: 1}) : null,
});

export interface MockAuthOptions {
    status?: Partial<SetupStatus>
    loggedIn?: boolean
    sessions?: number
    /** list-sessions fails because the login is not recent enough */
    sessionsNotFresh?: boolean
    apiKeys?: ReturnType<typeof fakeApiKey>[]
    /** error message returned by setup/password and sign-in */
    submitError?: string
}

export const sampleApiKeys = () => [fakeApiKey('prometheus', 'read'), fakeApiKey('home-assistant', 'write'), fakeApiKey('backup-script', 'read', false)];

const authError = (message: string, code = 'ERROR', status = 400) => HttpResponse.json({message, code}, {status});

/** msw handlers for the auth API, stateful so creating/deleting keys and revoking sessions work in the story */
export const mockAuth = (opts: MockAuthOptions = {}) => {
    const {loggedIn = false, submitError} = opts;
    const status = setupStatus(opts.status);
    const sessions = [fakeSession('current'), ...Array.from({length: Math.max((opts.sessions ?? 3) - 1, 0)}, (_, i) => fakeSession(`other${i}`))];
    let keys = [...(opts.apiKeys ?? [])];
    let activeSessions = [...sessions];

    return [
        http.get('*/api/auth/setup/status', () => HttpResponse.json(status)),
        http.post('*/api/auth/setup/password', async () => {
            await delay(500);
            return submitError !== undefined ? HttpResponse.json({error: submitError}, {status: 403}) : HttpResponse.json({ok: true});
        }),
        http.post('*/api/auth/sign-in/username', async () => {
            await delay(500);
            return authError(submitError ?? 'Invalid username or password', 'INVALID_USERNAME_OR_PASSWORD', 401);
        }),
        http.get('*/api/auth/get-session', () => HttpResponse.json(loggedIn ? {session: sessions[0], user} : null)),
        http.post('*/api/auth/sign-out', () => HttpResponse.json({success: true})),
        http.post('*/api/auth/change-password', async () => {
            await delay(500);
            return submitError !== undefined ? authError(submitError, 'INVALID_PASSWORD') : HttpResponse.json({token: null, user});
        }),
        http.get('*/api/auth/list-sessions', () => opts.sessionsNotFresh
            ? authError('Session is not fresh', 'SESSION_NOT_FRESH', 403)
            : HttpResponse.json(activeSessions)),
        http.post('*/api/auth/revoke-session', async ({request}) => {
            const {token} = await request.json() as {token: string};
            await delay(300);
            activeSessions = activeSessions.filter((s) => s.token !== token);
            return HttpResponse.json({status: true});
        }),
        http.post('*/api/auth/revoke-other-sessions', async () => {
            await delay(300);
            activeSessions = activeSessions.filter((s) => s.id === sessions[0].id);
            return HttpResponse.json({status: true});
        }),
        http.get('*/api/auth/api-key/list', () => HttpResponse.json({apiKeys: keys, total: keys.length})),
        http.post('*/api/auth/api-key/create', async ({request}) => {
            const {name, metadata} = await request.json() as {name: string, metadata: {scope: 'read' | 'write'}};
            await delay(300);
            const key = {...fakeApiKey(name, metadata.scope, false), createdAt: new Date()};
            keys = [...keys, key];
            return HttpResponse.json({...key, key: `${key.start}${faker.string.alphanumeric(60)}`});
        }),
        http.post('*/api/auth/api-key/delete', async ({request}) => {
            const {keyId} = await request.json() as {keyId: string};
            await delay(300);
            keys = keys.filter((k) => k.id !== keyId);
            return HttpResponse.json({success: true});
        }),
    ];
}

/** Query cache and the better-auth session atom are module-level, reset them so each story starts from its own mocks */
export const resetAuthState = async () => {
    queryClient.clear();
    authClient.$store.notify('$sessionSignal');
    return {};
}

export const authDecorators = [
    withRouter,
    (Story: React.ComponentType) => (<Provider><Container fluid><Story/></Container></Provider>),
];
