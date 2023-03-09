import {capitalize, mergeArr} from "../utils.js";
import {Logger} from "winston";
import {FormatPlayObjectOptions, PlayObject} from "../common/infrastructure/Atomic.js";
import winston from 'winston';

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

    constructor(type: any, name: any, config = {}, options = {}) {
        this.type = type;
        this.name = name;
        const identifier = `API - ${capitalize(this.type)} - ${name}`;
        this.logger = winston.loggers.get('app').child({labels: identifier}, mergeArr);
        this.config = config;
        this.options = options;
    }

    static formatPlayObj = (obj: any, options: FormatPlayObjectOptions): PlayObject => {
        throw new Error('should be overridden');
    }
}
