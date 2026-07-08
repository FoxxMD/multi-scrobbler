import { type ComponentType } from "../../../../../core/Atomic.js"
import { type RequestRetryOptions } from "../common.js"
import { type ATProtoAppData, type ATProtoUserIdentifierData } from "./atproto.js"
import { type CommonClientConfig, type CommonClientData, type CommonClientOptions } from "./index.js"

export type TealData = RequestRetryOptions & ATProtoUserIdentifierData & Partial<ATProtoAppData> & {
        /**
     * The base URI of the Multi-Scrobbler to use for ATProto OAuth
     * 
     * Only include this if you want to use OAuth. The URI must be a non-IP/non-local domain using https: protocol.
    */
    baseUri?: string
}

export interface TealClientData extends TealData, CommonClientData {

}
export interface TealClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Tealfm as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: ComponentType
    data: TealClientData
    options?: TealClientOptions
}

export interface TealOptions {
}


export interface TealClientOptions extends TealOptions,CommonClientOptions {

}

export interface TealClientAIOConfig extends TealClientConfig {
    type: 'tealfm'
}

export interface ListRecord<T> {
  uri: string;
  cid: string;
  value: T;
}
export interface RecordOptions {
    web?: string;
    playId?: string;
    user?: string;
}
