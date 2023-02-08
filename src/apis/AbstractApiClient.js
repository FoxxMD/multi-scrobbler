import {capitalize, createLabelledLogger} from "../utils.js";

export default class AbstractApiClient {
    name;
    type;
    initialized = false;

    config;
    options;
    logger;

    client;
    workingCredsPath;
    redirectUri;

    constructor(type, name, config = {}, options = {}) {
        this.type = type;
        this.name = name;
        const identifier = `API - ${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(identifier, identifier);
        this.config = config;
        this.options = options;
    }

    static formatPlayObj = obj => {
        throw new Error('should be overridden');
    }
}
