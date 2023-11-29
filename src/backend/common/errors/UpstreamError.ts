import {ErrorWithCause} from "pony-cause";
import {findCauseByFunc} from "../../utils";

export class UpstreamError<T = undefined> extends ErrorWithCause<T> {

    showStopper: boolean = false;

    constructor(message: string, options?: { cause?: T, showStopper?: boolean } | undefined) {
        super(message, options);
        const {showStopper = false} = options;
        this.showStopper = showStopper;
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
