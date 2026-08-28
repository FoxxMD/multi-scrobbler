import { NamedError } from "./MSErrors.ts";
import type { PlayProcessingResult } from "../infrastructure/PlayProcessing.ts";

export interface PlayProcessingErrorData extends PlayProcessingResult {
    showStopping: boolean
}

export class PlayProcessingError extends NamedError {
    override name = 'Play Processing Error';
    result: PlayProcessingResult
    showStopping: boolean

    constructor(error: Error, data: PlayProcessingErrorData, opts: ErrorOptions = {}) {
        super('Error occured while processing Play', {...opts, cause: error});
        this.result = data;
        this.showStopping = data.showStopping;
    }
}