import { childLogger, Logger } from "@foxxmd/logging";
import { PlayObject } from "../../../core/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { AbstractApiOptions, FormatPlayObjectOptions } from "../infrastructure/Atomic.js";

export default abstract class AbstractApiClient {
    name: string;
    type: string;
    initialized: boolean = false;

    config: object;
    options: object;
    logger: Logger;

    client: any;
    workingCredsPath?: string;
    redirectUri?: string;

    constructor(type: any, name: any, config = {}, options: AbstractApiOptions) {
        this.type = type;
        this.name = name;
        const {
            logger: parentLogger,
            ...restOptions
        } =  options;
        this.logger = childLogger(parentLogger, this.getIdentifier());
        this.config = config;
        this.options = restOptions;
    }

    protected getIdentifier() {
        return `API - ${capitalize(this.type)} - ${this.name}`;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        throw new Error('should be overridden');
    }
}
