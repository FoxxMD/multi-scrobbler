import {ErrorWithCause} from "pony-cause";

export class UpstreamError<T = undefined> extends ErrorWithCause<T> {

    showStopper: boolean = false;

    constructor(message: string, options?: { cause?: T, showStopper?: boolean } | undefined) {
        super(message, options);
        const {showStopper = false} = options;
        this.showStopper = showStopper;
    }
}
