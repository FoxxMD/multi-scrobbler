import preview from "../../../.storybook/preview.js";
import { reactRouterParameters } from 'storybook-addon-remix-react-router';
import { AccountSettings } from "../../client/components/auth/Auth.js";
import { authDecorators, mockAuth, resetAuthState, sampleApiKeys } from "./authMocks.js";

const secured = {secured: true, passwordSet: true};

const meta = preview.meta({
    title: 'Auth/Account Settings',
    component: AccountSettings,
    beforeEach({ msw }) { msw.use(...mockAuth({status: secured, loggedIn: true, apiKeys: sampleApiKeys()})); },
    parameters: {
        layout: 'padded',
        // mocks and auth state are per page, so docs must render each story in its own iframe
        docs: {story: {inline: false, iframeHeight: '900px'}},
        reactRouter: reactRouterParameters({location: {path: '/settings'}, routing: {path: '/settings', useStoryElement: true}}),
    },
    tags: ['autodocs'],
    loaders: [resetAuthState],
    decorators: authDecorators,
});

export const LoggedIn = meta.story({});

export const NoApiKeys = meta.story({
    beforeEach({ msw }) { msw.use(...mockAuth({status: secured, loggedIn: true, sessions: 1})); },
});

export const SessionsNeedRecentLogin = meta.story({
    beforeEach({ msw }) { msw.use(...mockAuth({status: secured, loggedIn: true, sessionsNotFresh: true, apiKeys: sampleApiKeys()})); },
});

export const WrongCurrentPassword = meta.story({
    beforeEach({ msw }) { msw.use(...mockAuth({status: secured, loggedIn: true, apiKeys: sampleApiKeys(), submitError: 'Invalid password'})); },
});

export const NotLoggedIn = meta.story({
    beforeEach({ msw }) { msw.use(...mockAuth({status: secured})); },
});

export const NotSecured = meta.story({
    beforeEach({ msw }) { msw.use(...mockAuth()); },
});

export const AuthDisabled = meta.story({
    beforeEach({ msw }) { msw.use(...mockAuth({status: {mode: 'disabled'}})); },
});
