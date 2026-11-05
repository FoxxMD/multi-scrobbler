import preview from "../../../.storybook/preview.js";
import React from 'react';
import { reactRouterParameters } from 'storybook-addon-remix-react-router';
import { SetPasswordForm } from "../../client/components/auth/Auth.js";
import { authDecorators, mockAuth, resetAuthState } from "./authMocks.js";

const meta = preview.meta({
    title: 'Auth/Set Password Form',
    component: SetPasswordForm,
    parameters: {
        layout: 'padded',
        // mocks and auth state are per page, so docs must render each story in its own iframe
        docs: {story: {inline: false, iframeHeight: '750px'}},
        reactRouter: reactRouterParameters({location: {path: '/setup'}, routing: {path: '/setup', useStoryElement: true}}),
        msw: {handlers: mockAuth()},
    },
    tags: ['autodocs'],
    loaders: [resetAuthState],
    decorators: authDecorators,
});

export const NoTokenRequired = meta.story({});

export const TokenAlwaysRequired = meta.story({
    parameters: {msw: {handlers: mockAuth({status: {setupTokenRequired: true, setupTokenReason: 'configured', isOwner: false}})}},
});

export const TokenRequiredPublicIp = meta.story({
    parameters: {msw: {handlers: mockAuth({status: {setupTokenRequired: true, setupTokenReason: 'public_ip', publicClient: true, isOwner: false, host: 'ms.example.com'}})}},
});

export const TokenRequiredUnrecognizedHost = meta.story({
    parameters: {msw: {handlers: mockAuth({status: {setupTokenRequired: true, setupTokenReason: 'host', hostRecognized: false, isOwner: false, host: 'ms.mydomain.com'}})}},
});

export const InvalidToken = meta.story({
    parameters: {msw: {handlers: mockAuth({status: {setupTokenRequired: true, setupTokenReason: 'public_ip', publicClient: true, isOwner: false}, submitError: 'Invalid setup token'})}},
});
