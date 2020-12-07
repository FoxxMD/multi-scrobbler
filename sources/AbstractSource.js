import dayjs from "dayjs";
import {capitalize, createLabelledLogger} from "../utils.js";

export default class AbstractSource {

    name;
    type;
    identifier;

    config;
    clients;
    logger;

    constructor(type, name, config = {}, clients = []) {
        this.type = type;
        this.name = name;
        this.identifier = `${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(this.identifier, this.identifier);
        this.config = config;
        this.clients = clients;
    }
}
