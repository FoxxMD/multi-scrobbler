import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { Agent } from "@atproto/api";
import { MSCache } from "../../Cache.js";


export abstract class AbstractBlueSkyApiClient extends AbstractApiClient {

    declare config: TealClientData;

    agent!: Agent;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('blueSky', name, config, options);

        this.cache = getRoot().items.cache();
    }

    abstract initClient(): void;

    abstract restoreSession(): Promise<boolean>;
}