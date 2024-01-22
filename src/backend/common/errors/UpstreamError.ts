import {ErrorWithCause} from "pony-cause";
import { findCauseByFunc } from "../../utils.js";
import {Response} from 'superagent';

export class UpstreamError<T = undefined> extends ErrorWithCause<T> {

    showStopper: boolean = false;
    response?: Response

    constructor(message: string, options?: { cause?: T, showStopper?: boolean, response?: Response } | undefined) {
        super(message, options);
        const {showStopper = false, response} = options;
        this.showStopper = showStopper;
        this.response = response;
    }
}

export const hasUpstreamError = (err: any, showStopping?: boolean): boolean => {
    return findCauseByFunc(err, (e) => {
        if (e instanceof UpstreamError) {
            if (showStopping === undefined) {
                return true;
            } else {
                return e.showStopper === showStopping;
            }
        }
        return false;
    }) !== undefined;
}
