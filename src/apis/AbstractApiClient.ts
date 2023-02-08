import {capitalize, createLabelledLogger} from "../utils.js";

export default class AbstractApiClient {
    name;
    type;
    initialized = false;

    config;
    options;
    logger;

    client: any;
    workingCredsPath: any;
    redirectUri: any;

    constructor(type: any, name: any, config = {}, options = {}) {
        this.type = type;
        this.name = name;
        const identifier = `API - ${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(identifier, identifier);
        this.config = config;
        this.options = options;
    }

    static formatPlayObj = (obj: any) => {
        throw new Error('should be overridden');
    }
}
