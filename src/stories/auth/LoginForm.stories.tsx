import preview from "../../../.storybook/preview.js";
import React from 'react';
import { reactRouterParameters } from 'storybook-addon-remix-react-router';
import { LoginForm } from "../../client/components/auth/Auth.js";
import { authDecorators, mockAuth, resetAuthState } from "./authMocks.js";

const meta = preview.meta({
    title: 'Auth/Login Form',
    component: LoginForm,
    parameters: {
        layout: 'padded',
        // mocks and auth state are per page, so docs must render each story in its own iframe
        docs: {story: {inline: false, iframeHeight: '450px'}},
        reactRouter: reactRouterParameters({location: {path: '/login'}, routing: {path: '/login', useStoryElement: true}}),
        // any submitted password is rejected
        msw: {handlers: mockAuth({status: {secured: true, passwordSet: true, isOwner: false}})},
    },
    tags: ['autodocs'],
    loaders: [resetAuthState],
    decorators: authDecorators,
});

export const Default = meta.story({});
