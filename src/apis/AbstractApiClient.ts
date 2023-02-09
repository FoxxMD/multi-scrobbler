import {capitalize, createLabelledLogger} from "../utils";
import {Logger} from "winston";
import {PlayObject} from "../common/infrastructure/Atomic";

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
        this.logger = createLabelledLogger(identifier, identifier);
        this.config = config;
        this.options = options;
    }

    static formatPlayObj = (obj: any): PlayObject => {
        throw new Error('should be overridden');
    }
}
