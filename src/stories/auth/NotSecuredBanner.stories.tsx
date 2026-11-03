import preview from "../../../.storybook/preview.js";
import React from 'react';
import { reactRouterParameters } from 'storybook-addon-remix-react-router';
import { NotSecuredBanner } from "../../client/components/auth/Auth.js";
import { authDecorators, setupStatus } from "./authMocks.js";

const meta = preview.meta({
    title: 'Auth/Not Secured Banner',
    component: NotSecuredBanner,
    parameters: {
        layout: 'padded',
        reactRouter: reactRouterParameters({routing: {path: '/', useStoryElement: true}}),
    },
    tags: ['autodocs'],
    decorators: authDecorators,
});

export const Lan = meta.story({
    args: {status: setupStatus()},
});

export const PublicIp = meta.story({
    args: {status: setupStatus({publicClient: true, host: 'ms.example.com'})},
});

export const UnrecognizedHost = meta.story({
    args: {status: setupStatus({hostRecognized: false, host: 'ms.mydomain.com'})},
});

export const PublicIpUnrecognizedHost = meta.story({
    args: {status: setupStatus({publicClient: true, hostRecognized: false, host: 'myhome.duckdns.org:9078'})},
});
