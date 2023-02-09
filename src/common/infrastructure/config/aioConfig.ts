import {SourceRetryOptions} from "./source";
import {RequestRetryOptions} from "./common";
import {SourceAIOConfig} from "./source/sources";
import {ClientAIOConfig} from "./client/clients";

export interface AIOConfig {
    sourceDefaults?: SourceRetryOptions
    clientDefaults?: RequestRetryOptions
    sources?: SourceAIOConfig[]
    clients?: ClientAIOConfig[]
}
