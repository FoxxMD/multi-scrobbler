import {childLogger, Logger} from "@foxxmd/logging";
import {AbstractApiOptions, FormatPlayObjectOptions} from "../infrastructure/Atomic.js";
import { PlayObject } from "../../../core/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";

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
        const identifier = `API - ${capitalize(this.type)} - ${name}`;
        const {
            logger: parentLogger,
            ...restOptions
        } =  options;
        this.logger = childLogger(parentLogger, identifier);
        this.config = config;
        this.options = restOptions;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        throw new Error('should be overridden');
    }
}
