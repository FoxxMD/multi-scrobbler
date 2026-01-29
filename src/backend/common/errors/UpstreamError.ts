import { Response } from 'superagent';

import { findCauseByFunc } from "../../utils/ErrorUtils.js";

export type UpstreamErrorOptions = ErrorOptions & { showStopper?: boolean, response?: Response, responseBody?: object | string };

export class UpstreamError extends Error {

    showStopper: boolean = false;
    response?: Response
    responseBody?: object | string

    constructor(message: string, options?: UpstreamErrorOptions | undefined) {
        super(message, options);
        const {showStopper = false, response, responseBody} = options;
        this.showStopper = showStopper;
        this.response = response;
        this.responseBody = responseBody;
    }
}

export const hasUpstreamError = (err: any, showStopping?: boolean): boolean => {
    return findUpstreamError(err, showStopping) !== undefined;
}

export const findUpstreamError = (err: any, showStopping?: boolean): UpstreamError | undefined => {
    return findCauseByFunc(err, (e) => {
        if (e instanceof UpstreamError) {
            if (showStopping === undefined) {
                return true;
            } else {
                return e.showStopper === showStopping;
            }
        }
        return false;
    });
}