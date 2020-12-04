import dayjs from "dayjs";
import {capitalize, createLabelledLogger} from "../utils.js";

export default class AbstractSource {

    name;
    type;

    config;
    clients;
    logger;

    constructor(type, name, config = {}, clients = []) {
        this.type = type;
        this.name = name;
        const identifier = `${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(identifier, identifier);
        this.config = config;
        this.clients = clients;
    }
}
